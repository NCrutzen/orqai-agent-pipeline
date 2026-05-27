// Plan 01-02 Task 2 — POST /api/automations/support-tickets/ingest.
//
// The Walking Skeleton ingest route for the support-tickets swarm. Modeled
// directly on web/app/api/automations/debtor-email/ingest/route.ts but
// adapted for:
//   - dedicated HMAC env var (SUPPORT_INGEST_SECRET — separate from
//     ZAPIER_INGEST_SECRET per Plan 01-02 D-04 cross-swarm blast-radius
//     isolation)
//   - thin three-module composition (types / stage-0-safety / stage-1-router)
//   - canonical telemetry to public.pipeline_events with
//     swarm_type='support-tickets' and email_id=null
//   - NO inngest.send (Stage 2 worker is a Phase 2 concern; firing now would
//     produce orphaned events)
//   - NO openai / anthropic / orq imports (Phase 1 LLM-free invariant)
//
// Trust boundaries (see Plan 01-02 <threat_model>):
//   T-01-09 HMAC bypass → constant-time compare in stage-0-safety.ts
//   T-01-10 unknown-field injection → ingestBodySchema.strict()
//   T-01-11 rejected-request repudiation → every rejection (except invalid
//           JSON, body is unparseable) writes one stage=0 pipeline_events row
//   T-01-13 large-body DoS → video_size_bytes pre-check (rejects > 200 MB)

import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  ingestBodySchema,
  type IngestResponse,
} from "@/lib/automations/support-tickets/types";
import { runStage0Safety } from "@/lib/automations/support-tickets/stage-0-safety";
import { runStage1Router } from "@/lib/automations/support-tickets/stage-1-router";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const TRIGGERED_BY = "support-tickets:ingest";

/**
 * Best-effort write of a single rejection-tier stage=0 pipeline_events row.
 * Wrapped in its own try/catch — the ingest endpoint MUST NOT 500 because
 * the telemetry write hiccupped (T-01-11 mitigation is best-effort by
 * construction; durability of the *rejection signal* is secondary to the
 * primary HTTP contract).
 */
async function logRejectionEvent(
  supabase: ReturnType<typeof createAdminClient>,
  decision: string,
  decision_details: Record<string, unknown>,
  duration_ms: number,
  external_task_id: string | null,
): Promise<void> {
  try {
    await supabase.from("pipeline_events").insert({
      swarm_type: "support-tickets",
      stage: 0,
      decision,
      decision_details,
      duration_ms,
      triggered_by: TRIGGERED_BY,
      // Carry the external_task_id when available so rejections can be
      // correlated with the upstream tracker entity. May be null for
      // pre-validation rejections (e.g. bad JSON) where we can't extract it.
      email_id: external_task_id,
    });
  } catch (err) {
    console.error(
      "[support-tickets/ingest] failed to log rejection event:",
      String(err),
    );
  }
}

export async function POST(
  req: NextRequest,
): Promise<NextResponse<IngestResponse>> {
  const secret = process.env.SUPPORT_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json(
      {
        action: "failed",
        error: "SUPPORT_INGEST_SECRET not configured",
      },
      { status: 500 },
    );
  }

  // (1) Parse body before HMAC, but only structurally — we need decision_details
  //     to log the rejection. If the JSON itself is invalid we fail-closed at
  //     400 (T-01-11 documented tradeoff: bad-JSON rejections leave no trace
  //     because we can't extract submitter_id).
  let parsed: unknown;
  try {
    parsed = await req.json();
  } catch {
    return NextResponse.json(
      { action: "failed", error: "invalid json" },
      { status: 400 },
    );
  }

  // (2) Zod-validate against the strict schema BEFORE Stage 0 — we want
  //     bad-enum (400) to take precedence over rate-limit (429). This matches
  //     the curl smoke-test expectations in Task 3.
  const safe = ingestBodySchema.safeParse(parsed);
  if (!safe.success) {
    const issue = safe.error.issues[0];
    const pathStr = issue.path.join(".") || "<root>";
    return NextResponse.json(
      {
        action: "failed",
        error: `${pathStr}: ${issue.message}`,
      },
      { status: 400 },
    );
  }
  const body = safe.data;

  const supabase = createAdminClient();

  // (3) Stage 0 safety — composes HMAC + body-size + rate-limit.
  const stage0 = await runStage0Safety({
    headers: req.headers,
    body,
    supabase,
    env: process.env as Record<string, string | undefined>,
  });

  if (stage0.verdict !== "safe") {
    // Persist the rejection signal (T-01-11). Mapping verdict → response:
    //   rejected_hmac        → 401
    //   rejected_body_size   → 413
    //   rejected_rate_limit  → 429 (+ Retry-After header)
    await logRejectionEvent(
      supabase,
      stage0.verdict,
      stage0.decision_details,
      stage0.duration_ms,
      body.external_task_id,
    );

    const reasonMap: Record<string, string> = {
      rejected_hmac: "hmac",
      rejected_body_size: "body_size",
      rejected_rate_limit: "rate_limit",
    };
    const responseInit: ResponseInit = { status: stage0.http_status };
    if (stage0.verdict === "rejected_rate_limit" && stage0.retry_after_seconds) {
      responseInit.headers = {
        "Retry-After": String(stage0.retry_after_seconds),
      };
    }
    return NextResponse.json(
      {
        action: "rejected_safety",
        reason: reasonMap[stage0.verdict] ?? stage0.verdict,
      },
      responseInit,
    );
  }

  // (4) Stage 1 router — pure deterministic switch. No I/O.
  const stage1 = runStage1Router({ user_chosen_type: body.user_chosen_type });

  // (5) Persist the canonical support_tickets row. submission_id is
  //     server-generated only — clients cannot supply it (strict schema).
  const submission_id = randomUUID();
  const ticketInsert = await supabase
    .from("support_tickets")
    .insert({
      submission_id,
      attempt: 1,
      submitter_id: body.submitter_id,
      user_chosen_type: body.user_chosen_type,
      external_task_id: body.external_task_id,
      video_storage_url: body.video_storage_url ?? null,
      device_fingerprint: body.device_fingerprint ?? null,
      submitted_at: body.submitted_at ?? new Date().toISOString(),
    })
    .select("id")
    .single();

  if (ticketInsert.error || !ticketInsert.data?.id) {
    const errText = ticketInsert.error?.message ?? "unknown insert error";
    console.error(
      "[support-tickets/ingest] support_tickets insert failed:",
      errText,
    );
    return NextResponse.json(
      { action: "failed", error: `support_tickets insert failed: ${errText}` },
      { status: 500 },
    );
  }
  const support_ticket_id = ticketInsert.data.id as string;

  // (6) Persist Stage 0 + Stage 1 pipeline_events rows in a single .insert([...])
  //     call — Supabase atomically commits the array, which is the closest we
  //     get to transaction semantics from the REST layer.
  try {
    await supabase.from("pipeline_events").insert([
      {
        swarm_type: "support-tickets",
        stage: 0,
        decision: "safe",
        decision_details: stage0.decision_details,
        duration_ms: stage0.duration_ms,
        triggered_by: TRIGGERED_BY,
        automation_run_id: support_ticket_id,
        // For support-tickets, email_id carries external_task_id — the
        // stable cross-stage entity handle (counterpart of email_id for
        // email swarms). Generic name on the canonical pipeline_events
        // table, polymorphic semantic per swarm.
        email_id: body.external_task_id,
      },
      {
        swarm_type: "support-tickets",
        stage: 1,
        decision: `route_${stage1.branch_target}`,
        decision_details: {
          submitter_id: body.submitter_id,
          user_chosen_type: body.user_chosen_type,
          support_ticket_id,
          external_task_id: body.external_task_id,
        },
        duration_ms: stage1.duration_ms,
        triggered_by: TRIGGERED_BY,
        automation_run_id: support_ticket_id,
        email_id: body.external_task_id,
      },
    ]);
  } catch (err) {
    // Telemetry-write failure is non-fatal — the user-visible support_tickets
    // row already exists. We log and return 200 so the submitter retry path
    // doesn't duplicate the ticket. The pipeline_events backfill is a Phase
    // 2+ concern.
    console.error(
      "[support-tickets/ingest] pipeline_events insert failed (non-fatal):",
      String(err),
    );
  }

  // (7) Phase 2: emit `support-tickets/stage-2.requested` event with
  //     { support_ticket_id } here once the Stage 2 worker exists. NOT in
  //     Phase 1 — firing now would produce orphaned events.

  return NextResponse.json({
    action: "stage_0_dispatched",
    submission_id,
    automation_run_id: support_ticket_id,
  });
}
