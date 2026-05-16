import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock OpenNext's worker module before importing the dispatcher.
// The wrapper does `import worker from "../.open-next/worker.js"` and
// `export { DOQueueHandler, ... } from "../.open-next/worker.js"`.
vi.mock("../../.open-next/worker.js", () => {
  const fetchHandler = vi.fn();
  return {
    default: { fetch: fetchHandler },
    DOQueueHandler: class {},
    DOShardedTagCache: class {},
    BucketCachePurge: class {},
  };
});

type FakeCtx = {
  waitUntil: (p: Promise<unknown>) => void;
  flush: () => Promise<unknown[]>;
};
function makeCtx(): FakeCtx {
  const promises: Promise<unknown>[] = [];
  return {
    waitUntil: (p) => promises.push(p),
    flush: () => Promise.all(promises),
  };
}

const fetchMock = vi.fn();
beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

// Minimal type shims so the test file type-checks without the full
// @cloudflare/workers-types dep. These mirror the runtime shapes used.
type ScheduledEvent = { cron: string };
type ExecutionContext = { waitUntil: (p: Promise<unknown>) => void };
type Env = { CRON_SECRET: string; WORKER_HOSTNAME: string };

describe("worker-with-scheduled — scheduled()", () => {
  it("does nothing and warns on an unknown cron string", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { default: worker } = await import("@/worker-with-scheduled");
    const ctx = makeCtx();
    await worker.scheduled(
      { cron: "1 2 3 4 5" } as unknown as ScheduledEvent,
      { CRON_SECRET: "s", WORKER_HOSTNAME: "h" } as unknown as Env,
      ctx as unknown as ExecutionContext,
    );
    await ctx.flush();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalled();
  });

  it("fetches the mapped URL with the bearer for a known cron", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { default: worker } = await import("@/worker-with-scheduled");
    const ctx = makeCtx();
    await worker.scheduled(
      { cron: "30 18 * * *" } as unknown as ScheduledEvent,
      {
        CRON_SECRET: "secret-x",
        WORKER_HOSTNAME: "gym.example",
      } as unknown as Env,
      ctx as unknown as ExecutionContext,
    );
    await ctx.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://gym.example/api/cron/expire-memberships",
    );
    expect((init as RequestInit).method).toBe("POST");
    const headers = (init as RequestInit).headers as Record<string, string>;
    expect(headers.authorization).toBe("Bearer secret-x");
  });

  it("logs a warning when the route responds with non-2xx but does not throw", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 500 }));
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { default: worker } = await import("@/worker-with-scheduled");
    const ctx = makeCtx();
    await worker.scheduled(
      { cron: "0 * * * *" } as unknown as ScheduledEvent,
      {
        CRON_SECRET: "secret-x",
        WORKER_HOSTNAME: "gym.example",
      } as unknown as Env,
      ctx as unknown as ExecutionContext,
    );
    await ctx.flush();
    expect(warn).toHaveBeenCalled();
  });

  it("fetches /api/cron/send-reminders for the 30 1 * * * cron", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 200 }));
    const { default: worker } = await import("@/worker-with-scheduled");
    const ctx = makeCtx();
    await worker.scheduled(
      { cron: "30 1 * * *" } as unknown as ScheduledEvent,
      {
        CRON_SECRET: "secret-x",
        WORKER_HOSTNAME: "gym.example",
      } as unknown as Env,
      ctx as unknown as ExecutionContext,
    );
    await ctx.flush();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://gym.example/api/cron/send-reminders");
  });
});
