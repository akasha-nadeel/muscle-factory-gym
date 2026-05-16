import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { like } from "drizzle-orm";

vi.mock("@/lib/auth", () => ({
  requireAdmin: vi.fn(),
}));

import { GET } from "@/app/api/admin/search-members/route";
import { requireAdmin } from "@/lib/auth";

const CLERK_PREFIX = "user_phase7_test_search_";

async function clean() {
  await db
    .delete(profiles)
    .where(like(profiles.clerkUserId, `${CLERK_PREFIX}%`));
}

beforeEach(async () => {
  await clean();
  vi.mocked(requireAdmin).mockResolvedValue(undefined as never);
});

afterEach(async () => {
  await clean();
  vi.restoreAllMocks();
});

describe("GET /api/admin/search-members", () => {
  it("returns 401 when requireAdmin throws", async () => {
    vi.mocked(requireAdmin).mockRejectedValueOnce(new Error("not admin"));
    const res = await GET(
      new Request("http://localhost/api/admin/search-members?q=akila"),
    );
    expect(res.status).toBe(401);
  });

  it("returns empty results for q shorter than 2 chars (no DB hit)", async () => {
    const res = await GET(
      new Request("http://localhost/api/admin/search-members?q=a"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { results: unknown[] };
    expect(json.results).toEqual([]);
  });

  it("returns matching members by full name", async () => {
    await db.insert(profiles).values({
      clerkUserId: `${CLERK_PREFIX}target`,
      email: "akila.target@x.lk",
      fullName: "Akila Target",
      role: "member",
      status: "active",
    });
    const res = await GET(
      new Request("http://localhost/api/admin/search-members?q=akila"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as { results: { fullName: string }[] };
    const names = json.results.map((r) => r.fullName);
    expect(names).toContain("Akila Target");
  });

  it("returns matching members by gym_id prefix", async () => {
    await db.insert(profiles).values({
      clerkUserId: `${CLERK_PREFIX}gymid`,
      email: "gymid@x.lk",
      fullName: "GymId Member",
      role: "member",
      status: "active",
      gymId: 1500,
    });
    const res = await GET(
      new Request("http://localhost/api/admin/search-members?q=1500"),
    );
    expect(res.status).toBe(200);
    const json = (await res.json()) as {
      results: { fullName: string; gymId: number | null }[];
    };
    const names = json.results.map((r) => r.fullName);
    expect(names).toContain("GymId Member");
  });
});
