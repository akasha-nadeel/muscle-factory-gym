import { NextResponse } from "next/server";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { requireMemberProfile } from "@/lib/auth";

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ ref: string }> },
) {
  const member = await requireMemberProfile();
  const { ref } = await ctx.params;

  const [row] = await db
    .select({
      memberId: payments.memberId,
      status: payments.status,
      membershipId: payments.membershipId,
    })
    .from(payments)
    .where(
      and(eq(payments.reference, ref), eq(payments.method, "payhere")),
    )
    .limit(1);

  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });
  if (row.memberId !== member.id) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({
    status: row.status,
    hasMembership: row.membershipId !== null,
  });
}
