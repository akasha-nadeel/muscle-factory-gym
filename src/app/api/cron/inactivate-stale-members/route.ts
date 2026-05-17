import { NextResponse } from "next/server";
import { _inactivateStaleMembersUnsafe } from "@/lib/cron/inactivate";
import { todayInSL } from "@/lib/tz";

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await _inactivateStaleMembersUnsafe({
    todaySL: todayInSL(),
  });
  return NextResponse.json(summary);
}

// Vercel cron invokes via GET.
export const GET = POST;
