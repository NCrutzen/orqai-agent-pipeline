"use server";

// 2026-05-19 — Stage 0 operator override server action.
//
// Bridges the UI's "Submit override (Stage 0)" footer button to the existing
// stage-0/safety-worker operator-override branch (stage-0-safety-worker.ts:145).
// The worker accepts an inbound `stage-0/email.received` event with
// `safety_overridden: true`, re-emits the row as decision='safe' with
// emit_source='operator-override', and dispatches classifier/screen.requested
// so Stage 1 picks the email back up.
//
// Trust boundary:
//   - operator_id is server-stamped (never trusted from the client).
//   - the corrected_value enum is locked to 'safe' | 'injection_suspected';
//     unknown values reject at the zod layer.
//   - the action looks up automation_run_id / message_id / source_mailbox /
//     entity / mailbox_id / from / fromName / receivedAt / subject / body_text
//     from existing rows (pipeline_events + automation_runs + emails); the
//     client never supplies any of these.

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

const OverrideStage0Input = z.object({
  email_id: z.string().uuid(),
  swarm_type: z.string().min(1),
  corrected_value: z.enum(["safe", "injection_suspected"]),
  prose_notes: z.string().max(4000).optional(),
});

export type OverrideStage0Input = z.infer<typeof OverrideStage0Input>;

export async function overrideStage0Safety(
  input: OverrideStage0Input,
): Promise<{ ok: true }> {
  const parsed = OverrideStage0Input.parse(input);

  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) throw new Error("overrideStage0Safety: unauthenticated");

  const admin = createAdminClient();

  // 1. Locate the Stage-0 pipeline_events row for (email_id, swarm). The
  //    automation_run_id on that row is the source-of-truth FK for resending
  //    the safety event.
  const peRes = await admin
    .from("pipeline_events")
    .select("id, automation_run_id, decision_details")
    .eq("swarm_type", parsed.swarm_type)
    .eq("stage", 0)
    .eq("email_id", parsed.email_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (peRes.error)
    throw new Error(`overrideStage0Safety: pipeline_events lookup failed: ${peRes.error.message}`);
  if (!peRes.data) throw new Error("overrideStage0Safety: no stage=0 row for this email");
  const automation_run_id = peRes.data.automation_run_id as string | null;
  if (!automation_run_id)
    throw new Error("overrideStage0Safety: pipeline_events row missing automation_run_id");

  // 2. Write the operator's verdict to email_feedback (learning substrate).
  //    Stage 0 = safety axis; corrected_value carries the post-override label.
  const fbRes = await admin
    .from("email_feedback")
    .insert({
      email_id: parsed.email_id,
      stage: 0,
      verdict: "override",
      corrected_value: parsed.corrected_value,
      prose_notes: parsed.prose_notes ?? null,
      operator_id: user.id,
    })
    .select("id")
    .single();
  if (fbRes.error)
    throw new Error(`overrideStage0Safety: email_feedback insert failed: ${fbRes.error.message}`);

  // 3. If the operator flipped the verdict to 'safe', re-trigger the Stage 0
  //    worker with safety_overridden=true so the row re-enters the pipeline
  //    (worker emits decision='safe' + fires classifier/screen.requested).
  //    'injection_suspected' overrides are telemetry-only — the row is
  //    already quarantined and Stage 0 has nothing to redo.
  if (parsed.corrected_value === "safe") {
    // Pull the original event-fields we need to satisfy the worker contract.
    // automation_runs.result is the original ingest payload echo.
    const arRes = await admin
      .from("automation_runs")
      .select("id, mailbox_id, result")
      .eq("id", automation_run_id)
      .maybeSingle();
    if (arRes.error)
      throw new Error(`overrideStage0Safety: automation_runs lookup failed: ${arRes.error.message}`);
    const arResult = (arRes.data?.result ?? {}) as Record<string, unknown>;

    // emails table holds the canonical subject + body + source_id (=message_id).
    const emRes = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("id, source_id, subject, body_text")
      .eq("id", parsed.email_id)
      .maybeSingle();
    if (emRes.error)
      throw new Error(`overrideStage0Safety: emails lookup failed: ${emRes.error.message}`);
    if (!emRes.data)
      throw new Error("overrideStage0Safety: email row not found");

    const message_id =
      (typeof arResult.message_id === "string" && arResult.message_id) ||
      (emRes.data.source_id ?? "");
    const source_mailbox =
      typeof arResult.source_mailbox === "string" ? arResult.source_mailbox : "";
    const entity =
      typeof arResult.entity === "string" ? arResult.entity : null;
    const from = typeof arResult.from === "string" ? arResult.from : null;
    const fromName =
      typeof arResult.fromName === "string" ? arResult.fromName : null;
    const receivedAt =
      typeof arResult.received_at === "string"
        ? arResult.received_at
        : typeof arResult.receivedAt === "string"
          ? arResult.receivedAt
          : null;

    await inngest.send({
      name: "stage-0/email.received",
      data: {
        automation_run_id,
        email_id: parsed.email_id,
        message_id,
        source_mailbox,
        subject: emRes.data.subject ?? "",
        body_text: emRes.data.body_text ?? "",
        swarm_type: parsed.swarm_type,
        entity,
        mailbox_id: arRes.data?.mailbox_id ?? null,
        from,
        fromName,
        receivedAt,
        safety_overridden: true,
      },
    });
  }

  return { ok: true };
}
