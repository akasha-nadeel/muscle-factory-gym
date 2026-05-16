import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/db";
import { profiles, payments } from "@/db/schema";
import { eq, like } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({
  requireMemberProfile: vi.fn(),
}));

import { GET } from "@/app/api/payments/payhere/status/[ref]/route";
import { requireMemberProfile } from "@/lib/auth";

const CLERK_PREFIX = "user_phase4_statusroute_";

async function clean() {
  const ms = await db
    .select()
    .from(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
  for (const m of ms) {
    await db.delete(payments).where(eq(payments.memberId, m.id));
  }
  await db.delete(profiles).where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

let memberId: string;
let otherMemberId: string;

beforeEach(async () => {
  await clean();
  const [m1] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}owner`,
      email: "owner@x.lk",
      fullName: "Owner",
      role: "member",
      status: "active",
    })
    .returning();
  memberId = m1.id;
  const [m2] = await db
    .insert(profiles)
    .values({
      clerkUserId: `${CLERK_PREFIX}stranger`,
      email: "stranger@x.lk",
      fullName: "Stranger",
      role: "member",
      status: "active",
    })
    .returning();
  otherMemberId = m2.id;

  await db.insert(payments).values({
    memberId,
    amountLkr: "1500.00",
    method: "payhere",
    kind: "membership",
    status: "pending",
    reference: "gym_status_test",
    recordedBy: memberId,
  });
});

afterEach(async () => {
  await clean();
  vi.restoreAllMocks();
});

function call(ref: string) {
  return GET(
    new Request(`http://localhost/api/payments/payhere/status/${ref}`),
    { params: Promise.resolve({ ref }) },
  );
}

describe("GET /api/payments/payhere/status/[ref]", () => {
  it("returns the status for the owning member", async () => {
    vi.mocked(requireMemberProfile).mockResolvedValue({
      id: memberId,
    } as Awaited<ReturnType<typeof requireMemberProfile>>);
    const res = await call("gym_status_test");
    expect(res.status).toBe(200);
    const json = (await res.json()) as { status: string };
    expect(json.status).toBe("pending");
  });

  it("returns 403 when a different member asks", async () => {
    vi.mocked(requireMemberProfile).mockResolvedValue({
      id: otherMemberId,
    } as Awaited<ReturnType<typeof requireMemberProfile>>);
    const res = await call("gym_status_test");
    expect(res.status).toBe(403);
  });

  it("returns 404 for an unknown reference", async () => {
    vi.mocked(requireMemberProfile).mockResolvedValue({
      id: memberId,
    } as Awaited<ReturnType<typeof requireMemberProfile>>);
    const res = await call("gym_does_not_exist");
    expect(res.status).toBe(404);
  });
});
