import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Sales-email ingest webhook (Phase 74-05).
 *
 * Source-of-truth wiring (operator-confirmed 2026-05-06): the production
 * Zapier zap "MR || Sales email analyzer" polls SugarCRM (1-min cadence)
 * and POSTs new email records to this route. The route mirrors the
 * debtor-email/ingest contract for the parts that overlap (auth, INSERT
 * into email_pipeline.emails, emit stage-0/email.received) but accepts
 * a SugarCRM payload shape and hardcodes swarm_type='sales-email' +
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
 * Env var: DEBTOR_FETCH_WEBHOOK_SECRET. NEVER use a request-header
 * auth scheme here (Bearer / X-*-Secret style); always read auth from the
 * JSON body field.
 *
 * Idempotency: Sugar's record `id` is stable. We upsert
 * email_pipeline.emails on (source, source_id) so Zapier retries don't
 * double-emit stage-0/email.received.
 *
 * SendFn cast (CLAUDE.md Phase 65 commit dae6276): inngest.send is
 * invoked through this typed cast to keep the call site explicit and
 * avoid accidental destructuring (which loses `this`-binding).
 */

const SALES_SOURCE_MAILBOX = "verkoop@smeba.nl";
const SALES_SOURCE = "sugarcrm" as const;

type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

/** SugarCRM "Emails" record subset used by this ingest. We accept the
 *  raw record and extract what we need; unknown extra fields are ignored. */
const SugarEmailSchema = z
  .object({
    auth: z.string().min(1),
    id: z.string().min(1),
    name: z.string().nullable().optional(), // SugarCRM "name" === subject
    description: z.string().nullable().optional(), // plain-text body
    description_html: z.string().nullable().optional(),
    from_addr_name: z.string().nullable().optional(),
    from_addr_email: z.string().nullable().optional(),
    date_entered: z.string().nullable().optional(),
    date_sent: z.string().nullable().optional(),
    message_id: z.string().nullable().optional(), // SugarCRM's stored RFC 822 message-id (if present)
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
  const secret = process.env.DEBTOR_FETCH_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "DEBTOR_FETCH_WEBHOOK_SECRET not configured" },
      { status: 500 },
    );
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid json" }, { status: 400 });
  }

  const parsed = SugarEmailSchema.safeParse(raw);
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

  const sugar = parsed.data;
  const sugarId = sugar.id.trim();

  // Map SugarCRM → canonical email_pipeline.emails columns.
  const subject = sugar.name?.trim() || "(no subject)";
  // Prefer plain text; fall back to html if only html is present (rough strip).
  const bodyText = sugar.description?.trim()
    ? sugar.description
    : sugar.description_html
      ? sugar.description_html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim()
      : "";
  // SugarCRM's from_addr_name often contains the email embedded in
  // RFC 822 form (e.g., "Lauren Labram <lauren@walkerfire.com>").
  // SugarAI does NOT expose a separate from_addr_email field, so we
  // parse the email from from_addr_name when from_addr_email is absent.
  const rawFromName = sugar.from_addr_name?.trim() || null;
  const fromAddrEmailExplicit = sugar.from_addr_email?.trim() || null;
  const embeddedEmailMatch = rawFromName?.match(/<([^>\s]+@[^>\s]+)>/);
  const senderEmail =
    fromAddrEmailExplicit || embeddedEmailMatch?.[1] || null;
  // If from_addr_name had an embedded email, strip it for the display name.
  const senderName = rawFromName
    ? rawFromName.replace(/\s*<[^>]+>\s*/, "").trim() || rawFromName
    : null;
  const receivedAt = sugar.date_sent || sugar.date_entered || new Date().toISOString();
  // Synthesize a stable internet_message_id when SugarCRM doesn't carry one.
  // This keeps the column populated + unique without colliding with real
  // RFC 822 message-ids (the `sugar:` scheme is non-standard).
  const internetMessageId = sugar.message_id?.trim() || `sugar:${sugarId}`;

  const admin = createAdminClient();
  const isoNow = new Date().toISOString();

  // 1) Upsert email_pipeline.emails on (source_id) for idempotency.
  //    Pattern mirrors debtor-email/ingest's resolveOrCreateEmailRow.
  let emailId: string | null = null;
  {
    const { data: existing } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("id")
      .eq("source", SALES_SOURCE)
      .eq("source_id", sugarId)
      .maybeSingle();

    if (existing?.id) {
      emailId = existing.id;
    } else {
      const { data: inserted, error: insertError } = await admin
        .schema("email_pipeline")
        .from("emails")
        .insert({
          source: SALES_SOURCE,
          source_id: sugarId,
          mailbox: SALES_SOURCE_MAILBOX,
          subject,
          body_text: bodyText,
          body_html: sugar.description_html ?? null,
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
          .eq("source_id", sugarId)
          .maybeSingle();
        emailId = refetch?.id ?? null;
        if (!emailId) {
          console.error(
            `[sales-email/ingest] failed to upsert email_pipeline.emails for sugar:${sugarId}:`,
            insertError,
          );
          return NextResponse.json(
            { ok: false, source_id: sugarId, error: `email upsert failed: ${insertError?.message ?? "unknown"}` },
            { status: 500 },
          );
        }
      } else {
        emailId = inserted.id;
      }
    }
  }

  // 2) Create the automation_runs row (status='received') so the rest of
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
        message_id: sugarId,
        source_mailbox: SALES_SOURCE_MAILBOX,
        subject,
        from: senderEmail,
      },
      triggered_by: "zapier:sugarcrm-ingest",
    })
    .select("id")
    .single();

  if (runError || !runRow?.id) {
    console.error(
      `[sales-email/ingest] failed to create automation_runs row for sugar:${sugarId}:`,
      runError,
    );
    return NextResponse.json(
      { ok: false, source_id: sugarId, email_id: emailId, error: `automation_runs insert failed: ${runError?.message ?? "unknown"}` },
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
        message_id: sugarId,
        source_mailbox: SALES_SOURCE_MAILBOX,
        subject,
        body_text: bodyText,
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
      `[sales-email/ingest] inngest.send failed for sugar:${sugarId}:`,
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
      { ok: false, source_id: sugarId, email_id: emailId, automation_run_id: automationRunId, error: "stage-0 emit failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    automation_run_id: automationRunId,
    email_id: emailId,
    source_id: sugarId,
  });
}
