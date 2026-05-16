import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { Mailer, SendOpts } from "@/lib/email/mailer";

const sent: SendOpts[] = [];
vi.mock("@/lib/email/resend-mailer", () => ({
  makeResendMailer: (): Mailer => ({
    async send(opts) {
      sent.push(opts);
      return { ok: true };
    },
  }),
}));

import { POST } from "@/app/api/cron/send-reminders/route";

beforeEach(() => {
  sent.length = 0;
  process.env.CRON_SECRET = "phase6-reminders-route-secret";
  process.env.APP_URL = "https://gym.example";
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("POST /api/cron/send-reminders", () => {
  it("returns 401 without the bearer header", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 401 on wrong bearer", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: { authorization: "Bearer wrong" },
      }),
    );
    expect(res.status).toBe(401);
  });

  it("returns 200 + summary JSON on correct bearer", async () => {
    const res = await POST(
      new Request("http://localhost/api/cron/send-reminders", {
        method: "POST",
        headers: { authorization: "Bearer phase6-reminders-route-secret" },
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      evaluated: number;
      sent_3d: number;
      sent_1d: number;
      sent_overdue: number;
      skipped: number;
      failed: number;
    };
    expect(typeof json.evaluated).toBe("number");
    expect(typeof json.sent_3d).toBe("number");
    expect(typeof json.sent_1d).toBe("number");
    expect(typeof json.sent_overdue).toBe("number");
    expect(typeof json.skipped).toBe("number");
    expect(typeof json.failed).toBe("number");
  });
});
