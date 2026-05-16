import { createHash } from "node:crypto";

export type PayHereStatus =
  | { kind: "found"; statusCode: "2" | "0" | "-1" | "-2" | "-3"; amount: string; currency: string }
  | { kind: "not_found" };

/**
 * Calls the PayHere Payment Search API to look up a single order by its
 * reference. Returns `not_found` when PayHere says they have no record.
 *
 * Endpoint:  https://sandbox.payhere.lk/merchant/v1/payment/search?order_id=...
 * Live URL:  https://www.payhere.lk/merchant/v1/payment/search?order_id=...
 * Auth:      Basic auth via merchant_id + MD5(merchant_secret).toUpperCase()
 *            (the same approach used by the checkout hash)
 */
export async function fetchPayHereStatus(
  reference: string,
  opts: {
    merchantId: string;
    merchantSecret: string;
    mode: "sandbox" | "live";
  },
): Promise<PayHereStatus> {
  const host =
    opts.mode === "live" ? "www.payhere.lk" : "sandbox.payhere.lk";
  const url = `https://${host}/merchant/v1/payment/search?order_id=${encodeURIComponent(
    reference,
  )}`;

  const auth =
    "Basic " +
    Buffer.from(
      `${opts.merchantId}:${createHash("md5")
        .update(opts.merchantSecret)
        .digest("hex")
        .toUpperCase()}`,
    ).toString("base64");

  const res = await fetch(url, {
    method: "GET",
    headers: { Authorization: auth },
  });
  if (res.status === 404) return { kind: "not_found" };
  if (!res.ok) {
    throw new Error(`PayHere status API returned ${res.status}`);
  }
  const json = (await res.json()) as {
    data?: {
      status_code?: string;
      amount_detail?: { gross?: string; currency?: string };
    };
  };
  const sc = json.data?.status_code;
  const amount = json.data?.amount_detail?.gross;
  const currency = json.data?.amount_detail?.currency;
  if (!sc || !amount || !currency) return { kind: "not_found" };
  if (!["2", "0", "-1", "-2", "-3"].includes(sc)) {
    throw new Error(`PayHere returned unknown status_code: ${sc}`);
  }
  return {
    kind: "found",
    statusCode: sc as "2" | "0" | "-1" | "-2" | "-3",
    amount,
    currency,
  };
}
