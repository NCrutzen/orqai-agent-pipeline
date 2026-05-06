import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Sales-email ingest webhook (Phase 74-05, refactored 2026-05-06 for Outlook).
 *
 * Source-of-truth wiring (operator-confirmed 2026-05-06): the production
 * Zapier zap polls Microsoft Outlook for new mail in `verkoop@smeba.nl`
 * and POSTs each new message to this route. Earlier iteration polled
 * SugarCRM directly; the operator switched to Outlook because (a) the
 * Outlook trigger surfaces subject/body/from in trigger output (no
 * downstream Graph fetch needed), (b) Sugar is downstream of Outlook
 * anyway, and (c) Sugar cleanup becomes an OPTIONAL agent-tool concern
 * rather than a forced dispatch in the pipeline (Phase 75 territory).
 *
 * The route mirrors the debtor-email/ingest contract for the parts
 * that overlap (auth, INSERT into email_pipeline.emails, emit
 * stage-0/email.received) but hardcodes swarm_type='sales-email' +
 * entity=null at this ingest BOUNDARY.
 *
 * D-01 / D-02 (Phase 74 CONTEXT): swarm_type and entity are derived at
 * the ingest boundary (the route path encodes the swarm) and threaded
 * through the event so downstream registry-driven workers
 * (classifier-screen-worker, classifier-verdict-worker) never re-derive
 * them via DB lookup or string literal.
 *
 * Auth: shared-secret BODY field (per CLAUDE.md zapier-patterns.md —
 * Catch Hooks don't expose headers reliably in Zapier's field picker).
 * Env var: ZAPIER_INGEST_SECRET. NEVER use a request-header
 * auth scheme here (Bearer / X-*-Secret style); always read auth from the
 * JSON body field.
 *
 * Idempotency: Outlook's internet message-id is stable. We upsert
 * email_pipeline.emails on (source, source_id) so Zapier retries don't
 * double-emit stage-0/email.received.
 *
 * SendFn cast (CLAUDE.md Phase 65 commit dae6276): inngest.send is
 * invoked through this typed cast to keep the call site explicit and
 * avoid accidental destructuring (which loses `this`-binding).
 */

const SALES_SOURCE_MAILBOX = "verkoop@smeba.nl";
const SALES_SOURCE = "outlook" as const;

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

/** Outlook (Zapier "New Email" trigger) record subset used by this ingest.
 *  Field names match Zapier's typical Outlook output. We accept extra
 *  fields via passthrough; only the ones below are read. */
const OutlookEmailSchema = z
  .object({
    auth: z.string().min(1),
    // Either id or message_id is required (we prefer id when present).
    id: z.string().nullable().optional(),
    message_id: z.string().nullable().optional(),
    // Outlook trigger field names — Zapier typically surfaces these.
    subject: z.string().nullable().optional(),
    body_preview: z.string().nullable().optional(),
    body_plain: z.string().nullable().optional(),
    body: z.string().nullable().optional(), // raw body (may be html or plain)
    body_html: z.string().nullable().optional(),
    from_address: z.string().nullable().optional(),
    from_name: z.string().nullable().optional(),
    received_at: z.string().nullable().optional(),
  })
  .passthrough();

interface IngestResponse {
  ok: boolean;
  automation_run_id?: string;
  email_id?: string | null;
  source_id?: string;
  reason?: string;
  error?: string;
}

export async function POST(req: NextRequest): Promise<NextResponse<IngestResponse>> {
  const secret = process.env.ZAPIER_INGEST_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "ZAPIER_INGEST_SECRET not configured" },
      { status: 500 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = OutlookEmailSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: `validation: ${parsed.error.issues.map((i) => i.path.join(".") + ":" + i.message).join("; ")}` },
      { status: 400 },
    );
  }

  // Auth via body field (NOT a request header — see route docstring).
  if (parsed.data.auth !== secret) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const outlook = parsed.data;
  // Prefer Outlook's stable message_id (RFC 822) as source_id; fall back to
  // Zapier's `id` field which is also stable for a given Outlook trigger.
  const sourceId = (outlook.message_id?.trim() || outlook.id?.trim() || "").trim();
  if (!sourceId) {
    return NextResponse.json(
      { ok: false, error: "either message_id or id is required" },
      { status: 400 },
    );
  }

  const subject = outlook.subject?.trim() || "(no subject)";
  // Pick the best available body source. Plain text wins; fall back to
  // body (which may itself be plain or html); fall back to a stripped
  // version of body_html; fall back to the preview.
  const rawBody =
    outlook.body_plain?.trim() ||
    outlook.body?.trim() ||
    (outlook.body_html?.trim()
      ? outlook.body_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "") ||
    outlook.body_preview?.trim() ||
    "";

  const senderEmail = outlook.from_address?.trim() || null;
  const senderName = outlook.from_name?.trim() || null;
  const receivedAt = outlook.received_at?.trim() || new Date().toISOString();
  const internetMessageId = outlook.message_id?.trim() || sourceId;

  const admin = createAdminClient();
  const isoNow = new Date().toISOString();

  // 1) Upsert email_pipeline.emails on (source, source_id) for idempotency.
  //    Pattern mirrors debtor-email/ingest's resolveOrCreateEmailRow.
  let emailId: string | null = null;
  {
    const { data: existing } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("id")
      .eq("source", SALES_SOURCE)
      .eq("source_id", sourceId)
      .maybeSingle();

    if (existing?.id) {
      emailId = existing.id;
    } else {
      const { data: inserted, error: insertError } = await admin
        .schema("email_pipeline")
        .from("emails")
        .insert({
          source: SALES_SOURCE,
          source_id: sourceId,
          mailbox: SALES_SOURCE_MAILBOX,
          subject,
          body_text: rawBody,
          body_html: outlook.body_html ?? null,
          sender_email: senderEmail,
          sender_name: senderName,
          received_at: receivedAt,
          direction: "inbound",
          internet_message_id: internetMessageId,
        })
        .select("id")
        .single();

      if (insertError || !inserted?.id) {
        // Race: another concurrent invocation may have inserted the row;
        // re-select.
        const { data: refetch } = await admin
          .schema("email_pipeline")
          .from("emails")
          .select("id")
          .eq("source", SALES_SOURCE)
          .eq("source_id", sourceId)
          .maybeSingle();
        emailId = refetch?.id ?? null;
        if (!emailId) {
          console.error(
            `[sales-email/ingest] failed to upsert email_pipeline.emails for ${sourceId}:`,
            insertError,
          );
          return NextResponse.json(
            { ok: false, source_id: sourceId, error: `email upsert failed: ${insertError?.message ?? "unknown"}` },
            { status: 500 },
          );
        }
      } else {
        emailId = inserted.id;
      }
    }
  }

  // 2) Create the automation_runs row (status='pending') so the rest of
  //    the pipeline (Stage 0 safety, Stage 1 classifier, downstream
  //    handlers) has a stable id to attach verdicts and statuses to.
  const { data: runRow, error: runError } = await admin
    .from("automation_runs")
    .insert({
      automation: "sales-email-review",
      status: "pending",
      swarm_type: "sales-email",
      topic: null,
      entity: null,
      mailbox_id: null,
      result: {
        stage: "stage_0_safety_pending",
        message_id: sourceId,
        source_mailbox: SALES_SOURCE_MAILBOX,
        subject,
        from: senderEmail,
      },
      triggered_by: "zapier:outlook-ingest",
    })
    .select("id")
    .single();

  if (runError || !runRow?.id) {
    console.error(
      `[sales-email/ingest] failed to create automation_runs row for ${sourceId}:`,
      runError,
    );
    return NextResponse.json(
      { ok: false, source_id: sourceId, email_id: emailId, error: `automation_runs insert failed: ${runError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }
  const automationRunId = runRow.id as string;

  // 3) Emit stage-0/email.received with the Phase 74 extended payload
  //    (swarm_type required, entity nullable). Plan 02 made these required
  //    on the event type; the payload shape here matches debtor-email/ingest.
  try {
    await (inngest.send as unknown as SendFn)({
      name: "stage-0/email.received",
      data: {
        automation_run_id: automationRunId,
        email_id: emailId,
        message_id: sourceId,
        source_mailbox: SALES_SOURCE_MAILBOX,
        subject,
        body_text: rawBody,
        // Phase 74 D-01 — swarm_type derived at ingest boundary.
        swarm_type: "sales-email",
        // Phase 74 D-02 — sales-email has no entity concept.
        entity: null,
        // safety_overridden intentionally omitted — only operator-driven
        // re-emit sets it true.
      },
    });
  } catch (err) {
    console.error(
      `[sales-email/ingest] inngest.send failed for ${sourceId}:`,
      err,
    );
    // Mark the run failed so it's visible in observability rather than
    // hanging in 'pending'.
    await admin
      .from("automation_runs")
      .update({
        status: "failed",
        error_message: `stage-0 emit failed: ${String(err)}`,
        completed_at: isoNow,
      })
      .eq("id", automationRunId);
    return NextResponse.json(
      { ok: false, source_id: sourceId, email_id: emailId, automation_run_id: automationRunId, error: "stage-0 emit failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    automation_run_id: automationRunId,
    email_id: emailId,
    source_id: sourceId,
  });
}
