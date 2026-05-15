import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { db } from "@/db";
import { profiles, plans, memberships, attendance } from "@/db/schema";
import { eq, like } from "drizzle-orm";
import { POST } from "@/app/api/checkin/scan/route";
import { signKioskToken } from "@/lib/qr/token";

const CLERK_PREFIX = "user_phase3_scan_";
const PLAN_NAME = "Phase3ScanPlan";

async function clean() {
  const ms = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const m of ms) {
    await db.delete(attendance).where(eq(attendance.memberId, m.id));
    await db.delete(memberships).where(eq(memberships.memberId, m.id));
  }
  await db.delete(plans).where(eq(plans.name, PLAN_NAME));
  await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

let memberId: string;

beforeEach(async () => {
  await clean();
  process.env.QR_SECRET = "test-secret-for-scan-route";
  const [pl] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "5000" })
    .returning();
  const [m] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}member`,
      email: "scan@x.lk",
      fullName: "Scan Member",
      role: "member",
      status: "active",
      gymId: 1300,
    })
    .returning();
  memberId = m.id;
  await db.insert(memberships).values({
    memberId,
    planId: pl.id,
    startDate: "2026-05-01",
    endDate: "2099-12-31",
    status: "active",
  });
});

afterEach(clean);

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/checkin/scan", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/checkin/scan", () => {
  it("inserts attendance and returns member info on happy path", async () => {
    const token = await signKioskToken({
      kioskId: "main",
      now: new Date(),
      secret: process.env.QR_SECRET!,
    });
    const res = await POST(makeRequest({ token, memberId }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean };
    expect(json.ok).toBe(true);
    const rows = await db
      .select()
      .from(attendance)
      .where(eq(attendance.memberId, memberId));
    expect(rows.length).toBe(1);
    expect(rows[0].source).toBe("qr_scan");
  });

  it("returns 401 on tampered token", async () => {
    const token = await signKioskToken({
      kioskId: "main",
      now: new Date(),
      secret: process.env.QR_SECRET!,
    });
    const parts = token.split(".");
    const tampered = `evil.${parts[1]}.${parts[2]}`;
    const res = await POST(makeRequest({ token: tampered, memberId }));
    expect(res.status).toBe(401);
  });

  it("returns 401 on expired token (>24h old)", async () => {
    const oldToken = await signKioskToken({
      kioskId: "main",
      now: new Date(Date.now() - 25 * 60 * 60 * 1000),
      secret: process.env.QR_SECRET!,
    });
    const res = await POST(makeRequest({ token: oldToken, memberId }));
    expect(res.status).toBe(401);
  });

  it("returns 400 on missing fields", async () => {
    const res = await POST(makeRequest({ memberId }));
    expect(res.status).toBe(400);
  });

  it("returns 200 with ok=false for eligibility rejections (e.g., not_found)", async () => {
    const token = await signKioskToken({
      kioskId: "main",
      now: new Date(),
      secret: process.env.QR_SECRET!,
    });
    const res = await POST(
      makeRequest({
        token,
        memberId: "00000000-0000-0000-0000-000000000000",
      }),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { ok: boolean; reason?: string };
    expect(json.ok).toBe(false);
    expect(json.reason).toBe("not_found");
  });
});
