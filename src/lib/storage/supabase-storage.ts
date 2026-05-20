import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * Supabase Storage wrapper for workout-plan PDFs.
 *
 * - Uses the SERVICE_ROLE key so all calls bypass RLS. This file must only
 *   ever be imported into server code. Never expose the service key to a
 *   browser bundle.
 * - The bucket itself must be private (no public reads). Members get file
 *   access via short-lived signed URLs generated server-side.
 */
const WORKOUT_PLANS_BUCKET = "workout-plans";

let cachedClient: SupabaseClient | null = null;

function client(): SupabaseClient {
  if (cachedClient) return cachedClient;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set for storage operations",
    );
  }
  cachedClient = createClient(url, key, { auth: { persistSession: false } });
  return cachedClient;
}

export async function uploadWorkoutPlan(input: {
  memberId: string;
  fileName: string;
  buffer: ArrayBuffer;
  contentType: string;
}): Promise<{ storagePath: string }> {
  const safeName = input.fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${input.memberId}/${Date.now()}-${safeName}`;
  const { error } = await client()
    .storage.from(WORKOUT_PLANS_BUCKET)
    .upload(path, input.buffer, {
      contentType: input.contentType,
      upsert: false,
    });
  if (error) throw error;
  return { storagePath: path };
}

export async function deleteWorkoutPlan(storagePath: string): Promise<void> {
  const { error } = await client()
    .storage.from(WORKOUT_PLANS_BUCKET)
    .remove([storagePath]);
  if (error) throw error;
}

export async function signedWorkoutPlanUrl(
  storagePath: string,
  options: { expiresInSeconds?: number; downloadAs?: string } = {},
): Promise<string> {
  const { expiresInSeconds = 3600, downloadAs } = options;
  const { data, error } = await client()
    .storage.from(WORKOUT_PLANS_BUCKET)
    .createSignedUrl(
      storagePath,
      expiresInSeconds,
      downloadAs ? { download: downloadAs } : undefined,
    );
  if (error || !data) {
    throw error ?? new Error("failed to generate signed URL");
  }
  return data.signedUrl;
}
