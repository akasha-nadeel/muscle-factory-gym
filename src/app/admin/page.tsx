import { db } from "@/db";
import { profiles, payments, attendance, memberships, plans } from "@/db/schema";
import { and, eq, gte, lt, desc, sql } from "drizzle-orm";
import { requireAdminProfile } from "@/lib/auth";
import { Wallet, Users, UserPlus, AlertCircle } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { StatCard } from "@/components/admin/stat-card";
import {
  RecentPaymentsPanel,
  type RecentPayment,
} from "@/components/admin/recent-payments-panel";
import {
  RecentCheckinsPanel,
  type RecentCheckin,
} from "@/components/admin/recent-checkins-panel";
import { todayInSL } from "@/lib/tz";
import { computeOutstanding } from "@/lib/payments/outstanding";
import { getCurrentMembership } from "@/lib/memberships/current";

function startOfMonthSL(todaySL: string): string {
  return `${todaySL.slice(0, 7)}-01`;
}
function startOfNextMonthSL(todaySL: string): string {
  const [y, m] = todaySL.split("-").map(Number);
  if (m === 12) return `${y + 1}-01-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

export default async function AdminHome() {
  const admin = await requireAdminProfile();
  const today = todayInSL();
  const monthStart = startOfMonthSL(today);
  const monthEnd = startOfNextMonthSL(today);

  const [
    revenueRow,
    activeRow,
    pendingRow,
    activeMembers,
    paymentsRaw,
    checkinsRaw,
  ] = await Promise.all([
    db
      .select({ total: sql<string | null>`sum(${payments.amountLkr})` })
      .from(payments)
      .where(
        and(
          eq(payments.status, "succeeded"),
          gte(payments.paidAt, new Date(`${monthStart}T00:00:00Z`)),
          lt(payments.paidAt, new Date(`${monthEnd}T00:00:00Z`)),
        ),
      ),
    db
      .select({ count: sql<string>`count(*)` })
      .from(profiles)
      .where(and(eq(profiles.role, "member"), eq(profiles.status, "active"))),
    db
      .select({ count: sql<string>`count(*)` })
      .from(profiles)
      .where(eq(profiles.status, "pending")),
    db
      .select()
      .from(profiles)
      .where(and(eq(profiles.role, "member"), eq(profiles.status, "active"))),
    db
      .select({
        id: payments.id,
        memberId: payments.memberId,
        memberName: profiles.fullName,
        amountLkr: payments.amountLkr,
        method: payments.method,
        status: payments.status,
        paidAt: payments.paidAt,
      })
      .from(payments)
      .innerJoin(profiles, eq(profiles.id, payments.memberId))
      .where(eq(payments.status, "succeeded"))
      .orderBy(desc(payments.paidAt))
      .limit(10),
    db
      .select({
        id: attendance.id,
        memberId: attendance.memberId,
        memberName: profiles.fullName,
        gymId: profiles.gymId,
        checkedInAt: attendance.checkedInAt,
        source: attendance.source,
      })
      .from(attendance)
      .innerJoin(profiles, eq(profiles.id, attendance.memberId))
      .orderBy(desc(attendance.checkedInAt))
      .limit(10),
  ]);

  const revenue = Number(revenueRow[0]?.total ?? 0);
  const activeCount = Number(activeRow[0]?.count ?? 0);
  const pendingCount = Number(pendingRow[0]?.count ?? 0);

  // Compute total outstanding across active members. For each, fetch their
  // memberships + payments and call computeOutstanding(). For 500-member
  // scale this is ~500 queries — acceptable; optimize later if it bites.
  let outstandingTotal = 0;
  let outstandingPartial = false;
  for (const m of activeMembers) {
    try {
      const ms = await db
        .select({
          id: memberships.id,
          status: memberships.status,
          startDate: memberships.startDate,
          endDate: memberships.endDate,
          planPriceLkr: plans.priceLkr,
          planName: plans.name,
        })
        .from(memberships)
        .innerJoin(plans, eq(memberships.planId, plans.id))
        .where(eq(memberships.memberId, m.id));
      const current = getCurrentMembership(ms, today);
      if (!current) continue;
      const ps = await db
        .select()
        .from(payments)
        .where(eq(payments.memberId, m.id));
      const out = computeOutstanding({
        planPriceLkr: current.planPriceLkr,
        payments: ps.map((p) => ({
          id: p.id,
          amountLkr: p.amountLkr,
          kind: p.kind,
          status: p.status,
          membershipId: p.membershipId,
        })),
        membershipId: current.id,
      });
      outstandingTotal += Number(out);
    } catch (err) {
      console.warn(`[dashboard] outstanding calc failed for ${m.id}: ${err}`);
      outstandingPartial = true;
    }
  }

  return (
    <AdminPage breadcrumbs={[{ label: "Dashboard" }]}>
      <div className="space-y-6">
        <div>
          <h2 className="text-2xl font-semibold">Welcome, {admin.fullName}</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Here&apos;s what&apos;s happening at the gym today.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            icon={Wallet}
            label="Total revenue"
            value={`LKR ${revenue.toLocaleString()}`}
            caption="This month"
            accentColor="red"
          />
          <StatCard
            icon={Users}
            label="Active members"
            value={activeCount}
            caption="Current"
            accentColor="green"
          />
          <StatCard
            icon={UserPlus}
            label="Pending approvals"
            value={pendingCount}
            caption={pendingCount === 0 ? "All caught up" : "Needs review"}
            accentColor="amber"
          />
          <StatCard
            icon={AlertCircle}
            label="Outstanding dues"
            value={`LKR ${outstandingTotal.toLocaleString()}`}
            caption={outstandingPartial ? "(partial)" : "Across active members"}
            accentColor="red"
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <RecentPaymentsPanel rows={paymentsRaw as RecentPayment[]} />
          <RecentCheckinsPanel rows={checkinsRaw as RecentCheckin[]} />
        </div>
      </div>
    </AdminPage>
  );
}
