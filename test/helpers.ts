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

/** Fake child process with a controllable `exited` promise. */
export class FakeChild {
  readonly pid: number;
  readonly cmd: string[];
  readonly exited: Promise<number>;
  private resolveExit!: (code: number) => void;

  constructor(pid: number, cmd: string[], autoExitCode?: number) {
    this.pid = pid;
    this.cmd = cmd;
    this.exited = new Promise((resolve) => {
      this.resolveExit = resolve;
      if (autoExitCode !== undefined) {
        queueMicrotask(() => resolve(autoExitCode));
      }
    });
  }

  fakeExit(code: number = 0): void {
    this.resolveExit(code);
  }
}

/** Fake spawn that records calls and returns FakeChild instances. */
export class FakeSpawn {
  readonly calls: { cmd: string[]; pid: number }[] = [];
  readonly children: FakeChild[] = [];
  private pidCounter = 10000;

  constructor(private readonly whichExitCode: number = 0) {}

  spawn = (cmd: string[], _opts?: unknown): FakeChild => {
    const pid = ++this.pidCounter;
    this.calls.push({ cmd, pid });
    const child =
      cmd[0] === "which"
        ? new FakeChild(pid, cmd, this.whichExitCode)
        : new FakeChild(pid, cmd);
    this.children.push(child);
    return child;
  };

  get inhibitorChild(): FakeChild | undefined {
    return this.children.find((c) => c.cmd[0] === "gnome-session-inhibit");
  }
}

/** Fake process.kill that tracks calls and simulates liveness. */
export class FakeKill {
  readonly killCalls: { pid: number; signal: string | number }[] = [];
  private deadPids = new Set<number>();

  markDead(pid: number): void {
    this.deadPids.add(pid);
  }

  kill = (pid: number, signal?: string | number): boolean => {
    const sig = signal ?? 0;
    this.killCalls.push({ pid, signal: sig });
    if (sig === 0) {
      if (this.deadPids.has(pid)) throw new Error(`kill ESRCH: ${pid}`);
      return true;
    }
    this.deadPids.add(pid);
    return true;
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
