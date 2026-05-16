import { NextResponse } from "next/server";
import { requireMemberProfile } from "@/lib/auth";
import { _createCheckoutUnsafe } from "@/lib/payhere/checkout";

function checkoutUrl(): string {
  const mode = process.env.PAYHERE_MODE ?? "sandbox";
  return mode === "live"
    ? "https://www.payhere.lk/pay/checkout"
    : "https://sandbox.payhere.lk/pay/checkout";
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAutoPostHtml(action: string, fields: Record<string, string>) {
  const inputs = Object.entries(fields)
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(v)}" />`,
    )
    .join("\n");
  return `<!doctype html>
<html>
  <head><meta charset="utf-8"><title>Redirecting to PayHere…</title></head>
  <body>
    <p>Redirecting to PayHere…</p>
    <form id="f" method="POST" action="${escapeHtml(action)}">
      ${inputs}
    </form>
    <script>document.getElementById("f").submit();</script>
  </body>
</html>`;
}

export async function POST(req: Request) {
  const member = await requireMemberProfile();
  if (member.role !== "member" || member.status !== "active") {
    return NextResponse.json({ error: "not active" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const { planId } = (body ?? {}) as { planId?: unknown };
  if (typeof planId !== "string" || !planId) {
    return NextResponse.json({ error: "planId required" }, { status: 400 });
  }

  const merchantId = process.env.PAYHERE_MERCHANT_ID;
  const merchantSecret = process.env.PAYHERE_MERCHANT_SECRET;
  const notifyUrl = process.env.PAYHERE_NOTIFY_URL;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
  if (!merchantId || !merchantSecret || !notifyUrl) {
    return NextResponse.json(
      { error: "PayHere is not configured" },
      { status: 500 },
    );
  }

  const result = await _createCheckoutUnsafe({
    memberId: member.id,
    planId,
    merchantId,
    merchantSecret,
    notifyUrl,
    returnUrl: `${appUrl}/portal/pay/confirm?ref=`,
    cancelUrl: `${appUrl}/portal/pay/confirm?ref=`,
  });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  // We didn't know the reference until _createCheckoutUnsafe ran. Patch the
  // return/cancel URLs in the form fields now that we do.
  const ref = result.reference;
  const fields = {
    ...result.fields,
    return_url: `${appUrl}/portal/pay/confirm?ref=${encodeURIComponent(ref)}`,
    cancel_url: `${appUrl}/portal/pay/confirm?ref=${encodeURIComponent(ref)}`,
  };

  const html = buildAutoPostHtml(
    checkoutUrl(),
    fields as unknown as Record<string, string>,
  );
  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
