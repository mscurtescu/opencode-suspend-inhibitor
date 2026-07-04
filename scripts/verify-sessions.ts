/**
 * Smoke test for session registry (multi-instance file coordination).
 * Run: bun scripts/verify-sessions.ts
 */
import { existsSync, rmSync } from "node:fs";

import {
  acquire,
  getActiveSessions,
  release,
  SESSIONS_DIR,
  TMP_DIR,
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

function cleanup(): void {
  release(SESSION_A);
  release(SESSION_B);
  if (existsSync(TMP_DIR)) {
    try {
      rmSync(TMP_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

cleanup();

acquire(SESSION_A);
assert(getActiveSessions().length === 1, "one session after first acquire");

acquire(SESSION_B);
assert(getActiveSessions().length === 2, "two sessions after second acquire");

release(SESSION_A);
assert(getActiveSessions().length === 1, "one session remains after partial release");

release(SESSION_B);
assert(getActiveSessions().length === 0, "no sessions after full release");

assert(!existsSync(SESSIONS_DIR) || getActiveSessions().length === 0, "registry empty");

cleanup();
console.log("session registry smoke test passed");