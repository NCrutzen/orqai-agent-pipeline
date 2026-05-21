import { NextRequest, NextResponse } from "next/server";
import { fetchMessageBody, getMessageMeta, fetchConversationMessages } from "@/lib/outlook";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// info-routing swarm MVP — info@smeba.nl only. Mirror of the debtor-email
// ingest contract (docs/agentic-pipeline/README.md §5-stage funnel) MINUS
// the iController-bound fields:
//   - no debtor.labeling_settings lookup (info-routing has no per-mailbox
//     settings; enablement is the swarms.enabled flag in the registry)
//   - no EntityKey union (single brand 'smeba' for now; widen via swarms.entity_brand
//     when more info@<brand> mailboxes onboard)
//   - no mailbox_id (no iController company mapping)
//   - automation = 'info-routing-review' / swarm_type = 'info-routing'
//
// Auth uses ZAPIER_INGEST_SECRET in the request body (`auth` field). Matches
// the sales-email-ingest convention (CLAUDE.md: Zapier's Catch Hook field
// picker can't reliably surface custom headers — body field is the team
// standard). Reuses the same env var so no Vercel rotation needed.

const LEGACY_DEFAULT_MAILBOX = "info@smeba.nl";
const SWARM_TYPE = "info-routing";
const AUTOMATION = "info-routing-review";

interface IngestBody {
  auth?: string;
  messageId?: string;
  source_mailbox?: string;
}

interface IngestResponse {
  action:
    | "stage_0_dispatched"
    | "skipped_not_found"
    | "skipped_disabled"
    | "skipped_unknown_swarm"
    | "failed";
  messageId?: string;
  source_mailbox?: string;
  automation_run_id?: string;
  email_id?: string | null;
  reason?: string;
  error?: string;
}

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export async function POST(req: NextRequest): Promise<NextResponse<IngestResponse>> {
  const secret = process.env.ZAPIER_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json(
      { action: "failed", error: "ZAPIER_INGEST_SECRET not configured" },
      { status: 500 },
    );
  }
  let body: IngestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ action: "failed", error: "invalid json" }, { status: 400 });
  }
  if (body.auth !== secret) {
    return NextResponse.json({ action: "failed", error: "unauthorized" }, { status: 401 });
  }
  const messageId = body.messageId?.trim();
  if (!messageId) {
    return NextResponse.json({ action: "failed", error: "messageId required" }, { status: 400 });
  }

  const providedMailbox = body.source_mailbox?.trim();
  const sourceMailbox = providedMailbox ?? LEGACY_DEFAULT_MAILBOX;
  if (!providedMailbox) {
    console.warn(`[info-routing/ingest] Legacy Zap without source_mailbox — defaulting to ${LEGACY_DEFAULT_MAILBOX}.`);
  }

  const admin = createAdminClient();
  const isoNow = new Date().toISOString();

  // Registry gate: check swarms.enabled. If the registry row is disabled or
  // missing, refuse rather than silently dispatching.
  const swarmRes = await admin
    .schema("public")
    .from("swarms")
    .select("swarm_type, enabled")
    .eq("swarm_type", SWARM_TYPE)
    .maybeSingle();
  if (!swarmRes.data) {
    return NextResponse.json(
      {
        action: "skipped_unknown_swarm",
        messageId,
        source_mailbox: sourceMailbox,
        reason: `swarms row for ${SWARM_TYPE} not found`,
      },
      { status: 400 },
    );
  }
  if (!swarmRes.data.enabled) {
    return NextResponse.json({
      action: "skipped_disabled",
      messageId,
      source_mailbox: sourceMailbox,
      reason: `swarms.enabled=false for ${SWARM_TYPE}`,
    });
  }

  // Fetch the email. Graph body endpoint omits subject/from, so we hit
  // meta + body in parallel.
  let msg: {
    subject: string;
    from: string;
    fromName: string;
    receivedAt: string;
    bodyText: string;
    bodyUniqueText: string;
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
      automation: AUTOMATION,
      status: is404 ? "completed" : "failed",
      swarm_type: SWARM_TYPE,
      topic: null,
      entity: "smeba",
      mailbox_id: null,
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
    await emitAutomationRunStale(admin, AUTOMATION);
    return NextResponse.json({
      action: is404 ? "skipped_not_found" : "failed",
      messageId,
      source_mailbox: sourceMailbox,
      error: errText,
    });
  }

  // Resolve canonical email_pipeline.emails.id BEFORE Stage 0 dispatch.
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
          source: "zapier-info-routing-ingest",
          mailbox: sourceMailbox,
          subject: msg.subject,
          body_text: msg.bodyUniqueText,
          body_full_text: msg.bodyText,
          body_unique_text: msg.bodyUniqueText,
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

  // Soft-fetch prior 2 messages in the thread (same as debtor-email path).
  const conversationId =
    typeof msg.rawJson?.conversationId === "string"
      ? (msg.rawJson.conversationId as string)
      : "";
  if (resolvedEmailId && conversationId) {
    try {
      const priors = await fetchConversationMessages(
        sourceMailbox,
        conversationId,
        messageId,
        2,
      );
      if (priors.length > 0) {
        const rows = priors.map((p, idx) => ({
          email_id: resolvedEmailId!,
          position: idx + 1,
          source_message_id: p.sourceMessageId,
          sender_email: p.senderEmail,
          subject: p.subject,
          received_at: p.receivedAt || null,
          body_text: p.bodyText,
        }));
        await admin
          .schema("email_pipeline")
          .from("conversation_context")
          .upsert(rows, { onConflict: "email_id,position" });
      }
    } catch (convErr) {
      await admin.from("automation_runs").insert({
        automation: AUTOMATION,
        status: "completed",
        swarm_type: SWARM_TYPE,
        topic: null,
        entity: "smeba",
        mailbox_id: null,
        result: {
          stage: "phase83_conversation_context_fetch",
          email_id: resolvedEmailId,
          conversation_id: conversationId,
          outcome: "soft_failure",
        },
        error_message: String(convErr),
        triggered_by: "zapier:ingest",
        completed_at: new Date().toISOString(),
      });
    }
  }

  // Stage 0 placeholder + dispatch. Mirrors the debtor-email flow exactly,
  // only swarm_type / automation / entity differ. The Stage 0 worker is
  // registry-driven (REQ-6) and reads swarm_type from event.data.
  const stage0Insert = await admin
    .from("automation_runs")
    .insert({
      automation: AUTOMATION,
      status: "pending",
      swarm_type: SWARM_TYPE,
      topic: null,
      entity: "smeba",
      mailbox_id: null,
      result: {
        stage: "stage_0_safety_pending",
        message_id: messageId,
        source_mailbox: sourceMailbox,
        entity: "smeba",
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
      `[info-routing/ingest] failed to create Stage 0 placeholder for ${messageId}:`,
      errText,
    );
    return NextResponse.json(
      {
        action: "failed",
        messageId,
        source_mailbox: sourceMailbox,
        error: `automation_runs insert failed: ${errText}`,
      },
      { status: 500 },
    );
  }
  await emitAutomationRunStale(admin, AUTOMATION);

  try {
    await (inngest.send as unknown as SendFn)({
      name: "stage-0/email.received",
      data: {
        automation_run_id: stage0RunId,
        message_id: messageId,
        source_mailbox: sourceMailbox,
        email_id: resolvedEmailId,
        swarm_type: SWARM_TYPE,
        entity: "smeba",
        subject: msg.subject,
        sender_email: msg.from,
        body_text: msg.bodyUniqueText,
        body_html: msg.bodyHtml,
      },
    });
  } catch (sendErr) {
    console.error(
      `[info-routing/ingest] inngest.send failed for ${messageId}:`,
      sendErr,
    );
    return NextResponse.json(
      {
        action: "failed",
        messageId,
        source_mailbox: sourceMailbox,
        automation_run_id: stage0RunId,
        email_id: resolvedEmailId,
        error: `inngest.send failed: ${String(sendErr)}`,
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    action: "stage_0_dispatched",
    messageId,
    source_mailbox: sourceMailbox,
    automation_run_id: stage0RunId,
    email_id: resolvedEmailId,
  });
}
