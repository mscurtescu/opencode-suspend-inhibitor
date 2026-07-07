import type { Plugin } from "@opencode-ai/plugin";

import { BACKEND, GnomeInhibitor } from "./src/backends/gnome";
import {
  acquire,
  getActiveSessions,
  release,
  startupCleanup,
} from "./src/sessions";

const SERVICE = "sleep-inhibitor";
const PLUGIN = "opencode-suspend-inhibitor";

type SessionEvent = {
  type: string;
  properties?: {
    sessionID?: string;
    status?: { type?: string };
  };
};

function sessionIDFrom(event: SessionEvent): string | undefined {
  return event.properties?.sessionID;
}

export const SleepInhibitorPlugin: Plugin = async ({ client }) => {
  const log = (
    level: "info" | "warn" | "error" | "debug",
    message: string,
    extra: Record<string, unknown> = {},
  ) =>
    client.app.log({
      body: {
        level,
        service: SERVICE,
        message,
        extra: { plugin: PLUGIN, backend: BACKEND, ...extra },
      },
    });

  const noOp = (reason: string, extra: Record<string, unknown> = {}) => {
    void log("warn", reason, { available: false, ...extra });
    return { event: async () => {} };
  };

  const inhibitor = new GnomeInhibitor();

  if (!inhibitor.isLinux()) {
    return noOp("Plugin inactive on non-Linux platform", {
      platform: process.platform,
    });
  }

  if (!(await inhibitor.resolveAvailability())) {
    return noOp("gnome-session-inhibit not available; plugin inactive");
  }

  const activeOnStartup = startupCleanup();
  await inhibitor.syncInhibitor(activeOnStartup.length);

  void log("info", "Plugin initialized", {
    available: true,
    pid: process.pid,
    activeSessions: activeOnStartup.length,
    sessionIDs: activeOnStartup,
  });

  process.on("exit", () => inhibitor.stopInhibitorOnExit());

  const sync = async (sessionID: string | undefined, action: "acquire" | "release") => {
    if (!sessionID) {
      void log("warn", "Session event missing sessionID", { action });
      return;
    }

    if (action === "acquire") acquire(sessionID);
    else release(sessionID);

    const active = getActiveSessions();
    await inhibitor.syncInhibitor(active.length);

    void log("info", action === "acquire" ? "Acquired session" : "Released session", {
      sessionID,
      activeSessions: active.length,
      sessionIDs: active,
    });
  };

  return {
    event: async ({ event }) => {
      const typed = event as SessionEvent;

      if (typed.type === "session.status") {
        const statusType = typed.properties?.status?.type;
        if (statusType === "busy") {
          await sync(sessionIDFrom(typed), "acquire");
        } else if (statusType === "idle") {
          await sync(sessionIDFrom(typed), "release");
        }
        return;
      }

      if (typed.type === "session.idle" || typed.type === "session.error") {
        await sync(sessionIDFrom(typed), "release");
      }
    },
  };
};
