export type PlanInput = {
  name: string;
  durationDays: string;
  priceLkr: string;
};

export type ValidatedPlan = {
  name: string;
  durationDays: number;
  priceLkr: string;
};

export type PlanValidationResult =
  | { ok: true; value: ValidatedPlan }
  | { ok: false; errors: Partial<Record<keyof PlanInput, string>> };

export function validatePlanInput(raw: PlanInput): PlanValidationResult {
  const errors: Partial<Record<keyof PlanInput, string>> = {};

  const name = raw.name.trim();
  if (!name) errors.name = "Name is required";

  const durationDays = Number(raw.durationDays);
  if (!Number.isInteger(durationDays) || durationDays <= 0) {
    errors.durationDays = "Duration must be a positive whole number of days";
  }

  const priceNum = Number(raw.priceLkr);
  if (!Number.isFinite(priceNum) || priceNum < 0) {
    errors.priceLkr = "Price must be zero or positive";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };

  return {
    ok: true,
    value: { name, durationDays, priceLkr: priceNum.toFixed(2) },
  };
}
