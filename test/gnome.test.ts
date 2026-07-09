import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { existsSync } from "node:fs";

import { GnomeInhibitor } from "../src/backends/gnome";
import { TMP_DIR } from "../src/sessions";
import { FakeKill, FakeSpawn, flush, withTempDir } from "./helpers";

function pidFilePath(): string {
  return `${TMP_DIR}/gnome-session-inhibit.pid`;
}

function createHarness(whichExitCode: number = 0) {
  const fakeSpawn = new FakeSpawn(whichExitCode);
  const fakeKill = new FakeKill();
  const inhibitor = new GnomeInhibitor(fakeSpawn.spawn, fakeKill.kill);
  return { inhibitor, fakeSpawn, fakeKill };
}

async function withPlatform<T>(
  platform: string,
  fn: () => T | Promise<T>,
): Promise<T> {
  const original = process.platform;
  Object.defineProperty(process, "platform", {
    value: platform,
    configurable: true,
  });
  try {
    return await fn();
  } finally {
    Object.defineProperty(process, "platform", {
      value: original,
      configurable: true,
    });
  }
}

describe("GnomeInhibitor", () => {
  let cleanup: () => void;

  beforeEach(() => {
    cleanup = withTempDir();
  });

  afterEach(() => {
    cleanup();
  });

  describe("isLinux", () => {
    it("returns true on linux", () => {
      const inhibitor = new GnomeInhibitor();
      expect(inhibitor.isLinux()).toBe(true);
    });

    it("returns false on non-linux", async () => {
      await withPlatform("darwin", () => {
        const inhibitor = new GnomeInhibitor();
        expect(inhibitor.isLinux()).toBe(false);
      });
    });
  });

  describe("resolveAvailability", () => {
    it("returns false on non-Linux (no spawn)", async () => {
      await withPlatform("darwin", async () => {
        const { inhibitor, fakeSpawn } = createHarness();
        expect(await inhibitor.resolveAvailability()).toBe(false);
        expect(fakeSpawn.calls.length).toBe(0);
      });
    });

    it("returns true when which exits 0", async () => {
      const { inhibitor, fakeSpawn } = createHarness(0);
      expect(await inhibitor.resolveAvailability()).toBe(true);
      expect(fakeSpawn.calls.length).toBe(1);
      expect(fakeSpawn.calls[0].cmd[0]).toBe("which");
    });

    it("returns false when which exits 1", async () => {
      const { inhibitor, fakeSpawn } = createHarness(1);
      expect(await inhibitor.resolveAvailability()).toBe(false);
      expect(fakeSpawn.calls.length).toBe(1);
    });

    it("caches result — spawns only once", async () => {
      const { inhibitor, fakeSpawn } = createHarness(0);
      await inhibitor.resolveAvailability();
      await inhibitor.resolveAvailability();
      expect(fakeSpawn.calls.length).toBe(1);
    });
  });

  describe("syncInhibitor", () => {
    it("starts inhibitor when count > 0", async () => {
      const { inhibitor, fakeSpawn } = createHarness(0);
      await inhibitor.syncInhibitor(1);
      await flush();

      expect(fakeSpawn.calls.length).toBe(2);
      expect(fakeSpawn.calls[1].cmd[0]).toBe("gnome-session-inhibit");
      expect(existsSync(pidFilePath())).toBe(true);
    });

    it("does not start duplicate when already running", async () => {
      const { inhibitor, fakeSpawn } = createHarness(0);
      await inhibitor.syncInhibitor(1);
      await flush();
      await inhibitor.syncInhibitor(1);

      expect(fakeSpawn.calls.length).toBe(2);
    });

    it("stops inhibitor when count goes to 0", async () => {
      const { inhibitor, fakeSpawn, fakeKill } = createHarness(0);
      await inhibitor.syncInhibitor(1);
      await flush();
      const inhibitorPid = fakeSpawn.calls[1].pid;

      await inhibitor.syncInhibitor(0);

      const termCalls = fakeKill.killCalls.filter(
        (c) => c.pid === inhibitorPid && c.signal === "SIGTERM",
      );
      expect(termCalls.length).toBe(1);
      expect(existsSync(pidFilePath())).toBe(false);
    });

    it("does not spawn when unavailable", async () => {
      const { inhibitor, fakeSpawn } = createHarness(1);
      await inhibitor.syncInhibitor(1);
      await flush();

      expect(fakeSpawn.calls.length).toBe(1);
      expect(existsSync(pidFilePath())).toBe(false);
    });

    it("prunes stale pid file and restarts inhibitor", async () => {
      const { inhibitor, fakeSpawn, fakeKill } = createHarness(0);
      await inhibitor.syncInhibitor(1);
      await flush();
      const inhibitorPid = fakeSpawn.calls[1].pid;

      fakeKill.markDead(inhibitorPid);
      await inhibitor.syncInhibitor(1);

      const inhibitorSpawns = fakeSpawn.calls.filter(
        (c) => c.cmd[0] === "gnome-session-inhibit",
      );
      expect(inhibitorSpawns.length).toBe(2);
    });
  });

  describe("stopInhibitorOnExit", () => {
    it("kills recorded pid and removes pid file", async () => {
      const { inhibitor, fakeSpawn, fakeKill } = createHarness(0);
      await inhibitor.syncInhibitor(1);
      await flush();
      const inhibitorPid = fakeSpawn.calls[1].pid;

      inhibitor.stopInhibitorOnExit();

      const termCalls = fakeKill.killCalls.filter(
        (c) => c.pid === inhibitorPid && c.signal === "SIGTERM",
      );
      expect(termCalls.length).toBe(1);
      expect(existsSync(pidFilePath())).toBe(false);
    });

    it("is no-op when no pid file", () => {
      const { inhibitor, fakeKill } = createHarness(0);
      const initialCalls = fakeKill.killCalls.length;
      inhibitor.stopInhibitorOnExit();
      expect(fakeKill.killCalls.length).toBe(initialCalls);
    });
  });

  describe("pid file lifecycle", () => {
    it("cleans up pid file when inhibitor process exits on its own", async () => {
      const { inhibitor, fakeSpawn } = createHarness(0);
      await inhibitor.syncInhibitor(1);
      await flush();

      const child = fakeSpawn.inhibitorChild;
      expect(child).toBeDefined();

      child?.fakeExit(0);
      await flush();

      expect(existsSync(pidFilePath())).toBe(false);
    });
  });
});
