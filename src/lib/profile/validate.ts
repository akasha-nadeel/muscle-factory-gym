export type ProfileEditInput = { fullName: string; phone: string };

export type ProfileEditResult =
  | { ok: true; value: { fullName: string; phone: string | null } }
  | { ok: false; errors: Partial<Record<keyof ProfileEditInput, string>> };

export function validateProfileEdit(raw: ProfileEditInput): ProfileEditResult {
  const errors: Partial<Record<keyof ProfileEditInput, string>> = {};
  const fullName = raw.fullName.trim();
  if (!fullName) errors.fullName = "Name is required";

  const phoneRaw = raw.phone.trim();
  let phone: string | null = null;
  if (phoneRaw) {
    // Accept Sri Lankan phone formats: 10 digits starting 0, or +94 followed by 9 digits.
    const digits = phoneRaw.replace(/[\s-]/g, "");
    if (/^0\d{9}$/.test(digits) || /^\+94\d{9}$/.test(digits)) {
      phone = digits;
    } else {
      errors.phone = "Enter a valid Sri Lankan phone (07XXXXXXXX or +94XXXXXXXXX)";
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { fullName, phone } };
}
