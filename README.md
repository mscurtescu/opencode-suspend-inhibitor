# opencode-sleep-inhibitor

Prevents Linux/GNOME from sleeping, suspending, or idling the screen while an OpenCode agent session is actively running. Releases the inhibitor the moment all sessions go idle or error. Supports multiple parallel OpenCode instances.

Linux/GNOME counterpart to [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) (macOS).

## Install

Add to your `opencode.json` (or `opencode.jsonc`):

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-sleep-inhibitor"]
}
```

Restart OpenCode. OpenCode installs the package from npm into `~/.cache/opencode/node_modules/`.

## Platform support

| Platform | Status | Alternative |
|----------|--------|-------------|
| Linux + GNOME Session Manager | Supported | — |
| Linux (non-GNOME, no `gnome-session-inhibit`) | Loads, no-op + one log warning | — |
| macOS | Not supported | [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) |
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

Session state is tracked via files in `/tmp/opencode-sleep-inhibitor/sessions/`. Each file is named by OpenCode `sessionID` and stores the owning OpenCode process PID. A single `gnome-session-inhibit` process is shared across all OpenCode instances on the machine; it stops only when no active sessions remain.

## Dev install

For local development before publish, point at a clone with a `file://` URL:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["file:///path/to/opencode-sleep-inhibitor"]
}
```

See [TESTING.md](TESTING.md) for smoke tests and OpenCode verification steps.

## Troubleshooting

**Check whether an inhibitor is active:**

```bash
gnome-session-inhibit --list
```

While an agent is busy, expect an entry with app-id `ai.opencode.desktop` and reason `OpenCode Agent is actively working`.

**Plugin logs:** OpenCode logs use service `sleep-inhibitor` with `backend: "gnome"` in structured `extra` fields. On startup you should see `Plugin initialized` with `available: true`. If `gnome-session-inhibit` is missing, you get a single warning with `available: false`.

**Session files while busy:** `/tmp/opencode-sleep-inhibitor/sessions/`

**Inhibitor stuck after a crash:** Restart OpenCode (startup cleanup prunes stale sessions) or remove orphaned files under `/tmp/opencode-sleep-inhibitor/sessions/` and run `gnome-session-inhibit --list` again.

## Related

- [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) — macOS sleep prevention
- [OpenCode plugins](https://opencode.ai/docs/plugins)