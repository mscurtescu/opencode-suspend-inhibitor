import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

/**
 * Per-OpenCode-instance session registry (mirrors opencode-wakelock).
 *
 * Each busy session writes `/tmp/opencode-suspend-inhibitor/sessions/<sessionID>`
 * containing the owning OpenCode process PID. Multiple OpenCode instances
 * share one gnome-session-inhibit process; the inhibitor stops only when no
 * session files remain for live PIDs. Stale files are pruned when the
 * recorded PID is no longer running.
 */
export let TMP_DIR = "/tmp/opencode-suspend-inhibitor";
export let SESSIONS_DIR = `${TMP_DIR}/sessions`;

/** Test-only: redirect session storage to a temp dir. */
export function _setBaseDir(dir: string): void {
  TMP_DIR = dir;
  SESSIONS_DIR = `${dir}/sessions`;
}

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

function sessionFileName(sessionID: string): string {
  return encodeURIComponent(sessionID).replace(/\./g, "%2E");
}

function sessionFilePath(sessionID: string): string {
  return join(SESSIONS_DIR, sessionFileName(sessionID));
}

function sessionIDFromFileName(fileName: string): string {
  try {
    return decodeURIComponent(fileName);
  } catch {
    return fileName;
  }
}

export function getActiveSessions(): string[] {
  if (!existsSync(SESSIONS_DIR)) return [];

  const active: string[] = [];
  for (const fileName of readdirSync(SESSIONS_DIR)) {
    const filePath = join(SESSIONS_DIR, fileName);
    try {
      const pid = Number.parseInt(readFileSync(filePath, "utf8").trim(), 10);
      if (isProcessAlive(pid)) {
        active.push(sessionIDFromFileName(fileName));
      } else {
        unlinkSync(filePath);
      }
    } catch {
      // stale or unreadable session file
    }
  }
  return active;
}

export function acquire(sessionID: string): void {
  ensureDirs();
  writeFileSync(sessionFilePath(sessionID), String(process.pid));
}

export function release(sessionID: string): void {
  try {
    unlinkSync(sessionFilePath(sessionID));
  } catch {
    // already released
  }
}

/** Prune stale session files and return remaining active session IDs. */
export function startupCleanup(): string[] {
  ensureDirs();
  return getActiveSessions();
}
