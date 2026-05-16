import { NextResponse } from "next/server";
import { verifyWebhookSignature } from "@/lib/payhere/sign";
import {
  _processWebhookUnsafe,
  type VerifiedWebhookPayload,
} from "@/lib/payhere/process";
import { todayInSL } from "@/lib/tz";

export async function POST(req: Request) {
  const secret = process.env.PAYHERE_MERCHANT_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "PayHere not configured" },
      { status: 500 },
    );
  }

  let form: URLSearchParams;
  try {
    const text = await req.text();
    form = new URLSearchParams(text);
  } catch {
    return NextResponse.json({ error: "invalid body" }, { status: 400 });
  }

  const payload: Record<string, string> = {};
  for (const [k, v] of form.entries()) payload[k] = v;

  if (!verifyWebhookSignature(payload, secret)) {
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  const result = await _processWebhookUnsafe({
    verified: payload as unknown as VerifiedWebhookPayload,
    todaySL: todayInSL(),
  });

  // Always 200 after signature verify — non-2xx triggers PayHere retries
  // and the outcome is informational, not failure.
  if (!result.ok) {
    console.warn(
      `[payhere webhook] order_id=${payload.order_id} reason=${result.reason}`,
    );
    return NextResponse.json({ ok: false, reason: result.reason });
  }
  return NextResponse.json({ ok: true, outcome: result.outcome });
}
