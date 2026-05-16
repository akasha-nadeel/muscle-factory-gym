import { createHash, timingSafeEqual } from "node:crypto";

function md5Upper(s: string): string {
  return createHash("md5").update(s).digest("hex").toUpperCase();
}

/** Normalize "1500" or 1500 → "1500.00" (PayHere requires 2dp). */
function formatAmount(amountLkr: string): string {
  const n = Number(amountLkr);
  if (!Number.isFinite(n)) throw new Error("invalid amount");
  return n.toFixed(2);
}

export type CheckoutInput = {
  merchantId: string;
  merchantSecret: string;
  orderId: string;
  amountLkr: string;
  items: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  custom1?: string;
  custom2?: string;
};

export type CheckoutFields = {
  merchant_id: string;
  return_url: string;
  cancel_url: string;
  notify_url: string;
  order_id: string;
  items: string;
  currency: "LKR";
  amount: string;
  first_name: string;
  last_name: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  country: string;
  hash: string;
  custom_1?: string;
  custom_2?: string;
};

/**
 * Builds the form fields that the browser will auto-POST to PayHere's
 * hosted checkout. The `hash` is verified by PayHere; if it's wrong they
 * reject the redirect before charging anything.
 */
export function buildCheckoutFields(input: CheckoutInput): CheckoutFields {
  const amount = formatAmount(input.amountLkr);
  const hash = md5Upper(
    input.merchantId +
      input.orderId +
      amount +
      "LKR" +
      md5Upper(input.merchantSecret),
  );
  const fields: CheckoutFields = {
    merchant_id: input.merchantId,
    return_url: input.returnUrl,
    cancel_url: input.cancelUrl,
    notify_url: input.notifyUrl,
    order_id: input.orderId,
    items: input.items,
    currency: "LKR",
    amount,
    first_name: input.firstName,
    last_name: input.lastName,
    email: input.email,
    phone: input.phone,
    address: "",
    city: "Colombo",
    country: "Sri Lanka",
    hash,
  };
  if (input.custom1) fields.custom_1 = input.custom1;
  if (input.custom2) fields.custom_2 = input.custom2;
  return fields;
}

/**
 * Verify the md5sig on an incoming PayHere webhook payload.
 * Returns false if any required field is missing or the hash doesn't match.
 */
export function verifyWebhookSignature(
  payload: Record<string, unknown>,
  merchantSecret: string,
): boolean {
  const required = [
    "merchant_id",
    "order_id",
    "payhere_amount",
    "payhere_currency",
    "status_code",
    "md5sig",
  ] as const;
  for (const k of required) {
    if (typeof payload[k] !== "string") return false;
  }
  const expected = md5Upper(
    (payload.merchant_id as string) +
      (payload.order_id as string) +
      (payload.payhere_amount as string) +
      (payload.payhere_currency as string) +
      (payload.status_code as string) +
      md5Upper(merchantSecret),
  );
  const provided = payload.md5sig as string;
  if (expected.length !== provided.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
