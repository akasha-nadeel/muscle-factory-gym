const MAX_BYTES = 5 * 1024 * 1024; // 5 MB (matches Supabase bucket limit)

export const WORKOUT_PLAN_MAX_BYTES = MAX_BYTES;

export function validateWorkoutPlanFile(input: {
  type: string;
  size: number;
}): { ok: true } | { ok: false; error: string } {
  if (input.type !== "application/pdf") {
    return { ok: false, error: "PDF files only" };
  }
  if (input.size > MAX_BYTES) {
    return { ok: false, error: "File too large (max 5 MB)" };
  }
  if (input.size === 0) {
    return { ok: false, error: "File is empty" };
  }
  return { ok: true };
}
