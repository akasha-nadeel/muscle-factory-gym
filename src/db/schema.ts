import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  numeric,
  date,
  timestamp,
  pgEnum,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

export const roleEnum = pgEnum("role", ["admin", "member"]);
export const profileStatusEnum = pgEnum("profile_status", [
  "pending",
  "active",
  "inactive",
]);
export const membershipStatusEnum = pgEnum("membership_status", [
  "active",
  "expired",
  "cancelled",
]);
export const paymentMethodEnum = pgEnum("payment_method", [
  "cash",
  "bank_transfer",
  "payhere",
]);
export const paymentStatusEnum = pgEnum("payment_status", [
  "pending",
  "succeeded",
  "failed",
  "refunded",
]);
export const paymentKindEnum = pgEnum("payment_kind", [
  "membership",
  "admission",
]);
export const checkinSourceEnum = pgEnum("checkin_source", [
  "qr_scan",
  "manual",
  "kiosk_id",
]);

export const profiles = pgTable(
  "profiles",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    clerkUserId: text("clerk_user_id").notNull().unique(),
    role: roleEnum("role").notNull().default("member"),
    status: profileStatusEnum("status").notNull().default("pending"),
    fullName: text("full_name").notNull(),
    email: text("email").notNull(),
    phone: text("phone"),
    photoUrl: text("photo_url"),
    gymId: integer("gym_id").unique(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("profiles_email_idx").on(t.email)],
);

export const plans = pgTable("plans", {
  id: uuid("id").defaultRandom().primaryKey(),
  name: text("name").notNull(),
  durationDays: integer("duration_days").notNull(),
  priceLkr: numeric("price_lkr", { precision: 12, scale: 2 }).notNull(),
  isActive: boolean("is_active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    planId: uuid("plan_id")
      .notNull()
      .references(() => plans.id, { onDelete: "restrict" }),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: membershipStatusEnum("status").notNull().default("active"),
    createdBy: uuid("created_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    reminder3dSentAt: timestamp("reminder_3d_sent_at", { withTimezone: true }),
    reminder1dSentAt: timestamp("reminder_1d_sent_at", { withTimezone: true }),
    lastOverdueReminderAt: timestamp("last_overdue_reminder_at", {
      withTimezone: true,
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("memberships_member_idx").on(t.memberId),
    index("memberships_end_date_idx").on(t.endDate),
  ],
);

export const payments = pgTable(
  "payments",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    membershipId: uuid("membership_id").references(() => memberships.id, {
      onDelete: "set null",
    }),
    planId: uuid("plan_id").references(() => plans.id, {
      onDelete: "set null",
    }),
    memberId: uuid("member_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    amountLkr: numeric("amount_lkr", { precision: 12, scale: 2 }).notNull(),
    method: paymentMethodEnum("method").notNull(),
    kind: paymentKindEnum("kind").notNull().default("membership"),
    status: paymentStatusEnum("status").notNull().default("pending"),
    reference: text("reference"),
    paidAt: timestamp("paid_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    recordedBy: uuid("recorded_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("payments_member_idx").on(t.memberId),
    // Unique reference is only required for SUCCEEDED rows — primarily to give
    // PayHere webhook delivery (Phase 4) an idempotency key. Refund rows
    // intentionally share the reference of the original payment they reverse,
    // so the constraint must NOT apply to status='refunded' or 'pending'.
    uniqueIndex("payments_reference_succeeded_unique")
      .on(t.reference)
      .where(sql`${t.reference} is not null and ${t.status} = 'succeeded'`),
  ],
);

// NOTE: One-check-in-per-day is enforced in application code at QR scan time
// (Phase 3), not at the DB level. Postgres won't allow a unique index on
// `(member_id, date(checked_in_at))` because `::date` on a timestamptz is
// not IMMUTABLE.
export const attendance = pgTable(
  "attendance",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "restrict" }),
    membershipId: uuid("membership_id").references(() => memberships.id, {
      onDelete: "set null",
    }),
    checkedInAt: timestamp("checked_in_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    checkedInBy: uuid("checked_in_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    source: checkinSourceEnum("source").notNull().default("qr_scan"),
  },
  (t) => [
    index("attendance_member_idx").on(t.memberId),
    index("attendance_checked_in_at_idx").on(t.checkedInAt),
  ],
);

// Phase 13: one workout plan per member (latest-only). New uploads upsert
// over the existing row and delete the previous file from Supabase Storage.
export const workoutPlans = pgTable(
  "workout_plans",
  {
    id: uuid("id").defaultRandom().primaryKey(),
    memberId: uuid("member_id")
      .notNull()
      .references(() => profiles.id, { onDelete: "cascade" }),
    fileName: text("file_name").notNull(),
    storagePath: text("storage_path").notNull(),
    fileSizeBytes: integer("file_size_bytes").notNull(),
    uploadedBy: uuid("uploaded_by").references(() => profiles.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("workout_plans_member_unique").on(t.memberId),
  ],
);
