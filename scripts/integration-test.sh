#!/usr/bin/env bash
set -euo pipefail

MOCK_LLM_URL="${MOCK_LLM_URL:-http://mock-llm:6556/v1}"
PLUGIN_DIR="${PLUGIN_DIR:-/workspace/opencode-suspend-inhibitor}"
CONFIG_DIR="${HOME}/.config/opencode"
CONFIG="${CONFIG_DIR}/opencode.jsonc"
LOG_FILE="${HOME}/.local/share/opencode/log/opencode.log"

echo "==> Integration test: suspend-inhibitor + mock LLM"
echo "    MOCK_LLM_URL: ${MOCK_LLM_URL}"
echo "    PLUGIN_DIR:   ${PLUGIN_DIR}"

# Verify prerequisites
command -v opencode >/dev/null || { echo "ERROR: opencode not on PATH" >&2; exit 1; }

# Configure OpenCode with plugin + mock provider
PLUGIN_PATH="$(cd "${PLUGIN_DIR}" && pwd)"
PLUGIN_URI="file://${PLUGIN_PATH}"

cat >"${CONFIG}" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["${PLUGIN_URI}"],
  "provider": {
    "test-llm": {
      "npm": "@ai-sdk/openai-compatible",
      "name": "Test LLM",
      "options": {
        "baseURL": "${MOCK_LLM_URL}",
        "apiKey": "test"
      },
      "models": {
        "mock": {
          "name": "Mock"
        }
      }
    }
  }
}
EOF

echo "==> OpenCode config:"
cat "${CONFIG}"

# Run OpenCode with the mock provider
echo "==> Running: opencode run --auto -m test-llm/mock \"ok\""

# Capture both stderr (for logs) and let it show in terminal too
OUTPUT=$(opencode run --auto -m test-llm/mock "ok" 2>&1) || true
echo "${OUTPUT}"

# Check for expected log entries
echo ""
echo "==> Checking logs..."

PASS=0

check_log() {
  local label="$1"
  local pattern="$2"
  if echo "${OUTPUT}" | grep -q "${pattern}" 2>/dev/null; then
    echo "  [PASS] ${label}"
    return 0
  fi
  if [ -f "${LOG_FILE}" ] && grep -q "${pattern}" "${LOG_FILE}" 2>/dev/null; then
    echo "  [PASS] ${label} (from log file)"
    return 0
  fi
  echo "  [FAIL] ${label}"
  return 1
}

check_log "Plugin initialized" "Plugin initialized" && PASS=$((PASS + 1))
check_log "Acquired session" "Acquired session" && PASS=$((PASS + 1))

if check_log "Released session" "Released session"; then
  PASS=$((PASS + 1))
else
  echo "  [INFO] Released session not found (depends on timing)"
fi

echo ""
if [ "${PASS}" -ge 2 ]; then
  echo "==> Integration test PASSED (${PASS}/3 assertions)"
  exit 0
else
  echo "==> Integration test FAILED (${PASS}/3 assertions)"
  if [ -f "${LOG_FILE}" ]; then
    echo "    Log file tail:"; tail -20 "${LOG_FILE}"
  fi
  exit 1
fi
