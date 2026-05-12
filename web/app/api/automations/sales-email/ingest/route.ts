import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { getMessageMeta, fetchMessageBody } from "@/lib/outlook";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Sales-email ingest webhook (Phase 74-05, Outlook + Graph variant).
 *
 * Mirrors the debtor-email/ingest pattern: the Zap sends only
 * `{messageId, source_mailbox}` and we fetch the authoritative
 * subject/body/from from Microsoft Graph (via the existing Zapier-SDK-
 * proxied helpers in web/lib/outlook). Body fidelity matters because
 * the Stage-1 LLM classifier reads body_text — Zapier's Outlook trigger
 * frequently truncates or omits plain-text body, so we go to the
 * source.
 *
 * D-01 / D-02 (Phase 74 CONTEXT): swarm_type and entity are derived at
 * the ingest BOUNDARY (the route path encodes the swarm) and threaded
 * through the event so downstream registry-driven workers
 * (classifier-screen-worker, classifier-verdict-worker) never re-derive
 * them via DB lookup or string literal.
 *
 * Auth: shared-secret BODY field `auth` (per CLAUDE.md zapier-patterns —
 * Catch Hooks don't expose headers reliably in Zapier's field picker).
 * Env var: ZAPIER_INGEST_SECRET (same as debtor-email/ingest).
 *
 * Idempotency: Outlook's message id is stable. We upsert
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

/** Zapier sends just the auth + Outlook message identifier; everything
 *  else is fetched from Graph. source_mailbox is optional and defaults
 *  to verkoop@smeba.nl (the only sales mailbox in Phase 74 scope). */
const SalesIngestSchema = z
  .object({
    auth: z.string().min(1),
    messageId: z.string().min(1),
    source_mailbox: z.string().nullable().optional(),
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

  const parsed = SalesIngestSchema.safeParse(raw);
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

  const messageId = parsed.data.messageId.trim();
  const sourceMailbox =
    parsed.data.source_mailbox?.trim() || SALES_SOURCE_MAILBOX;

  const admin = createAdminClient();
  const isoNow = new Date().toISOString();

  // 1) Fetch authoritative subject/body/from from Graph (via Zapier SDK).
  let meta: { subject: string; from: string; fromName: string; receivedAt: string };
  let bodyText: string;
  let bodyHtml: string;
  try {
    const [m, b] = await Promise.all([
      getMessageMeta(sourceMailbox, messageId),
      fetchMessageBody(sourceMailbox, messageId),
    ]);
    meta = {
      subject: m.subject,
      from: m.from,
      fromName: m.fromName,
      receivedAt: m.receivedAt,
    };
    bodyText = b.bodyText;
    bodyHtml = b.bodyHtml;
  } catch (err) {
    const errText = String(err);
    const is404 = /\b404\b/.test(errText);
    console.error(
      `[sales-email/ingest] Graph fetch failed for ${messageId}@${sourceMailbox}:`,
      errText,
    );
    return NextResponse.json(
      {
        ok: false,
        source_id: messageId,
        error: is404 ? "graph_not_found" : `graph_fetch_failed: ${errText}`,
      },
      { status: is404 ? 200 : 502 },
    );
  }

  const subject = meta.subject?.trim() || "(no subject)";

  // 2) Upsert email_pipeline.emails on (source, source_id) for idempotency.
  let emailId: string | null = null;
  {
    const { data: existing } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("id")
      .eq("source", SALES_SOURCE)
      .eq("source_id", messageId)
      .maybeSingle();

    if (existing?.id) {
      emailId = existing.id;
    } else {
      const { data: inserted, error: insertError } = await admin
        .schema("email_pipeline")
        .from("emails")
        .insert({
          source: SALES_SOURCE,
          source_id: messageId,
          mailbox: sourceMailbox,
          subject,
          body_text: bodyText,
          body_html: bodyHtml || null,
          sender_email: meta.from || null,
          sender_name: meta.fromName || null,
          received_at: meta.receivedAt || isoNow,
          direction: "inbound",
          internet_message_id: messageId,
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
          .eq("source_id", messageId)
          .maybeSingle();
        emailId = refetch?.id ?? null;
        if (!emailId) {
          console.error(
            `[sales-email/ingest] failed to upsert email_pipeline.emails for ${messageId}:`,
            insertError,
          );
          return NextResponse.json(
            { ok: false, source_id: messageId, error: `email upsert failed: ${insertError?.message ?? "unknown"}` },
            { status: 500 },
          );
        }
      } else {
        emailId = inserted.id;
      }
    }
  }

  // 3) Create the automation_runs row (status='pending').
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
        message_id: messageId,
        source_mailbox: sourceMailbox,
        subject,
        from: meta.from,
      },
      triggered_by: "zapier:outlook-ingest",
    })
    .select("id")
    .single();

  if (runError || !runRow?.id) {
    console.error(
      `[sales-email/ingest] failed to create automation_runs row for ${messageId}:`,
      runError,
    );
    return NextResponse.json(
      { ok: false, source_id: messageId, email_id: emailId, error: `automation_runs insert failed: ${runError?.message ?? "unknown"}` },
      { status: 500 },
    );
  }
  const automationRunId = runRow.id as string;

  // 4) Emit stage-0/email.received with the Phase 74 extended payload.
  try {
    await (inngest.send as unknown as SendFn)({
      name: "stage-0/email.received",
      data: {
        automation_run_id: automationRunId,
        email_id: emailId,
        message_id: messageId,
        source_mailbox: sourceMailbox,
        subject,
        body_text: bodyText,
        // Phase 74 D-01 — swarm_type derived at ingest boundary.
        swarm_type: "sales-email",
        // Phase 74 D-02 — sales-email has no entity concept.
        entity: null,
        // Phase 82.2 Plan 07 D-A — align field set with debtor-email so
        // downstream workers see a single payload shape. Sales-email has
        // no auto-action chain (only HITL Draft Review), so mailbox_id +
        // receivedAt are the only non-null values worth threading; from /
        // fromName are forwarded for telemetry consistency.
        mailbox_id: null,
        from: meta.from || null,
        fromName: meta.fromName || null,
        receivedAt: meta.receivedAt || isoNow,
      },
    });
  } catch (err) {
    console.error(
      `[sales-email/ingest] inngest.send failed for ${messageId}:`,
      err,
    );
    await admin
      .from("automation_runs")
      .update({
        status: "failed",
        error_message: `stage-0 emit failed: ${String(err)}`,
        completed_at: isoNow,
      })
      .eq("id", automationRunId);
    return NextResponse.json(
      { ok: false, source_id: messageId, email_id: emailId, automation_run_id: automationRunId, error: "stage-0 emit failed" },
      { status: 502 },
    );
  }

  return NextResponse.json({
    ok: true,
    automation_run_id: automationRunId,
    email_id: emailId,
    source_id: messageId,
  });
}
