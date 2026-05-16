import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/db";
import { profiles, plans, payments } from "@/db/schema";
import { eq, like } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({
  requireMemberProfile: vi.fn(),
}));

import { POST } from "@/app/api/payments/payhere/checkout/route";
import { requireMemberProfile } from "@/lib/auth";

const CLERK_PREFIX = "user_phase4_chkroute_";
const PLAN_NAME = "Phase4CheckoutRoutePlan";

async function clean() {
  const ms = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const m of ms) {
    await db.delete(payments).where(eq(payments.memberId, m.id));
  }
  await db.delete(plans).where(eq(plans.name, PLAN_NAME));
  await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

let memberId: string;
let planId: string;

beforeEach(async () => {
  await clean();
  process.env.PAYHERE_MERCHANT_ID = "1230000";
  process.env.PAYHERE_MERCHANT_SECRET = "test-secret";
  process.env.PAYHERE_MODE = "sandbox";
  process.env.PAYHERE_NOTIFY_URL = "http://localhost:3000/api/payments/payhere/webhook";
  process.env.APP_URL = "http://localhost:3000";

  const [pl] = await db
    .insert(plans)
    .values({ name: PLAN_NAME, durationDays: 30, priceLkr: "1500" })
    .returning();
  planId = pl.id;
  const [m] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}member`,
      email: "chkroute@x.lk",
      fullName: "Checkout Route Member",
      role: "member",
      status: "active",
    })
    .returning();
  memberId = m.id;
  vi.mocked(requireMemberProfile).mockResolvedValue({
    id: memberId,
    clerkUserId: `${CLERK_PREFIX}member`,
    role: "member",
    status: "active",
    fullName: "Checkout Route Member",
    email: "chkroute@x.lk",
    phone: null,
    photoUrl: null,
    gymId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Awaited<ReturnType<typeof requireMemberProfile>>);
});

afterEach(async () => {
  await clean();
  vi.restoreAllMocks();
});

function postJson(body: unknown): Request {
  return new Request("http://localhost/api/payments/payhere/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/payments/payhere/checkout", () => {
  it("returns 200 HTML with an auto-post form on happy path", async () => {
    const res = await POST(postJson({ planId }));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") ?? "").toContain("text/html");
    const html = await res.text();
    expect(html).toContain("https://sandbox.payhere.lk/pay/checkout");
    expect(html).toContain('name="merchant_id"');
    expect(html).toContain('value="1230000"');
    expect(html).toMatch(/name="hash"\s+value="[A-F0-9]{32}"/);

    const rows = await db
      .select()
      .from(payments)
      .where(eq(payments.memberId, memberId));
    expect(rows.length).toBe(1);
    expect(rows[0].status).toBe("pending");
  });

  it("returns 400 on missing planId", async () => {
    const res = await POST(postJson({}));
    expect(res.status).toBe(400);
  });

  it("returns 400 on inactive plan", async () => {
    await db.update(plans).set({ isActive: false }).where(eq(plans.id, planId));
    const res = await POST(postJson({ planId }));
    expect(res.status).toBe(400);
  });
});
