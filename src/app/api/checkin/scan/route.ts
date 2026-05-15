import { NextResponse } from "next/server";
import { verifyKioskToken } from "@/lib/qr/token";
import { _recordAttendanceByMemberIdUnsafe } from "@/lib/checkin/record";
import { todayInSL } from "@/lib/tz";

const MAX_TOKEN_AGE_SECONDS = 24 * 60 * 60;

export async function POST(req: Request) {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { token, memberId } = (body ?? {}) as {
    token?: unknown;
    memberId?: unknown;
  };
  if (typeof token !== "string" || typeof memberId !== "string") {
    return NextResponse.json(
      { error: "token and memberId required" },
      { status: 400 },
    );
  }
  const secret = process.env.QR_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "Server misconfigured" },
      { status: 500 },
    );
  }
  const verify = await verifyKioskToken({
    token,
    now: new Date(),
    secret,
    maxAgeSeconds: MAX_TOKEN_AGE_SECONDS,
  });
  if (!verify.ok) {
    return NextResponse.json(
      { error: "Invalid token", reason: verify.reason },
      { status: 401 },
    );
  }

  const result = await _recordAttendanceByMemberIdUnsafe({
    memberId,
    todaySL: todayInSL(),
    source: "qr_scan",
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, reason: result.reason });
  }
  return NextResponse.json({
    ok: true,
    member: {
      fullName: result.member.fullName,
      planName: result.member.planName,
      expiresOn: result.member.expiresOn,
      daysRemaining: result.member.daysRemaining,
    },
  });
}
