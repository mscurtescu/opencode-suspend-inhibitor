/**
 * Smoke test for session registry (multi-instance file coordination).
 * Run: bun scripts/verify-sessions.ts
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  _setBaseDir,
  acquire,
  getActiveSessions,
  release,
} from "../src/sessions";

const SESSION_A = "smoke-test-session-a";
const SESSION_B = "smoke-test-session-b";

function assert(condition: boolean, message: string): void {
  if (!condition) {
    console.error(`FAIL: ${message}`);
    process.exit(1);
  }
  console.log(`ok: ${message}`);
}

const tempDir = mkdtempSync(join(tmpdir(), "osi-smoke-"));
_setBaseDir(tempDir);

try {
  acquire(SESSION_A);
  assert(getActiveSessions().length === 1, "one session after first acquire");

  acquire(SESSION_B);
  assert(getActiveSessions().length === 2, "two sessions after second acquire");

  release(SESSION_A);
  assert(getActiveSessions().length === 1, "one session remains after partial release");

  release(SESSION_B);
  assert(getActiveSessions().length === 0, "no sessions after full release");

  release(SESSION_A);
  release(SESSION_B);
  console.log("session registry smoke test passed");
} finally {
  rmSync(tempDir, { recursive: true, force: true });
}
