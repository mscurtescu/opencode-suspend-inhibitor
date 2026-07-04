# opencode-suspend-inhibitor

[![npm version](https://img.shields.io/npm/v/opencode-suspend-inhibitor.svg)](https://www.npmjs.com/package/opencode-suspend-inhibitor)

Prevents Linux/GNOME from suspending or idling the screen while an OpenCode agent session is actively running. Releases the inhibitor the moment all sessions go idle or error. Supports multiple parallel OpenCode instances.

Linux/GNOME counterpart to [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) (macOS).

> **Naming:** The npm package [`opencode-sleep-inhibitor`](https://www.npmjs.com/package/opencode-sleep-inhibitor) is already published by another author (cross-platform `systemd-inhibit` / `caffeinate`). This plugin is **`opencode-suspend-inhibitor`** — GNOME `gnome-session-inhibit` with `suspend:idle`.

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

Restart OpenCode. OpenCode installs the package from npm into `~/.cache/opencode/node_modules/`.

## Alternatives

Several OpenCode plugins prevent sleep while the agent is busy. Pick by platform and desktop environment:

| Plugin | npm / repo | Platforms | Mechanism | Notes |
|--------|------------|-----------|-----------|-------|
| **This plugin** | [`opencode-suspend-inhibitor`](https://www.npmjs.com/package/opencode-suspend-inhibitor) · [GitHub](https://github.com/mscurtescu/opencode-suspend-inhibitor) | Linux + GNOME | `gnome-session-inhibit` (`suspend:idle`) | Multi-instance via session files; `--app-id ai.opencode.desktop` |
| [opencode-sleep-inhibitor](https://www.npmjs.com/package/opencode-sleep-inhibitor) | [`opencode-sleep-inhibitor`](https://www.npmjs.com/package/opencode-sleep-inhibitor) · [GitHub](https://github.com/jvalduvieco/opencode_sleep_inhibitor_plugin) | Linux (systemd), macOS | `systemd-inhibit` / `caffeinate -dis` | Cross-platform; treats any `status.type !== "idle"` as active |
| [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) | [`opencode-wakelock`](https://www.npmjs.com/package/opencode-wakelock) · [GitHub](https://github.com/IgnisDa/opencode-wakelock) | macOS only | `caffeinate -i` | Multi-instance via session files |
| [opencode-session-guard](https://www.npmjs.com/package/opencode-session-guard) | [`opencode-session-guard`](https://www.npmjs.com/package/opencode-session-guard) · [GitHub](https://github.com/feanor5555/opencode-session-guard) | All | Token limits | Unrelated — enforces context/token thresholds, not power management |

**Choose this plugin** if you run GNOME on Linux and want suspend/idle inhibition via the session manager (visible in `gnome-session-inhibit --list`). **Choose [opencode-sleep-inhibitor](https://github.com/jvalduvieco/opencode_sleep_inhibitor_plugin)** for systemd-based Linux or a single cross-platform package. **Choose [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock)** on macOS.

## Platform support

| Platform | Status | Alternative |
|----------|--------|-------------|
| Linux + GNOME Session Manager | Supported | — |
| Linux (systemd, non-GNOME) | Not supported | [opencode-sleep-inhibitor](https://github.com/jvalduvieco/opencode_sleep_inhibitor_plugin) |
| Linux (no `gnome-session-inhibit`) | Loads, no-op + one log warning | — |
| macOS | Not supported | [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) or [opencode-sleep-inhibitor](https://github.com/jvalduvieco/opencode_sleep_inhibitor_plugin) |
| Windows | Not supported | — |

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

## Dev install

For local development before publish, point at a clone with a `file://` URL:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///path/to/opencode-suspend-inhibitor"]
}
```

See [TESTING.md](TESTING.md) for smoke tests and OpenCode verification steps.

## Troubleshooting

**Check whether an inhibitor is active:**

```bash
gnome-session-inhibit --list
```

While an agent is busy, expect an entry with app-id `ai.opencode.desktop` and reason `OpenCode Agent is actively working`.

**Plugin logs:** OpenCode flattens `extra` fields onto log lines (`plugin=opencode-suspend-inhibitor`, `backend=gnome`). Filter:

```bash
grep 'plugin=opencode-suspend-inhibitor' ~/.local/share/opencode/log/opencode.log
```

On startup you should see `Plugin initialized` with `available=true`. If `gnome-session-inhibit` is missing, you get a single warning with `available=false`.

**Session files while busy:** `/tmp/opencode-suspend-inhibitor/sessions/`

**Inhibitor stuck after a crash:** Restart OpenCode (startup cleanup prunes stale sessions) or remove orphaned files under `/tmp/opencode-suspend-inhibitor/sessions/` and run `gnome-session-inhibit --list` again.

## Related

- [OpenCode plugins](https://opencode.ai/docs/plugins)