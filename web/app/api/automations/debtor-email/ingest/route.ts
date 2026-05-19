import { NextRequest, NextResponse } from "next/server";
import { fetchMessageBody, getMessageMeta } from "@/lib/outlook";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { ICONTROLLER_MAILBOXES } from "@/lib/automations/debtor-email/mailboxes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Backwards-compat default for legacy Zaps without source_mailbox.
const LEGACY_DEFAULT_MAILBOX = "debiteuren@smeba.nl";

type EntityKey = "smeba" | "berki" | "sicli-noord" | "sicli-sud" | "smeba-fire";

interface MailboxSettings {
  source_mailbox: string;
  entity: EntityKey | null;
  icontroller_company: string | null;
  ingest_enabled: boolean;
  auto_label_enabled: boolean;
  triage_shadow_mode: boolean;
}

interface IngestBody {
  messageId?: string;
  source_mailbox?: string;
}

interface IngestResponse {
  action:
    | "stage_0_dispatched"
    | "skipped_not_found"
    | "skipped_disabled"
    | "failed";
  messageId?: string;
  source_mailbox?: string;
  entity?: EntityKey;
  automation_run_id?: string;
  email_id?: string | null;
  reason?: string;
  error?: string;
}

// CLAUDE.md commit dae6276 — never destructure inngest.send; cast inline.
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

/**
 * Phase 82.2 D-A — THIN ingest route. Hands every inbound debtor email to
 * Stage 0 UNCONDITIONALLY (docs/agentic-pipeline/README.md §5-stage funnel).
 * Regex classify + whitelist + auto-action chain are owned by the Plan-06
 * thick Stage 1 worker (reached only after Stage 0 verdict='safe').
 *
 * Flow: auth → settings (ingest_enabled gate) → fetch Outlook → resolve
 * email_pipeline.emails.id → INSERT pending placeholder automation_runs →
 * inngest.send stage-0/email.received → 200.
 *
 * Replay-safety: API route, not an Inngest function — no step.run needed
 * (RESEARCH §Pattern 2). Zapier at-most-once + source_id dedupe handle
 * retries; worst case = orphan pending row (swept by automation-runs-sweeper).
 *
 * Hard cutover (D-C): no feature flag. In-flight emails finish on old path.
 */
export async function POST(req: NextRequest): Promise<NextResponse<IngestResponse>> {
  const secret = process.env.ZAPIER_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json(
      { action: "failed", error: "ZAPIER_INGEST_SECRET not configured" },
      { status: 500 },
    );
  }
  if (req.headers.get("x-zapier-secret") !== secret) {
    return NextResponse.json({ action: "failed", error: "unauthorized" }, { status: 401 });
  }

  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ action: "failed", error: "invalid json" }, { status: 400 });
  }
  const messageId = body.messageId?.trim();
  if (!messageId) {
    return NextResponse.json({ action: "failed", error: "messageId required" }, { status: 400 });
  }

  const providedMailbox = body.source_mailbox?.trim();
  const sourceMailbox = providedMailbox ?? LEGACY_DEFAULT_MAILBOX;
  if (!providedMailbox) {
    console.warn(`[debtor-email/ingest] Legacy Zap without source_mailbox — defaulting to ${LEGACY_DEFAULT_MAILBOX}.`);
  }

  const admin = createAdminClient();
  const isoNow = new Date().toISOString();

  // Phase 60-02 D-11: typed mailbox_id mirrors migration backfill.
  const mailboxId =
    ICONTROLLER_MAILBOXES[sourceMailbox as keyof typeof ICONTROLLER_MAILBOXES] ??
    null;

  // Resolve mailbox settings. Unknown mailbox → 400 (surface Zap config error).
  const settingsRes = await admin
    .schema("debtor")
    .from("labeling_settings")
    .select(
      "source_mailbox, entity, icontroller_company, ingest_enabled, auto_label_enabled, triage_shadow_mode",
    )
    .eq("source_mailbox", sourceMailbox)
    .maybeSingle();

  const settings: MailboxSettings | null = settingsRes.data
    ? {
        source_mailbox: settingsRes.data.source_mailbox,
        entity: settingsRes.data.entity as EntityKey | null,
        icontroller_company: settingsRes.data.icontroller_company,
        ingest_enabled: settingsRes.data.ingest_enabled,
        auto_label_enabled: settingsRes.data.auto_label_enabled,
        triage_shadow_mode: settingsRes.data.triage_shadow_mode,
      }
    : null;

  if (!settings) {
    return NextResponse.json(
      {
        action: "failed",
        messageId,
        source_mailbox: sourceMailbox,
        error: `unknown_mailbox: ${sourceMailbox} not in debtor.labeling_settings`,
      },
      { status: 400 },
    );
  }

  if (!settings.ingest_enabled) {
    return NextResponse.json({
      action: "skipped_disabled",
      messageId,
      source_mailbox: sourceMailbox,
      entity: settings.entity ?? undefined,
      reason: "ingest disabled for this mailbox",
    });
  }

  // Fetch the email. Graph body endpoint omits subject/from, so we hit
  // meta + body in parallel.
  let msg: {
    subject: string;
    from: string;
    fromName: string;
    receivedAt: string;
    bodyText: string;        // full thread (Plan 83-02 — was msg.body)
    bodyUniqueText: string;  // new bit only
    bodyHtml: string;
    rawJson: Record<string, unknown>;
  };
  try {
    const [meta, msgBody] = await Promise.all([
      getMessageMeta(sourceMailbox, messageId),
      fetchMessageBody(sourceMailbox, messageId),
    ]);
    msg = {
      subject: meta.subject,
      from: meta.from,
      fromName: meta.fromName,
      receivedAt: meta.receivedAt,
      bodyText: msgBody.bodyText,
      bodyUniqueText: msgBody.bodyUniqueText,
      bodyHtml: msgBody.bodyHtml,
      rawJson: msgBody.rawJson,
    };
  } catch (err) {
    const errText = String(err);
    const is404 = /\b404\b/.test(errText);
    await admin.from("automation_runs").insert({
      automation: "debtor-email-review",
      status: is404 ? "completed" : "failed",
      swarm_type: "debtor-email",
      topic: null,
      entity: settings.entity,
      mailbox_id: mailboxId,
      result: {
        stage: "zapier_ingest_fetch",
        message_id: messageId,
        source_mailbox: sourceMailbox,
        outcome: is404 ? "not_found" : "fetch_error",
      },
      error_message: errText,
      triggered_by: "zapier:ingest",
      completed_at: isoNow,
    });
    await emitAutomationRunStale(admin, "debtor-email-review");
    return NextResponse.json({
      action: is404 ? "skipped_not_found" : "failed",
      messageId,
      source_mailbox: sourceMailbox,
      entity: settings.entity ?? undefined,
      error: errText,
    });
  }

  // Resolve canonical email_pipeline.emails.id BEFORE Stage 0 dispatch.
  // pipeline_events_email_summary filters WHERE email_id IS NOT NULL; null
  // ids never surface in Bulk Review. Fetcher cron upserts ON CONFLICT
  // source_id later; we insert a minimal stub here if missing.
  let resolvedEmailId: string | null = null;
  {
    const { data: existing } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("id")
      .eq("source_id", messageId)
      .maybeSingle();
    if (existing?.id) {
      resolvedEmailId = existing.id;
    } else {
      const { data: inserted, error: insertError } = await admin
        .schema("email_pipeline")
        .from("emails")
        .insert({
          source_id: messageId,
          source: "zapier-debtor-ingest",
          mailbox: sourceMailbox,
          subject: msg.subject,
          // D-10 dual-write: keep body_text == bodyUniqueText (same semantics
          // as pre-Phase-83 behavior) so existing consumers don't regress.
          body_text: msg.bodyUniqueText,
          // D-03 new columns (Phase 83):
          body_full_text: msg.bodyText,
          body_unique_text: msg.bodyUniqueText,
          // D-02 always write (Phase 83):
          body_html: msg.bodyHtml,
          raw_json: msg.rawJson,
          sender_email: msg.from,
          sender_name: msg.fromName,
          received_at: msg.receivedAt,
          direction: "inbound",
        })
        .select("id")
        .single();
      if (insertError) {
        // Race: fetcher cron just upserted. Re-select.
        const { data: refetch } = await admin
          .schema("email_pipeline")
          .from("emails")
          .select("id")
          .eq("source_id", messageId)
          .maybeSingle();
        resolvedEmailId = refetch?.id ?? null;
      } else {
        resolvedEmailId = inserted?.id ?? null;
      }
    }
  }

  // D-A: UNCONDITIONAL Stage 0 placeholder. Worker UPDATE-by-id pattern
  // (stage-0-safety-worker.ts: WHERE id=automation_run_id AND status='pending')
  // stays compatible — INSERT fallback only runs for non-ingest entry points.
  const stage0Insert = await admin
    .from("automation_runs")
    .insert({
      automation: "debtor-email-review",
      status: "pending",
      swarm_type: "debtor-email",
      topic: null,
      entity: settings.entity,
      mailbox_id: mailboxId,
      result: {
        stage: "stage_0_safety_pending",
        message_id: messageId,
        source_mailbox: sourceMailbox,
        entity: settings.entity,
        subject: msg.subject,
        from: msg.from,
      },
      triggered_by: "zapier:ingest",
    })
    .select("id")
    .single();

  const stage0RunId = stage0Insert.data?.id as string | undefined;
  if (!stage0RunId) {
    const errText = stage0Insert.error?.message ?? "unknown insert error";
    console.error(
      `[debtor-email/ingest] failed to create Stage 0 placeholder for ${messageId}:`,
      errText,
    );
    return NextResponse.json(
      {
        action: "failed",
        messageId,
        source_mailbox: sourceMailbox,
        entity: settings.entity ?? undefined,
        error: `automation_runs insert failed: ${errText}`,
      },
      { status: 500 },
    );
  }
  await emitAutomationRunStale(admin, "debtor-email-review");

  // Fire Stage 0 unconditionally. Pitfall 5: NEVER set safety_overridden —
  // only the operator-driven re-emit path (Plan 05) does.
  try {
    await (inngest.send as unknown as SendFn)({
      name: "stage-0/email.received",
      data: {
        automation_run_id: stage0RunId,
        email_id: resolvedEmailId,
        message_id: messageId,
        source_mailbox: sourceMailbox,
        subject: msg.subject,
        // Stage 0 input: feed the full thread per Phase 83 D-01.
        body_text: msg.bodyText,
        // Phase 74 D-01/D-02 — swarm_type + entity threaded at ingest boundary.
        swarm_type: "debtor-email",
        entity: settings.entity ?? null,
        // Phase 82.2 Plan 07 D-A — passthrough for Plan 06 Stage 1 worker.
        mailbox_id: mailboxId,
        from: msg.from,
        fromName: msg.fromName,
        receivedAt: msg.receivedAt || isoNow,
        // safety_overridden omitted — Pitfall 5 (operator re-emit only).
      },
    });
  } catch (err) {
    const errText = String(err);
    console.error(
      `[debtor-email/ingest] stage-0 fire failed for ${messageId} (run=${stage0RunId}):`,
      errText,
    );
    // Mark placeholder failed so the row doesn't linger as pending.
    await admin
      .from("automation_runs")
      .update({
        status: "failed",
        error_message: `stage-0 emit failed: ${errText}`,
        completed_at: new Date().toISOString(),
      })
      .eq("id", stage0RunId);
    await emitAutomationRunStale(admin, "debtor-email-review");
    return NextResponse.json(
      {
        action: "failed",
        messageId,
        source_mailbox: sourceMailbox,
        entity: settings.entity ?? undefined,
        automation_run_id: stage0RunId,
        error: "stage-0 emit failed",
      },
      { status: 502 },
    );
  }

  return NextResponse.json({
    action: "stage_0_dispatched",
    messageId,
    source_mailbox: sourceMailbox,
    entity: settings.entity ?? undefined,
    automation_run_id: stage0RunId,
    email_id: resolvedEmailId,
  });
}
