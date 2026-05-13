/**
 * Phase 82.3 Plan 08 — GET /api/automations/audit/signed-url.
 *
 * Mints 1h Supabase Storage signed URLs for objects inside the
 * `automation-screenshots` bucket. Called by `ScreenshotThumb` (Plan 05) on
 * every Show-details expander open.
 *
 * Trust-boundary contract (see PLAN §threat_model):
 *   - T-82.3-04: operator auth via `auth.getUser()` BEFORE any path parsing
 *     or storage call. Unauthenticated → 401.
 *   - T-82.3-01: `path` query param is untrusted; whitelist regex
 *     `^[a-zA-Z0-9_\-./]+$`, reject `..`, reject leading `/`, length ≤512.
 *   - T-82.3-02: service-role key stays server-side via
 *     `@/lib/supabase/admin` (server-only). NEVER returned in response body.
 *   - T-82.3-05: `Cache-Control: private, max-age=200` caps burst clicks.
 *
 * Bucket scoped to a constant — there is no way for the caller to choose a
 * different bucket. Bucket name and TTL are not user-controllable.
 */
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "automation-screenshots";
const TTL_SECONDS = 3600;
const PATH_REGEX = /^[a-zA-Z0-9_\-./]+$/;
const PATH_MAX_LEN = 512;

export async function GET(req: Request): Promise<NextResponse> {
  // T-82.3-04: operator auth gate FIRST — never reveal whether a path exists
  // to anonymous callers.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  // T-82.3-01: path validation precedence — missing → invalid_path → ok.
  const url = new URL(req.url);
  const path = url.searchParams.get("path");
  if (!path) {
    return NextResponse.json({ error: "missing_path" }, { status: 400 });
  }
  if (
    path.length > PATH_MAX_LEN ||
    path.startsWith("/") ||
    path.includes("..") ||
    !PATH_REGEX.test(path)
  ) {
    return NextResponse.json({ error: "invalid_path" }, { status: 400 });
  }

  // T-82.3-02: service-role client server-side only.
  const admin = createAdminClient();
  const { data, error } = await admin.storage
    .from(BUCKET)
    .createSignedUrl(path, TTL_SECONDS);

  if (error || !data?.signedUrl) {
    console.error("[signed-url] storage error", { path, error });
    return NextResponse.json({ error: "storage_error" }, { status: 500 });
  }

  const expiresAt = new Date(Date.now() + TTL_SECONDS * 1000).toISOString();

  // T-82.3-05: short private cache mirrors the 200ms client-side cache in
  // ScreenshotThumb. Browsers may de-dupe rapid expander toggles.
  return NextResponse.json(
    { url: data.signedUrl, expires_at: expiresAt },
    {
      status: 200,
      headers: { "Cache-Control": "private, max-age=200" },
    },
  );
}
