import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  acquire,
  getActiveSessions,
  isProcessAlive,
  release,
  SESSIONS_DIR,
  startupCleanup,
} from "../src/sessions";
import { withTempDir } from "./helpers";

describe("isProcessAlive", () => {
  it("returns true for the current process", () => {
    expect(isProcessAlive(process.pid)).toBe(true);
  });

  it("returns false for a dead PID", () => {
    expect(isProcessAlive(999999)).toBe(false);
  });
});

describe("session registry", () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = withTempDir();
  });

  afterEach(() => {
    cleanup();
  });

  describe("acquire", () => {
    it("writes a session file containing the current PID", () => {
      acquire("session-a");
      const filePath = join(SESSIONS_DIR, "session-a");
      expect(existsSync(filePath)).toBe(true);
      const content = readFileSync(filePath, "utf8").trim();
      expect(Number.parseInt(content, 10)).toBe(process.pid);
    });

    it("overwrites existing session file on re-acquire", () => {
      acquire("session-a");
      acquire("session-a");
      expect(getActiveSessions().length).toBe(1);
    });
  });

  describe("release", () => {
    it("removes the session file", () => {
      acquire("session-a");
      release("session-a");
      expect(getActiveSessions().length).toBe(0);
    });

    it("is a no-op when file is missing", () => {
      expect(() => release("nonexistent")).not.toThrow();
    });
  });

  describe("getActiveSessions", () => {
    it("returns empty when no sessions", () => {
      expect(getActiveSessions()).toEqual([]);
    });

    it("returns one session after single acquire", () => {
      acquire("session-a");
      expect(getActiveSessions()).toEqual(["session-a"]);
    });

    it("returns two sessions after two acquires", () => {
      acquire("session-a");
      acquire("session-b");
      const active = getActiveSessions().sort();
      expect(active).toEqual(["session-a", "session-b"]);
    });

    it("prunes stale session files with dead PIDs", () => {
      acquire("session-a");
      const stalePath = join(SESSIONS_DIR, "stale-session");
      writeFileSync(stalePath, "999999");
      const active = getActiveSessions().sort();
      expect(active).toEqual(["session-a"]);
      expect(existsSync(stalePath)).toBe(false);
    });

    it("removes released sessions from active list", () => {
      acquire("session-a");
      acquire("session-b");
      release("session-a");
      expect(getActiveSessions()).toEqual(["session-b"]);
    });
  });

  describe("startupCleanup", () => {
    it("creates sessions dir if missing", () => {
      const result = startupCleanup();
      expect(result).toEqual([]);
      expect(existsSync(SESSIONS_DIR)).toBe(true);
    });

    it("returns active sessions and prunes stale ones", () => {
      acquire("session-a");
      const stalePath = join(SESSIONS_DIR, "stale-session");
      writeFileSync(stalePath, "999999");
      const result = startupCleanup();
      expect(result).toEqual(["session-a"]);
      expect(existsSync(stalePath)).toBe(false);
    });
  });
});
