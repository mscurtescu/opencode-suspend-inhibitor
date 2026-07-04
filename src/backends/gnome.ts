import { existsSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";

import { isProcessAlive, TMP_DIR } from "../sessions";

export const BACKEND = "gnome" as const;

const INHIBITOR_PID_FILE = `${TMP_DIR}/gnome-session-inhibit.pid`;

const INHIBITOR_ARGS = [
  "--inhibit-only",
  "--inhibit",
  "suspend:idle",
  "--reason",
  "OpenCode Agent is actively working",
  "--app-id",
  "ai.opencode.desktop",
] as const;

let availability: boolean | null = null;
let startPromise: Promise<void> | null = null;

export function isLinux(): boolean {
  return process.platform === "linux";
}

export async function resolveAvailability(): Promise<boolean> {
  if (!isLinux()) {
    availability = false;
    return false;
  }

  if (availability !== null) return availability;

  try {
    const proc = Bun.spawn(["which", "gnome-session-inhibit"], {
      stdout: "ignore",
      stderr: "ignore",
    });
    availability = (await proc.exited) === 0;
  } catch {
    availability = false;
  }

  return availability;
}

function isInhibitorRunning(): boolean {
  if (!existsSync(INHIBITOR_PID_FILE)) return false;

  try {
    const pid = Number.parseInt(readFileSync(INHIBITOR_PID_FILE, "utf8").trim(), 10);
    if (isProcessAlive(pid)) return true;
    unlinkSync(INHIBITOR_PID_FILE);
    return false;
  } catch {
    return false;
  }
}

async function startInhibitor(): Promise<void> {
  if (startPromise) return startPromise;

  startPromise = (async () => {
    if (isInhibitorRunning()) return;

    const proc = Bun.spawn(["gnome-session-inhibit", ...INHIBITOR_ARGS], {
      stdout: "ignore",
      stderr: "ignore",
    });

    writeFileSync(INHIBITOR_PID_FILE, String(proc.pid));

    void proc.exited.then(() => {
      try {
        if (!existsSync(INHIBITOR_PID_FILE)) return;
        const recorded = Number.parseInt(
          readFileSync(INHIBITOR_PID_FILE, "utf8").trim(),
          10,
        );
        if (recorded === proc.pid) unlinkSync(INHIBITOR_PID_FILE);
      } catch {
        // ignore cleanup errors
      }
    });
  })().finally(() => {
    startPromise = null;
  });

  return startPromise;
}

function stopInhibitor(): void {
  if (!existsSync(INHIBITOR_PID_FILE)) return;

  try {
    const pid = Number.parseInt(readFileSync(INHIBITOR_PID_FILE, "utf8").trim(), 10);
    process.kill(pid, "SIGTERM");
  } catch {
    // already stopped
  }

  try {
    unlinkSync(INHIBITOR_PID_FILE);
  } catch {
    // already removed
  }
}

export async function syncInhibitor(activeSessionCount: number): Promise<void> {
  if (!(await resolveAvailability())) return;

  if (activeSessionCount > 0) {
    await startInhibitor();
    return;
  }

  stopInhibitor();
}

export function stopInhibitorOnExit(): void {
  stopInhibitor();
}