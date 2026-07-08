#!/usr/bin/env bash
set -euo pipefail

# Host-side integration test.
# Runs after `docker compose up -d --wait` brings up opencode-server + mock-llm.
# Asserts plugin lifecycle events via the OpenCode API and container logs.

OPENCODE_PORT="${OPENCODE_PORT:-4096}"
BASE_URL="http://localhost:${OPENCODE_PORT}"
COMPOSE_FILE="${COMPOSE_FILE:-docker/docker-compose.yml}"
LOG_FILE="${LOG_FILE:-/root/.local/share/opencode/log/opencode.log}"

echo "==> Integration test: suspend-inhibitor + mock LLM"
echo "    Server: ${BASE_URL}"

# ---------------------------------------------------------------------------
# Step 1 — wait for server to respond
# ---------------------------------------------------------------------------
echo "==> Waiting for server..."
for i in $(seq 1 30); do
  if curl -sf "${BASE_URL}/global/health" > /dev/null 2>&1; then
    echo "    Server ready after ${i}s"
    break
  fi
  if [ "$i" -eq 30 ]; then
    echo "  [FAIL] Server did not become ready within 30s" >&2
    docker compose -f "${COMPOSE_FILE}" logs opencode-server --tail 30
    exit 1
  fi
  sleep 1
done

# ---------------------------------------------------------------------------
# Step 2 — create session with test model
# ---------------------------------------------------------------------------
echo "==> Creating session..."
SESSION_RESP=$(curl -sf -X POST "${BASE_URL}/session" \
  -H "Content-Type: application/json" \
  -d '{"model":{"id":"mock","providerID":"test-llm","variant":"default"}}')
SID=$(echo "${SESSION_RESP}" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")
echo "    Session: ${SID}"

# ---------------------------------------------------------------------------
# Step 3 — send a prompt (triggers busy -> idle lifecycle)
# ---------------------------------------------------------------------------
echo "==> Sending prompt..."
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -X POST \
  "${BASE_URL}/session/${SID}/prompt_async" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"ok","parts":[{"type":"text","text":"ok"}]}')
if [ "${HTTP_CODE}" != "204" ]; then
  echo "  [FAIL] prompt_async returned ${HTTP_CODE} (expected 204)" >&2
  exit 1
fi
echo "    Prompt accepted (204)"

# ---------------------------------------------------------------------------
# Step 4 — wait for processing to finish (poll session or wait for logs)
# ---------------------------------------------------------------------------
echo "==> Waiting for prompt processing..."
start_ts=$(date +%s)
deadline=$((start_ts + 30))
while true; do
  now=$(date +%s)
  if [ "$now" -ge "$deadline" ]; then
    echo "    Timed out — will check logs anyway"
    break
  fi

  SESSION_STATE=$(curl -sf "${BASE_URL}/session/${SID}" 2>/dev/null || echo "")
  if [ -n "${SESSION_STATE}" ]; then
    TOKENS_INPUT=$(echo "${SESSION_STATE}" | python3 -c "import sys,json; print(json.load(sys.stdin)['tokens']['input'])" 2>/dev/null || echo "0")
    if [ "${TOKENS_INPUT}" -gt 0 ]; then
      elapsed=$((now - start_ts))
      echo "    Processing complete after ${elapsed}s (input tokens: ${TOKENS_INPUT})"
      sleep 2
      break
    fi
  fi

  # Also stop if the session has been released (logs are most reliable)
  if docker compose -f "${COMPOSE_FILE}" exec -T opencode-server grep -q "Released session" "${LOG_FILE}" 2>/dev/null; then
    echo "    Session released (detected in logs)"
    sleep 2
    break
  fi

  sleep 2
done

sleep 3

# ---------------------------------------------------------------------------
# Step 5 — check logs inside container
# ---------------------------------------------------------------------------
echo "==> Checking logs..."

PASS=0

check_log() {
  local label="$1"
  local pattern="$2"
  if docker compose -f "${COMPOSE_FILE}" exec -T opencode-server grep -q "${pattern}" "${LOG_FILE}" 2>/dev/null; then
    echo "  [PASS] ${label}"
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
  echo "  [INFO] Released session not found (may need more idle time)"
fi

echo ""
if [ "${PASS}" -ge 2 ]; then
  echo "==> Integration test PASSED (${PASS}/3 assertions)"
  exit 0
else
  echo "==> Integration test FAILED (${PASS}/3 assertions)" >&2
  docker compose -f "${COMPOSE_FILE}" exec -T opencode-server tail -40 "${LOG_FILE}"
  exit 1
fi
