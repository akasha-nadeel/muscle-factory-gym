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
