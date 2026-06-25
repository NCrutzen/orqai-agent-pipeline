"use server";

import { createClient } from "@/lib/supabase/server";
import { headers } from "next/headers";
import { randomUUID } from "node:crypto";

export async function submitTicket(formData: {
  user_chosen_type: string;
  title: string;
  omschrijving?: string;
  systeem: string | null | undefined;
  video_storage_url: string | null;
  soort?: "software" | "hardware";             // CONTRACT-03 (Phase 5)
  photo_storage_urls?: string[];               // CONTRACT-03 (Phase 5)
}): Promise<{ submission_id: string } | { error: string }> {
  // 1. Verify session + get submitter_id = M365 email (D-05b, T-02-05: spoofing mitigation)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // T-02-07: auth guard — unauthenticated callers cannot submit
  if (!user?.email) return { error: "not authenticated" };

  const submitter_id = user.email; // D-05b: M365 email, NOT user.id (UUID)

  // 2. Build ingest body — only known fields (T-02-08: .strict() rejects extras)
  // Note: title + omschrijving are not part of the ingest contract schema.
  // The ingest body accepts: submitter_id, user_chosen_type, external_task_id,
  // systeem, video_storage_url, video_size_bytes, device_fingerprint, submitted_at.
  // Title/description context reaches the pipeline via the voice-over in the video;
  // for the text-only path (Plan 02), these fields are stored in the form state only.
  const body: Record<string, unknown> = {
    submitter_id,
    user_chosen_type: formData.user_chosen_type,
    external_task_id: randomUUID(), // D-03: app-generated UUID
    video_storage_url: formData.video_storage_url ?? null,
    submitted_at: new Date().toISOString(),
  };

  // D-04: systeem spread only when truthy (T-02-08: never inject null/undefined)
  if (formData.systeem) {
    body.systeem = formData.systeem;
  }

  // CONTRACT-03 (Phase 5): soort + photo_storage_urls only when present
  // (.optional() in Zod accepts undefined; null or [] would fail .array() validation)
  if (formData.soort) {
    body.soort = formData.soort;
  }
  if (formData.photo_storage_urls && formData.photo_storage_urls.length > 0) {
    // WR-05: defense-in-depth — validate each photo URL starts with the expected
    // Supabase Storage public prefix before forwarding. The server action is
    // callable via Next.js action RPC from any authenticated client code, so an
    // attacker could pass arbitrary URLs; rejecting non-bucket URLs prevents
    // SSRF payloads and ensures the IT dashboard only renders known-safe images.
    const supabaseStoragePrefix = `${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/support-tickets-photos/`;
    for (const url of formData.photo_storage_urls) {
      if (!url.startsWith(supabaseStoragePrefix)) {
        return { error: "invalid photo URL" };
      }
    }
    body.photo_storage_urls = formData.photo_storage_urls;
  }

  // 3. Internal fetch to /ingest with HMAC secret (T-02-06: never in browser).
  // This is a same-app self-call, so target the request's OWN origin — otherwise
  // a hardcoded NEXT_PUBLIC_APP_URL routes the local dev form to the deployed
  // Vercel app, where local API changes (e.g. the CONTRACT-01 `systeem` field)
  // don't exist yet. In production the request host equals the canonical domain.
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = host
    ? `${proto}://${host}`
    : (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000");

  let res: Response;
  try {
    res = await fetch(
      `${base}/api/automations/support-tickets/ingest`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // T-02-06: SUPPORT_INGEST_SECRET is server-side only, NEVER NEXT_PUBLIC_
          "x-support-ingest-secret": process.env.SUPPORT_INGEST_SECRET ?? "",
        },
        body: JSON.stringify(body),
      },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { error: `fetch failed: ${msg}` };
  }

  if (!res.ok) {
    const text = await res.text().catch(() => String(res.status));
    return { error: `ingest failed: ${text}` };
  }

  const data = (await res.json()) as { submission_id?: string };
  if (!data.submission_id) {
    return { error: "ingest did not return a submission_id" };
  }
  return { submission_id: data.submission_id };
}
