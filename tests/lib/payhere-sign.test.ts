import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  buildCheckoutFields,
  verifyWebhookSignature,
} from "@/lib/payhere/sign";

const MERCHANT_ID = "1230000";
const MERCHANT_SECRET = "test-merchant-secret-not-real";

function md5Upper(s: string): string {
  return createHash("md5").update(s).digest("hex").toUpperCase();
}

describe("buildCheckoutFields", () => {
  it("returns the canonical PayHere form fields with a correct hash", () => {
    const fields = buildCheckoutFields({
      merchantId: MERCHANT_ID,
      merchantSecret: MERCHANT_SECRET,
      orderId: "gym_abc123",
      amountLkr: "1500.00",
      items: "Monthly Plan",
      firstName: "Test",
      lastName: "Member",
      email: "test@example.com",
      phone: "0770000000",
      returnUrl: "http://localhost:3000/portal/pay/confirm?ref=gym_abc123",
      cancelUrl: "http://localhost:3000/portal/pay/confirm?ref=gym_abc123",
      notifyUrl: "https://tunnel.example/api/payments/payhere/webhook",
    });

    expect(fields.merchant_id).toBe(MERCHANT_ID);
    expect(fields.order_id).toBe("gym_abc123");
    expect(fields.currency).toBe("LKR");
    expect(fields.amount).toBe("1500.00");
    expect(fields.items).toBe("Monthly Plan");

    const expected = md5Upper(
      MERCHANT_ID +
        "gym_abc123" +
        "1500.00" +
        "LKR" +
        md5Upper(MERCHANT_SECRET),
    );
    expect(fields.hash).toBe(expected);
  });

  it("normalizes integer-string amounts to 2 decimals", () => {
    const fields = buildCheckoutFields({
      merchantId: MERCHANT_ID,
      merchantSecret: MERCHANT_SECRET,
      orderId: "gym_x",
      amountLkr: "1500",
      items: "Plan",
      firstName: "T",
      lastName: "M",
      email: "t@x.lk",
      phone: "0770000000",
      returnUrl: "http://l/",
      cancelUrl: "http://l/",
      notifyUrl: "http://l/",
    });
    expect(fields.amount).toBe("1500.00");
  });
});

describe("verifyWebhookSignature", () => {
  function buildPayload(opts: {
    merchantId: string;
    orderId: string;
    payhereAmount: string;
    currency: string;
    statusCode: string;
    secret: string;
  }) {
    const sig = md5Upper(
      opts.merchantId +
        opts.orderId +
        opts.payhereAmount +
        opts.currency +
        opts.statusCode +
        md5Upper(opts.secret),
    );
    return {
      merchant_id: opts.merchantId,
      order_id: opts.orderId,
      payhere_amount: opts.payhereAmount,
      payhere_currency: opts.currency,
      status_code: opts.statusCode,
      md5sig: sig,
      payment_id: "PAY123",
    };
  }

  it("accepts a valid signature", () => {
    const p = buildPayload({
      merchantId: MERCHANT_ID,
      orderId: "gym_abc",
      payhereAmount: "1500.00",
      currency: "LKR",
      statusCode: "2",
      secret: MERCHANT_SECRET,
    });
    expect(verifyWebhookSignature(p, MERCHANT_SECRET)).toBe(true);
  });

  it("rejects a tampered amount", () => {
    const p = buildPayload({
      merchantId: MERCHANT_ID,
      orderId: "gym_abc",
      payhereAmount: "1500.00",
      currency: "LKR",
      statusCode: "2",
      secret: MERCHANT_SECRET,
    });
    p.payhere_amount = "100.00";
    expect(verifyWebhookSignature(p, MERCHANT_SECRET)).toBe(false);
  });

  it("rejects a wrong merchant_secret", () => {
    const p = buildPayload({
      merchantId: MERCHANT_ID,
      orderId: "gym_abc",
      payhereAmount: "1500.00",
      currency: "LKR",
      statusCode: "2",
      secret: MERCHANT_SECRET,
    });
    expect(verifyWebhookSignature(p, "other-secret")).toBe(false);
  });

  it("returns false when md5sig is missing", () => {
    expect(
      verifyWebhookSignature(
        {
          merchant_id: MERCHANT_ID,
          order_id: "gym_x",
          payhere_amount: "1500.00",
          payhere_currency: "LKR",
          status_code: "2",
        } as Record<string, string>,
        MERCHANT_SECRET,
      ),
    ).toBe(false);
  });

  it("returns false when any required field is missing", () => {
    expect(
      verifyWebhookSignature(
        {
          merchant_id: MERCHANT_ID,
          order_id: "gym_x",
          payhere_amount: "1500.00",
          md5sig: "XXX",
        } as Record<string, string>,
        MERCHANT_SECRET,
      ),
    ).toBe(false);
  });
});
