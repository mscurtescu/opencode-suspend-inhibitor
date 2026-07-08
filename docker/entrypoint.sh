#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="${PLUGIN_DIR:-/workspace/opencode-suspend-inhibitor}"
OPENCODE_CONFIG_DIR="${HOME}/.config/opencode"
OPENCODE_CONFIG="${OPENCODE_CONFIG_DIR}/opencode.jsonc"

mkdir -p "${OPENCODE_CONFIG_DIR}"

if [[ ! -d "${PLUGIN_DIR}" ]]; then
  echo "Plugin directory not mounted: ${PLUGIN_DIR}" >&2
  echo "Run the container with -v \"\$REPO:/workspace/opencode-suspend-inhibitor\"" >&2
  exit 1
fi

# Normalize to absolute path with file:// URL (three slashes).
PLUGIN_PATH="$(cd "${PLUGIN_DIR}" && pwd)"
PLUGIN_URI="file://${PLUGIN_PATH}"

cat >"${OPENCODE_CONFIG}" <<EOF
{
  "\$schema": "https://opencode.ai/config.json",
  "plugin": ["${PLUGIN_URI}"]
}
EOF

echo "==> OpenCode config: ${OPENCODE_CONFIG}"
echo "    plugin: ${PLUGIN_URI}"

exec "$@"