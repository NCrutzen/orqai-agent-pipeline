"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";

/**
 * Mint a signed upload URL for the support-tickets-videos Supabase Storage bucket.
 *
 * Security:
 * - T-04-09: Auth guard — only authenticated MR staff can mint a URL.
 * - T-04-13: Path is server-generated (YYYY-MM/userId/uuid.webm); client never supplies the path.
 * - T-04-14: createAdminClient() (service_role) is used only here; key never reaches the browser.
 *
 * Modelled on createUploadUrl (lib/systems/actions.ts:210-233):
 * - Uses createClient() for the auth check (user-token).
 * - Uses createAdminClient() for createSignedUploadUrl (Pitfall 6: user-token fails RLS).
 */
export async function getVideoUploadUrl(): Promise<
  { signedUrl: string; path: string; token: string } | { error: string }
> {
  // 1. Auth guard (mirrors lib/systems/actions.ts:214-221 — T-04-09)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // 2. Server-generated path: YYYY-MM/userId/uuid.webm (T-04-13 anti-traversal)
  const month = new Date().toISOString().slice(0, 7);
  const path = `${month}/${user.id}/${randomUUID()}.webm`;

  // 3. Admin client required for createSignedUploadUrl (Pitfall 6 — user-token fails with
  //    "new row violates row-level security policy"; confirmed in analog at line 223)
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("support-tickets-videos")
    .createSignedUploadUrl(path);

  // 4. Inspect .error explicitly (supabase-js v2 does not throw — analog lines 228-232)
  if (error || !data) {
    return { error: error?.message ?? "Failed to create upload URL" };
  }

  return { signedUrl: data.signedUrl, path: data.path, token: data.token };
}
