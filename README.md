# opencode-suspend-inhibitor

<p align="center">
  <img src="docs/icon-moon.svg" alt="opencode-suspend-inhibitor" width="128">
</p>

[![npm version](https://img.shields.io/npm/v/opencode-suspend-inhibitor?style=flat-square)](https://www.npmjs.com/package/opencode-suspend-inhibitor)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://github.com/mscurtescu/opencode-suspend-inhibitor/blob/main/LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white&style=flat-square)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-000000?logo=bun&logoColor=white&style=flat-square)](https://bun.sh/)
[![Linux + GNOME](https://img.shields.io/badge/Platform-Linux%20%2B%20GNOME-0078D4?style=flat-square)](https://github.com/mscurtescu/opencode-suspend-inhibitor)

Prevents Linux/GNOME from suspending or idling the screen while an OpenCode agent session is actively running. Releases the inhibitor the moment all sessions go idle or error. Supports multiple parallel OpenCode instances.

## Install

Published on npm: [opencode-suspend-inhibitor](https://www.npmjs.com/package/opencode-suspend-inhibitor)

Add to `~/.config/opencode/opencode.json` or `opencode.jsonc` (merge into your existing config):

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  // ... your other settings ...
  "plugin": ["opencode-suspend-inhibitor"]
}
```

Restart OpenCode.

## Alternatives

Several OpenCode plugins prevent sleep while the agent is busy. Pick by platform and desktop environment:

| Plugin | npm / repo | Platforms | Mechanism | Notes |
|--------|------------|-----------|-----------|-------|
| **This plugin** | [`opencode-suspend-inhibitor`](https://www.npmjs.com/package/opencode-suspend-inhibitor) · [GitHub](https://github.com/mscurtescu/opencode-suspend-inhibitor) | Linux + GNOME | `gnome-session-inhibit` (`suspend:idle`) | Multi-instance via session files; `--app-id ai.opencode.desktop` |
| [opencode-sleep-inhibitor](https://www.npmjs.com/package/opencode-sleep-inhibitor) | [`opencode-sleep-inhibitor`](https://www.npmjs.com/package/opencode-sleep-inhibitor) · [GitHub](https://github.com/jvalduvieco/opencode_sleep_inhibitor_plugin) | Linux (systemd), macOS | `systemd-inhibit` / `caffeinate -dis` | Cross-platform; treats any `status.type !== "idle"` as active |
| [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) | [`opencode-wakelock`](https://www.npmjs.com/package/opencode-wakelock) · [GitHub](https://github.com/IgnisDa/opencode-wakelock) | macOS only | `caffeinate -i` | Multi-instance via session files |

## Platform support

| Platform                      | Status | Alternative |
|-------------------------------|--------|-------------|
| Linux + GNOME Session Manager | Supported | — |
| Linux + systemd (non-GNOME)   | Not supported | [opencode-sleep-inhibitor](https://github.com/jvalduvieco/opencode_sleep_inhibitor_plugin) |
| macOS                         | Not supported | [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) or [opencode-sleep-inhibitor](https://github.com/jvalduvieco/opencode_sleep_inhibitor_plugin) |
| Windows                       | Not supported | — |

## Requirements

- Linux with GNOME Session Manager
- `gnome-session-inhibit` on `PATH` (Debian/Ubuntu: package `gnome-session-bin`)
- OpenCode >= 1.14.0

## How it works

Hooks into OpenCode session lifecycle events:

| Event | Condition | Action |
|-------|-----------|--------|
| `session.status` | `status.type: "busy"` | Register session; start inhibitor if needed |
| `session.status` | `status.type: "idle"` | Deregister session; stop inhibitor when none remain |
| `session.idle` | — | Deregister session; stop inhibitor when none remain |
| `session.error` | — | Deregister session; stop inhibitor when none remain |

When at least one session is active, the plugin runs:

```bash
gnome-session-inhibit \
  --inhibit-only \
  --inhibit suspend:idle \
  --reason "OpenCode Agent is actively working" \
  --app-id ai.opencode.desktop
```

This blocks system suspend and idle screen lock/dim while the agent is busy.

## Features

- **Multi-instance safe**: Multiple OpenCode instances can run in parallel without conflicts
- **Automatic cleanup**: Stale session files from crashed instances are pruned when the recorded PID is dead
- **Efficient**: One shared `gnome-session-inhibit` process across all instances
- **Graceful no-op**: On non-Linux or when the binary is missing, the plugin loads but does nothing (one warning in logs)

## Multi-instance

Session state is tracked via files in `/tmp/opencode-suspend-inhibitor/sessions/`. Each file is named by OpenCode `sessionID` and stores the owning OpenCode process PID. A single `gnome-session-inhibit` process is shared across all OpenCode instances on the machine; it stops only when no active sessions remain.

## Development

See [DEVELOPMENT.md](DEVELOPMENT.md) for project setup, testing, build workflow, issue tracking (beads), and AI agent conventions. See [CHANGELOG.md](CHANGELOG.md) for release history.

## Related

- [OpenCode plugins](https://opencode.ai/docs/plugins)