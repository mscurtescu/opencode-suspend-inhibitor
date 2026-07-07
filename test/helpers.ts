import { EventEmitter } from "node:events";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { _setBaseDir } from "../src/sessions";

/** Create a temp dir and redirect session storage there. Returns cleanup fn. */
export function withTempDir(): () => void {
  const dir = mkdtempSync(join(tmpdir(), "osi-test-"));
  _setBaseDir(dir);
  return () => {
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };
}

/** Drain microtasks (for async spawn callbacks in tests). */
export async function flush(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

/** Fake child process for spawn mocking. Emits "spawn" on next microtask. */
export class FakeChild extends EventEmitter {
  readonly pid: number;
  readonly killCalls: string[] = [];
  private readonly exitCode: number | null;
  private exited = false;

  constructor(pid: number, exitCode: number | null = 0) {
    super();
    this.pid = pid;
    this.exitCode = exitCode;
    queueMicrotask(() => {
      this.emit("spawn");
      if (!this.exited) {
        this.exited = true;
        this.emit("exit", this.exitCode, null);
      }
    });
  }

  kill(signal: string): boolean {
    this.killCalls.push(signal);
    return true;
  }
}

/** Fake spawn function that returns FakeChild instances. */
export class FakeSpawn {
  readonly calls: { cmd: string[]; pid: number }[] = [];
  private pidCounter = 10000;

  constructor(private readonly exitCode: number = 0) {}

  spawn = (cmd: string[]): FakeChild => {
    const pid = ++this.pidCounter;
    this.calls.push({ cmd, pid });
    return new FakeChild(pid, this.exitCode);
  };
}

/** Event builders for plugin tests. */
export function statusEvent(
  sessionID: string,
  type: string,
): { type: string; properties: { sessionID: string; status: { type: string } } } {
  return {
    type: "session.status",
    properties: { sessionID, status: { type } },
  };
}

export function idleEvent(
  sessionID: string,
): { type: string; properties: { sessionID: string } } {
  return { type: "session.idle", properties: { sessionID } };
}

export function errorEvent(
  sessionID: string,
): { type: string; properties: { sessionID: string } } {
  return { type: "session.error", properties: { sessionID } };
}
