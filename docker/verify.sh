#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="${PLUGIN_DIR:-/workspace/opencode-suspend-inhibitor}"

echo "==> Verify container toolchain"
command -v gnome-session-inhibit >/dev/null
gnome-session-inhibit --version 2>/dev/null || true

command -v opencode >/dev/null
opencode --version

echo "==> Verify plugin mount"
[[ -f "${PLUGIN_DIR}/index.ts" ]] || {
  echo "Missing ${PLUGIN_DIR}/index.ts" >&2
  exit 1
}

echo "==> Verify OpenCode config"
opencode debug config 2>&1 | head -20

echo "==> Verify plugin appears in debug config"
if ! opencode debug config 2>&1 | grep -q "opencode-suspend-inhibitor"; then
  echo "Plugin path not found in opencode debug config" >&2
  opencode debug config >&2 || true
  exit 1
fi

echo "container verify passed"