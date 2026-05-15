export type PaymentMethod = "cash" | "bank_transfer";
export type PaymentKind = "membership" | "admission";

export type PaymentInput = {
  amountLkr: string;
  method: PaymentMethod;
  kind: PaymentKind;
  reference: string;
  notes: string;
};

export type ValidatedPayment = {
  amountLkr: string; // normalized to "X.XX"
  method: PaymentMethod;
  kind: PaymentKind;
  reference: string | null;
  notes: string | null;
};

export type PaymentValidationResult =
  | { ok: true; value: ValidatedPayment }
  | { ok: false; errors: Partial<Record<keyof PaymentInput, string>> };

const ALLOWED_METHODS: PaymentMethod[] = ["cash", "bank_transfer"];
const ALLOWED_KINDS: PaymentKind[] = ["membership", "admission"];

export function validatePaymentInput(raw: PaymentInput): PaymentValidationResult {
  const errors: Partial<Record<keyof PaymentInput, string>> = {};

  const amountNum = Number(raw.amountLkr);
  if (!Number.isFinite(amountNum) || amountNum <= 0) {
    errors.amountLkr = "Amount must be a positive number";
  }

  if (!ALLOWED_METHODS.includes(raw.method)) {
    errors.method = "Method must be cash or bank_transfer";
  }

  if (!ALLOWED_KINDS.includes(raw.kind)) {
    errors.kind = "Kind must be membership or admission";
  }

  const reference = raw.reference.trim() || null;
  const notes = raw.notes.trim() || null;

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: {
      amountLkr: amountNum.toFixed(2),
      method: raw.method,
      kind: raw.kind,
      reference,
      notes,
    },
  };
}
