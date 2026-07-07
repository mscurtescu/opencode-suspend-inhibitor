# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.0.2] - 2026-07-07

### Added

- Build pipeline: `npm run build` compiles TypeScript to `dist/` with declarations; `prepublishOnly` runs build automatically before npm publish (.23)
- Unit test suite (37 tests, bun:test): session registry, gnome backend, plugin entry — headless-CI friendly (.25)
- Developer documentation ([DEVELOPMENT.md](DEVELOPMENT.md)): project setup, testing, build workflow, issue tracking (beads) guide, AI agent conventions (.14)
- Docker dev container for integration testing (Ubuntu 24.04, gnome-session-inhibit, OpenCode) (.29)
- Taskfile.yml with mise-pinned tasks: install, typecheck, build, test:unit, test:smoke, container:*, beads:*, gsi:* (.21)
- `gsi:*` diagnostic tasks for gnome-session-inhibit: `gsi:list:all`, `gsi:list:plugin`, `gsi:orphans`, `gsi:sessions`, `gsi:kill`, `gsi:reset`
- Plugin name (`plugin=opencode-suspend-inhibitor`) in all log extra fields for easy grep filtering (.11)
- README badges (npm, MIT, TypeScript, Bun, Linux+GNOME) and Alternatives table (.24)

### Changed

- npm package ships compiled JS from `dist/` instead of raw TypeScript (.23)
- GNOME backend refactored to `GnomeInhibitor` class with constructor dependency injection for testability (.25)
- Session registry paths (`TMP_DIR`/`SESSIONS_DIR`) are injectable via `_setBaseDir()` for test isolation (.25)
- README trimmed: dev install, development tasks, and troubleshooting moved to DEVELOPMENT.md
- TESTING.md absorbed into DEVELOPMENT.md (deleted)

### Fixed

- Inhibitor processes no longer orphaned on OpenCode restart: register SIGINT/SIGTERM/SIGHUP handlers in addition to `process.on("exit")` (.e6v)
- Smoke test (`verify-sessions.ts`) no longer destroys the inhibitor pid file: uses temp dir isolation instead of `rmSync(TMP_DIR)` (.e6v)

## [0.0.1] - 2026-07-04

### Added

- Initial npm release as `opencode-suspend-inhibitor`
- GNOME `gnome-session-inhibit` backend with `--inhibit suspend:idle` and `--app-id ai.opencode.desktop`
- Multi-instance session registry via files in `/tmp/opencode-suspend-inhibitor/sessions/` (one shared inhibitor process across all OpenCode instances)
- Platform guard: no-op with single warning log on non-Linux or missing `gnome-session-inhibit` binary
- Session lifecycle hooks: `session.status` (busy/idle), `session.idle`, `session.error`
- Automatic cleanup of stale session files (dead PID pruning on startup)
- Smoke test script and OpenCode verification checklist
- npm-first README with install instructions and platform support matrix

[0.0.2]: https://github.com/mscurtescu/opencode-suspend-inhibitor/compare/v0.0.1...v0.0.2
[0.0.1]: https://github.com/mscurtescu/opencode-suspend-inhibitor/releases/tag/v0.0.1
