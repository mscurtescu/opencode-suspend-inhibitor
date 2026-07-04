#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

echo "==> Typecheck"
bunx tsc --noEmit

echo "==> gnome-session-inhibit"
command -v gnome-session-inhibit >/dev/null
gnome-session-inhibit --version 2>/dev/null || true

echo "==> Session registry"
bun scripts/verify-sessions.ts

echo "==> Current inhibitors (baseline)"
gnome-session-inhibit --list 2>/dev/null || echo "(none or unavailable)"

echo "smoke-test.sh passed"