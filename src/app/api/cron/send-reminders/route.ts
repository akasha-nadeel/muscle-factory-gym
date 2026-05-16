import { NextResponse } from "next/server";
import { _sendRemindersUnsafe } from "@/lib/cron/send-reminders";
import { makeResendMailer } from "@/lib/email/resend-mailer";
import { todayInSL } from "@/lib/tz";

export async function POST(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const appUrl = process.env.APP_URL ?? "http://localhost:3000";
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

  let mailer;
  try {
    mailer = makeResendMailer();
  } catch (err) {
    console.warn(
      `[reminders route] makeResendMailer failed: ${
        err instanceof Error ? err.message : String(err)
      }`,
    );
    return NextResponse.json(
      { error: "mailer not configured" },
      { status: 500 },
    );
  }

  const summary = await _sendRemindersUnsafe({
    mailer,
    todaySL: todayInSL(),
    appUrl,
  });
  return NextResponse.json(summary);
}
