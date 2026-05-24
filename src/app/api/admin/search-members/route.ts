import { NextResponse } from "next/server";
import { db } from "@/db";
import { profiles } from "@/db/schema";
import { and, eq, ilike, or } from "drizzle-orm";
import { requireAdmin } from "@/lib/auth";
import { notWipedClause } from "@/lib/profiles/wiped";

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const q = (url.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ results: [] });
  }

  const pattern = `%${q}%`;
  const numeric = /^\d+$/.test(q) ? Number(q) : null;

  const matchers = [
    ilike(profiles.fullName, pattern),
    ilike(profiles.email, pattern),
  ];
  if (numeric !== null) {
    matchers.push(eq(profiles.gymId, numeric));
  }

  const rows = await db
    .select({
      id: profiles.id,
      fullName: profiles.fullName,
      email: profiles.email,
      gymId: profiles.gymId,
      photoUrl: profiles.photoUrl,
    })
    .from(profiles)
    .where(and(eq(profiles.role, "member"), notWipedClause, or(...matchers)))
    .orderBy(profiles.fullName)
    .limit(8);

  return NextResponse.json({ results: rows });
}
