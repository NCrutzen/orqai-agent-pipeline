"use server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomUUID } from "node:crypto";

// CR-02: allowlisted extensions — prevents path injection and non-image content types
// in the storage bucket. Any ext not in this set falls back to "jpg".
const ALLOWED_PHOTO_EXTS = new Set(["jpg", "jpeg", "png", "webp", "heic"]);

/**
 * Mint a signed upload URL for the support-tickets-photos Supabase Storage bucket.
 *
 * Security:
 * - T-05-11: Auth guard — only authenticated MR staff can mint a URL.
 * - T-05-09: Path is server-generated (YYYY-MM/userId/uuid.{ext}); client never supplies the path.
 * - T-05-10: createAdminClient() (service_role) is used only here; key never reaches the browser.
 * - CR-02: ext is allowlisted (ALLOWED_PHOTO_EXTS); unknown extensions fall back to "jpg".
 *
 * Modelled on getVideoUploadUrl (get-upload-url.ts lines 1–49):
 * - Uses createClient() for the auth check (user-token).
 * - Uses createAdminClient() for createSignedUploadUrl (Pitfall 6: user-token fails RLS).
 */
export async function getPhotoUploadUrl(ext: string): Promise<
  { signedUrl: string; path: string; token: string } | { error: string }
> {
  // 1. Auth guard (mirrors lib/systems/actions.ts:214-221 — T-05-11)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return { error: "Not authenticated" };
  }

  // 2. Server-generated path: YYYY-MM/userId/uuid.{safeExt} (T-05-09 anti-traversal)
  // CR-02: allowlist the extension so crafted filenames cannot inject path components
  // (e.g. "../../other-user") or store non-image content types (e.g. "svg", "php").
  const safeExt = ALLOWED_PHOTO_EXTS.has(ext.toLowerCase()) ? ext.toLowerCase() : "jpg";
  const month = new Date().toISOString().slice(0, 7);
  const path = `${month}/${user.id}/${randomUUID()}.${safeExt}`;

  // 3. Admin client required for createSignedUploadUrl (Pitfall 6 — user-token fails with
  //    "new row violates row-level security policy"; confirmed in analog at line 223)
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from("support-tickets-photos")
    .createSignedUploadUrl(path);

  // 4. Inspect .error explicitly (supabase-js v2 does not throw — analog lines 228-232)
  if (error || !data) {
    return { error: error?.message ?? "Failed to create photo upload URL" };
  }

  return { signedUrl: data.signedUrl, path: data.path, token: data.token };
}
