import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

vi.mock("@/lib/payhere/api", () => ({
  fetchPayHereStatus: vi.fn(async () => ({ kind: "not_found" })),
}));

import { POST } from "@/app/api/cron/reconcile-payhere/route";

beforeEach(() => {
  process.env.CRON_SECRET = "test-cron-secret";
  process.env.PAYHERE_MERCHANT_ID = "1230000";
  process.env.PAYHERE_MERCHANT_SECRET = "x";
  process.env.PAYHERE_MODE = "sandbox";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/cron/reconcile-payhere", () => {
  it("returns 401 without the bearer header", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/reconcile-payhere", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on wrong bearer", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/reconcile-payhere", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 + summary on correct bearer", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/reconcile-payhere", {
        method: "POST",
        headers: { authorization: "Bearer test-cron-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      processed: number;
      succeeded: number;
      failed: number;
      still_pending: number;
    };
    expect(typeof json.processed).toBe("number");
    expect(typeof json.succeeded).toBe("number");
    expect(typeof json.failed).toBe("number");
    expect(typeof json.still_pending).toBe("number");
  });
});
