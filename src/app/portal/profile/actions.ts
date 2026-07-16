"use server";

import { db } from "@/db";
import { profiles } from "@/db/schema";
import { eq, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { requireMemberProfile } from "@/lib/auth";
import { validateProfileEdit, type ProfileEditInput } from "@/lib/profile/validate";

export type ProfileActionResult =
  | { ok: true }
  | { ok: false; errors: Partial<Record<keyof ProfileEditInput, string>> };

export async function _updateMyProfileUnsafe(
  profileId: string,
  raw: ProfileEditInput,
): Promise<ProfileActionResult> {
  const v = validateProfileEdit(raw);
  if (!v.ok) return { ok: false, errors: v.errors };
  await db
    .update(profiles)
    .set({ fullName: v.value.fullName, phone: v.value.phone, updatedAt: sql`now()` })
    .where(eq(profiles.id, profileId));
  return { ok: true };
}

export async function updateMyProfile(
  _prev: ProfileActionResult | undefined,
  formData: FormData,
): Promise<ProfileActionResult> {
  const me = await requireMemberProfile();
  const raw: ProfileEditInput = {
    fullName: String(formData.get("fullName") ?? ""),
    phone: String(formData.get("phone") ?? ""),
  };
  const result = await _updateMyProfileUnsafe(me.id, raw);
  if (result.ok) {
    revalidatePath("/portal/profile");
    revalidatePath("/portal");
  }
  return result;
}

export type PhoneActionResult = { ok: true } | { ok: false; error: string };

/**
 * Phone-only update for the quick-edit dialog on the portal home. The name
 * is edited via Clerk in that dialog (and mirrors to the DB through the
 * user.updated webhook), so here we touch ONLY the DB `phone` column and
 * leave `fullName` untouched. Reuses the shared validator by passing a
 * placeholder name so just the phone rule runs.
 */
export async function updateMyPhone(phone: string): Promise<PhoneActionResult> {
  const me = await requireMemberProfile();
  const v = validateProfileEdit({ fullName: "placeholder", phone });
  if (!v.ok) {
    return { ok: false, error: v.errors.phone ?? "Enter a valid phone number" };
  }
  await db
    .update(profiles)
    .set({ phone: v.value.phone, updatedAt: sql`now()` })
    .where(eq(profiles.id, me.id));
  revalidatePath("/portal/profile");
  revalidatePath("/portal");
  return { ok: true };
}
