import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";

export const TMP_DIR = "/tmp/opencode-sleep-inhibitor";
export const SESSIONS_DIR = `${TMP_DIR}/sessions`;

export function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

export function ensureDirs(): void {
  mkdirSync(SESSIONS_DIR, { recursive: true });
}

export function getActiveSessions(): string[] {
  if (!existsSync(SESSIONS_DIR)) return [];

  const active: string[] = [];
  for (const sessionID of readdirSync(SESSIONS_DIR)) {
    const filePath = `${SESSIONS_DIR}/${sessionID}`;
    try {
      const pid = Number.parseInt(readFileSync(filePath, "utf8").trim(), 10);
      if (isProcessAlive(pid)) {
        active.push(sessionID);
      } else {
        unlinkSync(filePath);
      }
    } catch {
      // stale or unreadable session file
    }
  }
  return active;
}

export function acquireSession(sessionID: string): void {
  ensureDirs();
  writeFileSync(`${SESSIONS_DIR}/${sessionID}`, String(process.pid));
}

export function releaseSession(sessionID: string): void {
  try {
    unlinkSync(`${SESSIONS_DIR}/${sessionID}`);
  } catch {
    // already released
  }
}

export function startupCleanup(): string[] {
  ensureDirs();
  return getActiveSessions();
}