import { and, desc, gte, inArray } from "drizzle-orm";
import { db } from "@/db";
import { payments } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import {
  slDateMonthsAgo,
  slDateToUTC,
  slMonthOf,
  startOfSLYear,
  todayInSL,
} from "@/lib/tz";

type Period = "12mo" | "ytd" | "all";

function parsePeriod(raw: string | null): Period {
  if (raw === "ytd" || raw === "all") return raw;
  return "12mo";
}

type Bucket = {
  month: string;
  membershipGross: number;
  admissionGross: number;
  cash: number;
  bank: number;
  refunds: number;
};

export async function GET(req: Request) {
  try {
    await requireAdmin();
  } catch {
    return new Response("unauthorized", { status: 401 });
  }

  const url = new URL(req.url);
  const period = parsePeriod(url.searchParams.get("period"));
  const todaySL = todayInSL();
  const cutoff = periodCutoff(period, todaySL);

  const baseConds = [inArray(payments.status, ["succeeded", "refunded"])];
  if (cutoff) baseConds.push(gte(payments.paidAt, slDateToUTC(cutoff)));

  const rows = await db
    .select()
    .from(payments)
    .where(and(...baseConds))
    .orderBy(desc(payments.paidAt));

  // Bucket by SL month — same algorithm as the page.
  const buckets = new Map<string, Bucket>();
  for (const r of rows) {
    const month = slMonthOf(r.paidAt);
    const b =
      buckets.get(month) ??
      ({
        month,
        membershipGross: 0,
        admissionGross: 0,
        cash: 0,
        bank: 0,
        refunds: 0,
      } as Bucket);
    const amount = Number(r.amountLkr);
    if (r.status === "refunded") {
      // Refund rows carry negative amounts. Surface them as a positive
      // refund total so the CSV reads naturally.
      b.refunds += Math.abs(amount);
    } else {
      if (r.kind === "membership") b.membershipGross += amount;
      else b.admissionGross += amount;
      if (r.method === "cash") b.cash += amount;
      else if (r.method === "bank_transfer") b.bank += amount;
    }
    buckets.set(month, b);
  }

  const sorted = Array.from(buckets.values()).sort((a, b) =>
    a.month.localeCompare(b.month),
  );

  // Build CSV. UTF-8 BOM so Excel opens it with the right encoding (matters
  // if anyone ever stores a Sinhala/Tamil note that ends up in a comment
  // column later — defensive).
  const BOM = "﻿";
  const header = [
    "Month",
    "Membership (LKR)",
    "Admission (LKR)",
    "Cash (LKR)",
    "Bank transfer (LKR)",
    "Refunds (LKR)",
    "Net total (LKR)",
  ].join(",");

  const dataLines = sorted.map((b) => {
    const net = b.membershipGross + b.admissionGross - b.refunds;
    return [
      b.month,
      b.membershipGross,
      b.admissionGross,
      b.cash,
      b.bank,
      b.refunds,
      net,
    ].join(",");
  });

  // Footer total row.
  const totals = sorted.reduce(
    (acc, b) => {
      acc.membership += b.membershipGross;
      acc.admission += b.admissionGross;
      acc.cash += b.cash;
      acc.bank += b.bank;
      acc.refunds += b.refunds;
      return acc;
    },
    { membership: 0, admission: 0, cash: 0, bank: 0, refunds: 0 },
  );
  const totalLine = [
    "Total",
    totals.membership,
    totals.admission,
    totals.cash,
    totals.bank,
    totals.refunds,
    totals.membership + totals.admission - totals.refunds,
  ].join(",");

  const csv = [BOM + header, ...dataLines, totalLine].join("\r\n");

  const filename = `gym-revenue-${period}-${todaySL}.csv`;
  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

function periodCutoff(period: Period, todaySL: string): string | null {
  if (period === "all") return null;
  if (period === "ytd") return startOfSLYear(todaySL);
  // 12mo
  return slDateMonthsAgo(12, todaySL);
}
