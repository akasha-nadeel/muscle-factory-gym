import { db } from "@/db";
import { profiles, plans, payments } from "@/db/schema";
import { eq } from "drizzle-orm";
import { buildCheckoutFields, type CheckoutFields } from "./sign";
import { generateOrderReference } from "./reference";

export type CreateCheckoutInput = {
  memberId: string;
  planId: string;
  merchantId: string;
  merchantSecret: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
};

export type CreateCheckoutResult =
  | { ok: true; reference: string; fields: CheckoutFields }
  | { ok: false; error: string };

/**
 * Inserts a pending payments row for an online PayHere checkout and
 * returns the form fields the browser must POST to the PayHere hosted
 * checkout URL.
 *
 * On error, no row is inserted.
 */
export async function _createCheckoutUnsafe(
  input: CreateCheckoutInput,
): Promise<CreateCheckoutResult> {
  const [plan] = await db
    .select()
    .from(plans)
    .where(eq(plans.id, input.planId))
    .limit(1);
  if (!plan) return { ok: false, error: "Plan not found" };
  if (!plan.isActive) return { ok: false, error: "Plan is disabled" };

  const [member] = await db
    .select()
    .from(profiles)
    .where(eq(profiles.id, input.memberId))
    .limit(1);
  if (!member) return { ok: false, error: "Member not found" };
  if (member.status !== "active") {
    return { ok: false, error: "Member is not active" };
  }
  if (member.role !== "member") {
    return { ok: false, error: "Only members can use online payment" };
  }

  const reference = generateOrderReference();
  const amount = Number(plan.priceLkr).toFixed(2);

  await db.insert(payments).values({
    memberId: input.memberId,
    membershipId: null,
    planId: input.planId,
    amountLkr: amount,
    method: "payhere",
    kind: "membership",
    status: "pending",
    reference,
    recordedBy: input.memberId,
    notes: `PayHere checkout for ${plan.name}`,
  });

  const [firstName, ...rest] = member.fullName.split(/\s+/);
  const lastName = rest.join(" ") || firstName;
  const fields = buildCheckoutFields({
    merchantId: input.merchantId,
    merchantSecret: input.merchantSecret,
    orderId: reference,
    amountLkr: amount,
    items: plan.name,
    firstName,
    lastName,
    email: member.email,
    phone: member.phone ?? "",
    returnUrl: input.returnUrl,
    cancelUrl: input.cancelUrl,
    notifyUrl: input.notifyUrl,
  });

  return { ok: true, reference, fields };
}
