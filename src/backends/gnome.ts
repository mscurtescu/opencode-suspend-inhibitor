import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

import { TMP_DIR } from "../sessions";

export const BACKEND = "gnome" as const;

const INHIBITOR_ARGS = [
  "--inhibit-only",
  "--inhibit",
  "suspend:idle",
  "--reason",
  "OpenCode Agent is actively working",
  "--app-id",
  "ai.opencode.desktop",
] as const;

type SpawnOpts = { stdout?: "ignore"; stderr?: "ignore" };
type SpawnResult = { pid: number; exited: Promise<number> };
type SpawnFn = (cmd: string[], opts?: SpawnOpts) => SpawnResult;
type KillFn = (pid: number, signal?: NodeJS.Signals | number) => boolean;

const defaultSpawn: SpawnFn = (cmd, opts) =>
  Bun.spawn(cmd, opts) as unknown as SpawnResult;

export class GnomeInhibitor {
  private availability: boolean | null = null;
  private startPromise: Promise<void> | null = null;

  constructor(
    private readonly spawnProcess: SpawnFn = defaultSpawn,
    private readonly killProcess: KillFn = process.kill,
  ) {}

  isLinux(): boolean {
    return process.platform === "linux";
  }

  async resolveAvailability(): Promise<boolean> {
    if (!this.isLinux()) {
      this.availability = false;
      return false;
    }

    if (this.availability !== null) return this.availability;

    try {
      const proc = this.spawnProcess(["which", "gnome-session-inhibit"], {
        stdout: "ignore",
        stderr: "ignore",
      });
      this.availability = (await proc.exited) === 0;
    } catch {
      this.availability = false;
    }

    return this.availability;
  }

  private inhibitorPidFile(): string {
    return `${TMP_DIR}/gnome-session-inhibit.pid`;
  }

  private isProcessAlive(pid: number): boolean {
    try {
      this.killProcess(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  private isInhibitorRunning(): boolean {
    const pidFile = this.inhibitorPidFile();
    if (!existsSync(pidFile)) return false;

    try {
      const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
      if (this.isProcessAlive(pid)) return true;
      unlinkSync(pidFile);
      return false;
    } catch {
      return false;
    }
  }

  private async startInhibitor(): Promise<void> {
    if (this.startPromise) return this.startPromise;

    this.startPromise = (async () => {
      if (this.isInhibitorRunning()) return;

      const proc = this.spawnProcess(
        ["gnome-session-inhibit", ...INHIBITOR_ARGS],
        {
          stdout: "ignore",
          stderr: "ignore",
        },
      );

      writeFileSync(this.inhibitorPidFile(), String(proc.pid));

      void proc.exited.then(() => {
        try {
          const pidFile = this.inhibitorPidFile();
          if (!existsSync(pidFile)) return;
          const recorded = Number.parseInt(
            readFileSync(pidFile, "utf8").trim(),
            10,
          );
          if (recorded === proc.pid) unlinkSync(pidFile);
        } catch {
          // ignore cleanup errors
        }
      });
    })().finally(() => {
      this.startPromise = null;
    });

    return this.startPromise;
  }

  private stopInhibitor(): void {
    const pidFile = this.inhibitorPidFile();
    if (!existsSync(pidFile)) return;

    try {
      const pid = Number.parseInt(readFileSync(pidFile, "utf8").trim(), 10);
      this.killProcess(pid, "SIGTERM");
    } catch {
      // already stopped
    }

    try {
      unlinkSync(pidFile);
    } catch {
      // already removed
    }
  }

  async syncInhibitor(activeSessionCount: number): Promise<void> {
    if (!(await this.resolveAvailability())) return;

    if (activeSessionCount > 0) {
      await this.startInhibitor();
      return;
    }

    this.stopInhibitor();
  }

  stopInhibitorOnExit(): void {
    this.stopInhibitor();
  }
}
