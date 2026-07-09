import { beforeEach, describe, expect, it, mock } from "bun:test";

// --- Mock state (configurable per test) ---
let isLinuxResult = true;
let availabilityResult = true;
const mockAcquire = mock((_id: string) => {});
const mockRelease = mock((_id: string) => {});
const mockGetActiveSessions = mock((): string[] => []);
const mockStartupCleanup = mock((): string[] => []);
const mockSyncInhibitor = mock(async (_count: number) => {});
const mockStopInhibitorOnExit = mock(() => {});

// Track active sessions to simulate registry behavior
let activeSessions: string[];

mock.module("../src/sessions", () => ({
  acquire: (id: string) => {
    activeSessions.push(id);
    mockAcquire(id);
  },
  release: (id: string) => {
    activeSessions = activeSessions.filter((s) => s !== id);
    mockRelease(id);
  },
  getActiveSessions: () => {
    mockGetActiveSessions();
    return [...activeSessions];
  },
  startupCleanup: () => {
    mockStartupCleanup();
    return [...activeSessions];
  },
  _setBaseDir: () => {},
  TMP_DIR: "/tmp/test",
  SESSIONS_DIR: "/tmp/test/sessions",
}));

mock.module("../src/backends/gnome", () => ({
  BACKEND: "gnome",
  GnomeInhibitor: class MockInhibitor {
    isLinux() {
      return isLinuxResult;
    }
    async resolveAvailability() {
      return availabilityResult;
    }
    async syncInhibitor(count: number) {
      await mockSyncInhibitor(count);
    }
    stopInhibitorOnExit() {
      mockStopInhibitorOnExit();
    }
  },
}));

const { SleepInhibitorPlugin } = await import("../index");

type LogEntry = {
  level: string;
  message: string;
  extra: Record<string, unknown>;
};

function createMockClient() {
  const logs: LogEntry[] = [];
  const client = {
    app: {
      log: mock((args: { body: LogEntry }) => {
        logs.push(args.body);
      }),
    },
  };
  return { client, logs };
}

function resetMocks() {
  isLinuxResult = true;
  availabilityResult = true;
  activeSessions = [];
  mockAcquire.mockClear();
  mockRelease.mockClear();
  mockGetActiveSessions.mockClear();
  mockStartupCleanup.mockClear();
  mockSyncInhibitor.mockClear();
  mockStopInhibitorOnExit.mockClear();
}

describe("SleepInhibitorPlugin", () => {
  let client: ReturnType<typeof createMockClient>["client"];
  let logs: LogEntry[];

  beforeEach(() => {
    resetMocks();
    const harness = createMockClient();
    client = harness.client;
    logs = harness.logs;
  });

  describe("non-Linux platform", () => {
    it("returns no-op and logs warn", async () => {
      isLinuxResult = false;
      const result = await SleepInhibitorPlugin({ client } as never);

      expect(result.event).toBeTypeOf("function");
      await result.event?.({ event: { type: "session.status" } } as never);

      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe("warn");
      expect(logs[0].extra.available).toBe(false);
      expect(logs[0].extra.platform).toBe(process.platform);
      expect(mockStartupCleanup).toHaveBeenCalledTimes(0);
    });
  });

  describe("Linux but binary unavailable", () => {
    it("returns no-op and logs warn", async () => {
      isLinuxResult = true;
      availabilityResult = false;
      const _result = await SleepInhibitorPlugin({ client } as never);

      expect(logs.length).toBe(1);
      expect(logs[0].level).toBe("warn");
      expect(logs[0].extra.available).toBe(false);
      expect(mockStartupCleanup).toHaveBeenCalledTimes(0);
    });
  });

  describe("Linux with binary available", () => {
    beforeEach(async () => {
      await SleepInhibitorPlugin({ client } as never);
    });

    it("logs initialization with available=true", () => {
      const initLog = logs.find((l) => l.message === "Plugin initialized");
      expect(initLog).toBeDefined();
      expect(initLog?.level).toBe("info");
      expect(initLog?.extra.available).toBe(true);
      expect(initLog?.extra.backend).toBe("gnome");
      expect(initLog?.extra.plugin).toBe("opencode-suspend-inhibitor");
    });

    it("calls startupCleanup and syncInhibitor on init", () => {
      expect(mockStartupCleanup).toHaveBeenCalledTimes(1);
      expect(mockSyncInhibitor).toHaveBeenCalledTimes(1);
    });
  });

  describe("event routing", () => {
    // biome-ignore lint/suspicious/noExplicitAny: test convenience
    let event: (ctx: any) => Promise<void>;

    beforeEach(async () => {
      const result = await SleepInhibitorPlugin({ client } as never);
      const ev = result.event;
      if (ev) event = ev;
    });

    it("session.status busy → acquire + syncInhibitor", async () => {
      await event({
        event: {
          type: "session.status",
          properties: { sessionID: "s1", status: { type: "busy" } },
        },
      } as never);

      expect(mockAcquire).toHaveBeenCalledWith("s1");
      expect(mockSyncInhibitor).toHaveLastReturnedWith(Promise.resolve());
    });

    it("session.status idle → release + syncInhibitor", async () => {
      await event({
        event: {
          type: "session.status",
          properties: { sessionID: "s1", status: { type: "idle" } },
        },
      } as never);

      expect(mockRelease).toHaveBeenCalledWith("s1");
    });

    it("session.idle → release", async () => {
      await event({
        event: {
          type: "session.idle",
          properties: { sessionID: "s1" },
        },
      } as never);

      expect(mockRelease).toHaveBeenCalledWith("s1");
    });

    it("session.error → release", async () => {
      await event({
        event: {
          type: "session.error",
          properties: { sessionID: "s1" },
        },
      } as never);

      expect(mockRelease).toHaveBeenCalledWith("s1");
    });

    it("missing sessionID → warn, no acquire/release", async () => {
      await event({
        event: {
          type: "session.status",
          properties: { status: { type: "busy" } },
        },
      } as never);

      expect(mockAcquire).toHaveBeenCalledTimes(0);
      expect(mockRelease).toHaveBeenCalledTimes(0);

      const warnLog = logs.find(
        (l) => l.message === "Session event missing sessionID",
      );
      expect(warnLog).toBeDefined();
      expect(warnLog?.level).toBe("warn");
    });

    it("unrelated event type → no-op", async () => {
      const syncCallsBefore = mockSyncInhibitor.mock.calls.length;

      await event({
        event: { type: "unknown.event" },
      } as never);

      expect(mockSyncInhibitor.mock.calls.length).toBe(syncCallsBefore);
    });
  });
});
