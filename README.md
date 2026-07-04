# opencode-sleep-inhibitor

Prevent sleep and idle suspend while an OpenCode agent session is busy. Linux/GNOME counterpart to [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) (macOS).

## Install

Add to `opencode.json`:

```json
{
  "plugin": ["opencode-sleep-inhibitor"]
}
```

Restart OpenCode.

## Requirements

- Linux with GNOME Session Manager
- `gnome-session-inhibit` (package `gnome-session-bin` on Debian/Ubuntu)

On other platforms or when the binary is missing, the plugin loads but does nothing
(one warning in OpenCode logs). macOS users should use
[opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock).

## How it works

On `session.status` busy, the plugin registers the session and runs `gnome-session-inhibit` (suspend + idle). On idle or error, it deregisters; the inhibitor stops when no sessions remain.

## Multi-instance

Session state is tracked via files in `/tmp/opencode-sleep-inhibitor/sessions/`. Each file is named by OpenCode `sessionID` and stores the owning OpenCode process PID. A single `gnome-session-inhibit` process is shared across all OpenCode instances on the machine; it stops only when no active sessions remain. Stale session files from crashed instances are pruned automatically when the recorded PID is no longer running.

## Dev install

```json
{
  "plugin": ["file:///path/to/opencode-sleep-inhibitor"]
}
```

See [TESTING.md](TESTING.md) for smoke tests and OpenCode verification steps.

## Related

- [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) — macOS
- [OpenCode plugins](https://opencode.ai/docs/plugins)