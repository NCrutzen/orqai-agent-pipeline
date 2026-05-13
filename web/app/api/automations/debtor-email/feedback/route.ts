/**
 * Phase 82.4 Plan 02 — POST /api/automations/debtor-email/feedback.
 *
 * Auth-gated, zod-validated route that synchronously INSERTs one row into
 * public.email_feedback via createAdminClient (no Inngest hop — feedback
 * writes are pure data capture with no replay risk and a ≤200ms p95
 * latency target).
 *
 * Trust-boundary contract:
 *   - T-82.4-02-01: operator_id is server-stamped from auth.getUser().id.
 *     The zod schema does NOT include the field; client payloads cannot
 *     smuggle a fake operator_id.
 *   - T-82.4-02-02: prose_notes capped at 4000 chars via zod .max(4000).
 *     corrected_value capped at 500 chars.
 *   - Stage 4 is rejected at the zod layer (stage must be 0|1|2|3) per
 *     CONTEXT.md <out_of_scope>.
 */
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadFeedbackMap } from "@/lib/automations/debtor-email/feedback/load-feedback-map";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const FeedbackPayload = z.object({
  email_id: z.string().uuid(),
  stage: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
  verdict: z.enum(["confirm", "override", "unclear"]),
  corrected_value: z.string().max(500).optional(),
  prose_notes: z.string().max(4000).optional(),
});

const FeedbackReadQuery = z.object({
  email_id: z.string().uuid(),
  stage: z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]),
});

export async function POST(req: NextRequest): Promise<NextResponse> {
  // T-82.4-02-01: server-side auth — never trust client-supplied operator_id.
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }

  const parsed = FeedbackPayload.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  // T-82.4-02-01: operator_id stamped server-side. The zod schema omits
  // operator_id, so a client-supplied value cannot reach parsed.data.
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("email_feedback")
    .insert({
      email_id: parsed.data.email_id,
      stage: parsed.data.stage,
      verdict: parsed.data.verdict,
      corrected_value: parsed.data.corrected_value ?? null,
      prose_notes: parsed.data.prose_notes ?? null,
      operator_id: user.id,
    })
    .select("id")
    .single();

  if (error) {
    return NextResponse.json(
      { error: `email_feedback insert failed: ${error.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}

/**
 * Phase 82.5 Plan 01 — GET /api/automations/debtor-email/feedback?email_id=X&stage=N.
 *
 * Read-back endpoint for StageFeedbackPanel refresh-after-write.
 * Mirrors POST's auth + admin-client posture; reads query params instead of
 * a JSON body. Delegates the actual SELECT + per-operator bucketing to
 * loadFeedbackMap so the server-side prefetch path (D-1) and this per-row
 * fetch path stay byte-identical in shape.
 *
 * Trust-boundary contract:
 *   - T-82.5.01-01: 401 when auth.getUser() returns null.
 *   - T-82.5.01-02: zod-validates email_id (uuid) + stage (0|1|2|3).
 *   - T-82.5.01-03: response strips raw operator_id; only display_name
 *     (email local-part) crosses the boundary.
 */
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }

  const emailIdRaw = req.nextUrl.searchParams.get("email_id");
  const stageRaw = req.nextUrl.searchParams.get("stage");
  const parsed = FeedbackReadQuery.safeParse({
    email_id: emailIdRaw,
    stage: stageRaw === null ? undefined : Number(stageRaw),
  });
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.message }, { status: 400 });
  }

  const admin = createAdminClient();
  const map = await loadFeedbackMap(
    admin,
    [parsed.data.email_id],
    parsed.data.stage,
    user.id,
  );
  const entry = map[parsed.data.email_id] ?? { own_latest: null, others: [] };

  return NextResponse.json(entry, { status: 200 });
}
