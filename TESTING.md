# Testing opencode-suspend-inhibitor

## Automated smoke test

From the repo root (`mise install` provides `task`, `bun`, `bd`):

```bash
task test
```

Or directly:

```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

Covers: TypeScript typecheck, `gnome-session-inhibit` on PATH, session registry acquire/release.

## Dev container (integration test environment)

Reproducible Linux environment for integration testing and Docker-based development. One Dockerfile per profile (`docker/Dockerfile.<profile>`); default is Ubuntu 24.04 (`ubuntu2404`).

**Requires:** Docker

```bash
task container:build              # build image
task container:verify             # non-interactive smoke inside container
task container:run                # interactive shell, repo mounted at /workspace/opencode-suspend-inhibitor
```

`container:run` depends on `container:build`. `container:verify` runs the in-container verify script non-interactively.

Inside the container:

- Repo is mounted at `/workspace/opencode-suspend-inhibitor`
- `~/.config/opencode/opencode.jsonc` points at `file:///workspace/opencode-suspend-inhibitor`
- `gnome-session-inhibit` and `opencode` (curl installer) are on `PATH`
- No Node/npm/Bun in the container — OpenCode bundles what it needs for plugins

Add another distro: copy `docker/Dockerfile.ubuntu2404` (see `docker/README.md`).

## Dev plugin (`file://`) vs published npm

OpenCode loads plugins from `~/.config/opencode/opencode.jsonc`. Two modes:

| Config entry | Source |
|--------------|--------|
| `"opencode-suspend-inhibitor"` | Published npm package (`~/.cache/opencode/node_modules/`) |
| `"file:///…/opencode-suspend-inhibitor"` | Local git clone (live dev) |

Use **one** entry at a time — do not list both.

### `opencode plugin` (npm only)

```bash
opencode plugin opencode-suspend-inhibitor      # install + add to project opencode.jsonc
opencode plugin -g opencode-suspend-inhibitor   # install + add to ~/.config/opencode/opencode.jsonc
opencode plugin -f opencode-suspend-inhibitor   # force reinstall (e.g. after npm publish)
```

This command installs from **npm** and writes the package name into config. It does **not** support `file://` paths — use manual config edit below for local clone dev.

Running `opencode plugin …` while testing a `file://` entry will replace it with the npm package name.

### Switch to local clone

Edit `~/.config/opencode/opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    "file:///path/to/opencode-suspend-inhibitor"
  ]
}
```

Use the absolute path to your clone (three slashes after `file:`). Example:

`file:///home/marius/Work/iden2/github.com/mscurtescu/opencode-sleep-inhibitor`

**Restart OpenCode** after changing config. Plugins load at startup only; edit `index.ts`, restart, re-test.

### Switch back to published npm

Either edit config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-suspend-inhibitor"]
}
```

Or run `opencode plugin opencode-suspend-inhibitor` (or `-f` to refresh the cache after a new publish).

Restart OpenCode. It uses the cached npm install from `~/.cache/opencode/node_modules/`.

### Updating after npm publish

OpenCode **caches** npm plugins under `~/.cache/opencode/packages/`. The resolved version is pinned in that cache (e.g. `"opencode-suspend-inhibitor": "0.0.1"`). **Restart alone does not check npm for a newer version.**

| Action | Fetches new npm version? |
|--------|--------------------------|
| Restart OpenCode | No — uses cached copy |
| `opencode plugin opencode-suspend-inhibitor` (no `-f`) | Usually no — skips if already installed |
| `opencode plugin -f opencode-suspend-inhibitor` | Yes — force reinstall from npm |
| Delete `~/.cache/opencode/packages/opencode-suspend-inhibitor*` + restart | Yes — fresh install |

Using `@latest` in config (e.g. `"opencode-suspend-inhibitor@latest"`) still resolves **once at install time** and then caches that version. It does not re-resolve on every restart.

**After a new publish**, refresh and restart:

```bash
opencode plugin -f opencode-suspend-inhibitor
# restart OpenCode
cat ~/.cache/opencode/packages/opencode-suspend-inhibitor/package.json
```

Check the `dependencies` version matches what you published.

**Maintainer publish flow** (brief):

1. Bump `version` in `package.json`, update `CHANGELOG.md`
2. `npm publish --access public`
3. `git tag vX.Y.Z && git push origin main --tags`
4. Users run `opencode plugin -f opencode-suspend-inhibitor` and restart OpenCode

While developing unreleased changes, use the **`file://` config** above — no publish or `-f` needed; restart after edits.

### Verify which plugin loaded

```bash
opencode debug info
grep 'plugin=opencode-suspend-inhibitor' ~/.local/share/opencode/log/opencode.log | tail -5
```

After code changes on `file://`, confirm new log behavior (e.g. `plugin=opencode-suspend-inhibitor` on every line) before assuming the clone is active.

## OpenCode integration (manual)

Requires the **dev `file://` config** above (or publish to npm and use the package name). Restart OpenCode after any config change.

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

OpenCode flattens `extra` fields onto log lines. Every entry from this plugin includes `plugin=opencode-suspend-inhibitor` and `backend=gnome`:

```bash
grep 'plugin=opencode-suspend-inhibitor' ~/.local/share/opencode/log/opencode.log
grep 'Plugin initialized' ~/.local/share/opencode/log/opencode.log
```