# Development

## Project setup

Prerequisites: [mise](https://mise.jdx.dev/) pins `task`, `bun`, and `bd` (beads).

```bash
git clone <repo-url>
cd opencode-suspend-inhibitor
mise install          # pins task, bun, bd
bun install           # dev dependencies
```

Typecheck and build:

```bash
task typecheck        # bunx tsc --noEmit
task build            # bunx tsc → dist/
```

The npm package ships compiled JS from `dist/`. `npm run build` (or `task build`) regenerates it. `prepublishOnly` runs the build automatically before `npm publish`.

## Testing

### Unit tests

Headless unit tests for plugin core logic — no `gnome-session-inhibit` binary, display, or real `/tmp` writes required. CI-friendly.

```bash
task test:unit        # via Taskfile
bun test              # directly
```

Covers: session registry (acquire/release, stale-PID pruning, `startupCleanup`), gnome backend (`isLinux`, `resolveAvailability` + caching, `syncInhibitor` start/stop/dedup, pid-file lifecycle), plugin entry (no-op branches, init logging, event routing for `session.status`/`session.idle`/`session.error`/missing sessionID).

### Smoke tests

```bash
task test:smoke
```

Or directly:

```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

Covers: TypeScript typecheck, `gnome-session-inhibit` on PATH, session registry acquire/release.

### Run both

```bash
task test
```

Runs unit tests first, then smoke tests (does not include integration tests — run `task container:test` separately).

### Integration tests

End-to-end test that loads the plugin via OpenCode with a mock LLM provider, sends a prompt, and asserts the plugin logs the expected lifecycle events (`Plugin initialized`, `Acquired session`, `Released session`).

Uses `docker compose` with two containers:

- **dev** — the existing dev container (builds from `docker/Dockerfile.ubuntu2404`), repo bind-mounted
- **mock-llm** — `ghcr.io/dwmkerr/mock-llm` (OpenAI-compatible echo server)

```bash
task container:test
```

Or directly:

```bash
docker compose -f docker/docker-compose.yml up --build --abort-on-container-exit --exit-code-from dev
```

What it does:

1. Docker Compose starts mock-llm first and waits for its health check to pass
2. The test script creates an OpenCode config with `file://` plugin + mock provider pointing at `http://mock-llm:6556/v1`
3. Runs `opencode run --auto -m test-llm/mock "ok"`
4. Checks the output and log file for `Plugin initialized` and `Acquired session` (required) and `Released session` (timing-dependent)

The `docker compose` command cleans up both containers when the test finishes. Use `--abort-on-container-exit` and `--exit-code-from dev` so the exit code reflects the test result.

### Dev container (integration test environment)

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

### Dev plugin (`file://`) vs published npm

OpenCode loads plugins from `~/.config/opencode/opencode.jsonc`. Two modes:

| Config entry | Source |
|--------------|--------|
| `"opencode-suspend-inhibitor"` | Published npm package (`~/.cache/opencode/node_modules/`) |
| `"file:///…/opencode-suspend-inhibitor"` | Local git clone (live dev) |

Use **one** entry at a time — do not list both.

#### `opencode plugin` (npm only)

```bash
opencode plugin opencode-suspend-inhibitor      # install + add to project opencode.jsonc
opencode plugin -g opencode-suspend-inhibitor   # install + add to ~/.config/opencode/opencode.jsonc
opencode plugin -f opencode-suspend-inhibitor   # force reinstall (e.g. after npm publish)
```

This command installs from **npm** and writes the package name into config. It does **not** support `file://` paths — use manual config edit below for local clone dev.

Running `opencode plugin …` while testing a `file://` entry will replace it with the npm package name.

#### Switch to local clone

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

`file:///home/marius/Work/iden2/github.com/mscurtescu/opencode-suspend-inhibitor`

**Restart OpenCode** after changing config. Plugins load at startup only; edit `index.ts`, restart, re-test.

#### Switch back to published npm

Either edit config:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": ["opencode-suspend-inhibitor"]
}
```

Or run `opencode plugin opencode-suspend-inhibitor` (or `-f` to refresh the cache after a new publish).

Restart OpenCode. It uses the cached npm install from `~/.cache/opencode/node_modules/`.

#### Updating after npm publish

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

#### Verify which plugin loaded

```bash
opencode debug info
grep 'plugin=opencode-suspend-inhibitor' ~/.local/share/opencode/log/opencode.log | tail -5
```

After code changes on `file://`, confirm new log behavior (e.g. `plugin=opencode-suspend-inhibitor` on every line) before assuming the clone is active.

### OpenCode integration (manual)

Requires the **dev `file://` config** above (or publish to npm and use the package name). Restart OpenCode after any config change.

#### 1. Busy → inhibitor active

1. Start an agent session and trigger busy state (run a task).
2. In a terminal:

   ```bash
   gnome-session-inhibit --list
   ```

3. Expect an entry with app-id `ai.opencode.desktop` and reason `OpenCode Agent is actively working`.

#### 2. Idle → inhibitor released

1. Wait for session idle (or cancel/stop the task).
2. Run `gnome-session-inhibit --list` again — OpenCode inhibitor should be gone.

#### 3. Multi-instance

1. Open two OpenCode instances (or two sessions busy at once).
2. Confirm inhibitor stays active while either is busy.
3. Release one instance — inhibitor should **remain**.
4. Release both — inhibitor should stop.

Session files (while busy): `/tmp/opencode-suspend-inhibitor/sessions/`

#### 4. Missing binary (no-op)

Temporarily hide the binary, restart OpenCode, trigger busy:

```bash
sudo mv /usr/bin/gnome-session-inhibit /usr/bin/gnome-session-inhibit.bak
# restart OpenCode, trigger busy, check logs for single warn (available: false)
sudo mv /usr/bin/gnome-session-inhibit.bak /usr/bin/gnome-session-inhibit
```

No inhibitor should appear in `gnome-session-inhibit --list`.

### Logs

OpenCode flattens `extra` fields onto log lines. Every entry from this plugin includes `plugin=opencode-suspend-inhibitor` and `backend=gnome`:

```bash
grep 'plugin=opencode-suspend-inhibitor' ~/.local/share/opencode/log/opencode.log
grep 'Plugin initialized' ~/.local/share/opencode/log/opencode.log
```

### Troubleshooting

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

**Orphaned inhibitors after crashes/restarts:** If OpenCode was killed by a signal (SIGINT/SIGTERM/SIGHUP) rather than exiting cleanly, `gnome-session-inhibit` processes can be left running. Check for orphans:

```bash
task gsi:list       # all active inhibitors (system-wide)
task gsi:orphans    # plugin inhibitor processes (PID + args)
task gsi:sessions   # session files and their stored PIDs
```

If you see multiple entries when no session is busy (or more than one when one is), reset:

```bash
task gsi:reset      # kill orphans, clear session files, remove pid file
```

Then restart OpenCode — it will start a fresh inhibitor when a session goes busy.

## Development tasks

Requires [mise](https://mise.jdx.dev/) (`mise install` pins `task`, `bun`, `bd`):

```bash
task              # list tasks
task install      # bun install
task typecheck    # tsc --noEmit
task build        # compile TypeScript to dist/
task test:unit    # unit tests (bun:test, headless-CI friendly)
task test:smoke   # smoke tests (typecheck, session registry, gnome-session-inhibit)
task test         # unit + smoke tests
task beads:list       # bd list --flat (one line per issue, with type)
task beads:list:tree  # bd list (hierarchical tree)
task beads:ready      # bd ready
task beads:push       # bd dolt push
task container:build  # Docker dev image for integration tests
task container:run    # shell in dev container (repo bind-mounted)
task container:verify # verify container + plugin config
task container:test  # integration tests (mock LLM sidecar)
task bdui:start   # beads-ui at http://127.0.0.1:3000
task bdui:stop    # stop beads-ui
task gsi:list:all   # list all active gnome-session-inhibit inhibitors
task gsi:list:plugin # list plugin inhibitors only (ai.opencode.desktop)
task gsi:orphans  # show plugin inhibitor processes (PID + args)
task gsi:sessions # show session files and their stored PIDs
task gsi:kill     # kill all plugin gnome-session-inhibit processes
task gsi:reset    # full reset: kill orphans, clear session files, remove pid file
```

## Issue tracking (beads)

This project uses [bd (beads)](https://github.com/gastownhall/beads) for issue tracking — a lightweight, dependency-aware tracker backed by a local Dolt database with git-native sync.

### Architecture

- **Issues live in a local Dolt database** embedded under `.beads/embeddeddolt/` (not in JSONL files, not in a remote service).
- **Cross-machine sync** uses `bd dolt push` / `bd dolt pull`, which writes to `refs/dolt/data` on your git remote — a namespace **separate** from `refs/heads/*` where your code lives. This means beads data syncs through the same git remote without touching your branch history.
- **`.beads/issues.jsonl` and `.beads/interactions.jsonl` are passive exports** — gitignored, not the wire protocol. They may exist locally for viewers (e.g. `bdui`) but are never committed. Export is off (`export.auto: false` in `.beads/config.yaml`).
- **Auto-push** is enabled for solo use (`dolt.auto-push: true`, 5-minute debounce). After any beads write, bd auto-commits to Dolt history and pushes to the remote within 5 minutes. Run `bd dolt push` manually for immediate sync.
- **Sync remote** is configured in `.beads/config.yaml` (`sync.remote` → GitHub origin).

See [SYNC_CONCEPTS.md](https://github.com/gastownhall/beads/blob/main/docs/SYNC_CONCEPTS.md) for the one-screen overview and anti-patterns (don't treat JSONL as source of truth; don't `bd import` during normal operation).

### Fresh clone bootstrap

After `git clone`, the Dolt database is not present. Pull it from the remote:

```bash
git clone <repo-url>
cd opencode-suspend-inhibitor
mise install          # pins bd among other tools
bd dolt pull          # fetch issue database from refs/dolt/data
```

Verify:

```bash
bd list               # should show all issues
bd ready              # should show unblocked work
```

### Daily commands

```bash
bd ready              # find unblocked issues ready to work on
bd show <id>          # view issue details
bd list               # list all issues (hierarchical tree)
bd list --flat        # one line per issue, with type
bd update <id> --claim   # atomically claim an issue
bd create "Title" --description="..." -t bug|feature|task -p 0-4
bd close <id> --reason "Done"
bd comment <id> "Update text"
bd dolt push          # push beads data to remote (manual; auto-push also runs)
```

### Git workflow

**Never commit `.beads/*.jsonl`** — these are gitignored passive exports, not the source of truth. Sync happens via `bd dolt push` (writes to `refs/dolt/data`).

When working on an issue:

1. Implement and verify (tests, typecheck)
2. `bd close <id> --reason "..."` (and any `bd comment` / `bd update`)
3. Beads auto-pushes to remote after writes (5m debounce). Run `bd dolt push` manually if you need immediate sync before another machine pulls.
4. Stage and commit **code/config only** (not `.beads/*.jsonl`)
5. `git push`

### Issue types and priorities

| Type | Use for |
|------|---------|
| `bug` | Something broken |
| `feature` | New functionality |
| `task` | Work item (tests, docs, refactoring) |
| `epic` | Large feature with subtasks |
| `chore` | Maintenance (dependencies, tooling) |

| Priority | Meaning |
|----------|---------|
| 0 | Critical (security, data loss, broken builds) |
| 1 | High (major features, important bugs) |
| 2 | Medium (default) |
| 3 | Low (polish, optimization) |
| 4 | Backlog (future ideas) |

## AI agents

AI agents follow [AGENTS.md](AGENTS.md) (all agents) and [CLAUDE.md](CLAUDE.md) (Claude-specific) for beads rules, git workflow, non-interactive shell conventions, and session completion protocol.
