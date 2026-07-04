# Testing opencode-suspend-inhibitor

## Automated smoke test

From the repo root (requires `mise install` / `bun` on PATH):

```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

Covers: TypeScript typecheck, `gnome-session-inhibit` on PATH, session registry acquire/release.

## OpenCode integration (manual)

Add the dev plugin to `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file:///home/marius/Work/iden2/github.com/mscurtescu/opencode-sleep-inhibitor"
  ]
}
```

Restart OpenCode after changing config.

### 1. Busy → inhibitor active

1. Start an agent session and trigger busy state (run a task).
2. In a terminal:

   ```bash
   gnome-session-inhibit --list
   ```

3. Expect an entry with app-id `ai.opencode.desktop` and reason `OpenCode Agent is actively working`.

### 2. Idle → inhibitor released

1. Wait for session idle (or cancel/stop the task).
2. Run `gnome-session-inhibit --list` again — OpenCode inhibitor should be gone.

### 3. Multi-instance

1. Open two OpenCode instances (or two sessions busy at once).
2. Confirm inhibitor stays active while either is busy.
3. Release one instance — inhibitor should **remain**.
4. Release both — inhibitor should stop.

Session files (while busy): `/tmp/opencode-suspend-inhibitor/sessions/`

### 4. Missing binary (no-op)

Temporarily hide the binary, restart OpenCode, trigger busy:

```bash
sudo mv /usr/bin/gnome-session-inhibit /usr/bin/gnome-session-inhibit.bak
# restart OpenCode, trigger busy, check logs for single warn (available: false)
sudo mv /usr/bin/gnome-session-inhibit.bak /usr/bin/gnome-session-inhibit
```

No inhibitor should appear in `gnome-session-inhibit --list`.

## Logs

OpenCode plugin logs use service `sleep-inhibitor` with `backend: "gnome"` in structured `extra` fields.