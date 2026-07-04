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

## How it works

On `session.status` busy, the plugin registers the session and runs `gnome-session-inhibit` (suspend + idle). On idle or error, it deregisters; the inhibitor stops when no sessions remain. Session state lives under `/tmp/opencode-sleep-inhibitor/sessions/`.

## Dev install

```json
{
  "plugin": ["file:///path/to/opencode-sleep-inhibitor"]
}
```

## Related

- [opencode-wakelock](https://github.com/IgnisDa/opencode-wakelock) — macOS
- [OpenCode plugins](https://opencode.ai/docs/plugins)