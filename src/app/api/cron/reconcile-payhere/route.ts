import { NextResponse } from "next/server";
import { _reconcilePendingUnsafe } from "@/lib/payhere/reconcile";
import { fetchPayHereStatus } from "@/lib/payhere/api";
import { todayInSL } from "@/lib/tz";

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
  const mode = (process.env.PAYHERE_MODE ?? "sandbox") as "sandbox" | "live";
  if (!cronSecret || !merchantId || !merchantSecret) {
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500 },
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const summary = await _reconcilePendingUnsafe({
    fetchStatus: (ref) =>
      fetchPayHereStatus(ref, { merchantId, merchantSecret, mode }),
    todaySL: todayInSL(),
    merchantId,
    merchantSecret,
  });

  return NextResponse.json(summary);
}
