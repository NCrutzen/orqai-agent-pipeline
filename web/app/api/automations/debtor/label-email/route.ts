import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { ICONTROLLER_MAILBOXES, isKnownMailbox } from "@/lib/automations/debtor-email/mailboxes";
import { extractInvoiceCandidates } from "@/lib/automations/debtor-email/extract-invoices";
import { resolveDebtor, type ResolveResult } from "@/lib/automations/debtor-email/resolve-debtor";

const WEBHOOK_SECRET = process.env.AUTOMATION_WEBHOOK_SECRET;

export const maxDuration = 60;

const Body = z.object({
  graph_message_id: z.string().min(1),
  conversation_id: z.string().optional(),
  subject: z.string().default(""),
  body_text: z.string().default(""),
  from_email: z.string().email().nullable().optional(),
  source_mailbox: z.string().min(1),
  icontroller_mailbox_id: z.number().int().positive(),
});

/**
 * POST /api/automations/debtor/label-email
 *
 * Triggered by a per-mailbox Zapier Zap on inbound debtor mail.
 * Resolves the correct NXT debtor account via the 4-layer pipeline
 * (thread_inheritance → sender_match → identifier_match → unresolved with
 * llm_tiebreaker on multi-candidate hits) and writes an audit row in
 * debtor.email_labels.
 *
 * Live on/off lives in Zapier; Vercel has only a dry_run kill-switch.
 * Per-mailbox NXT context (nxt_database, brand_id) lives in
 * debtor.labeling_settings.
 *
 * iController browser label step is wired in a follow-up phase once the
 * DOM is mapped.
 */
export async function POST(request: NextRequest) {
  if (!WEBHOOK_SECRET) {
    return NextResponse.json({ error: "missing_webhook_secret" }, { status: 500 });
  }
  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (bearer !== WEBHOOK_SECRET) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "invalid_body", issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const input = parsed.data;

  // Sanity: Zapier-provided mailbox id must match our known mapping.
  if (isKnownMailbox(input.source_mailbox)) {
    const expected = ICONTROLLER_MAILBOXES[input.source_mailbox];
    if (expected !== input.icontroller_mailbox_id) {
      return NextResponse.json(
        {
          error: "mailbox_id_mismatch",
          expected,
          received: input.icontroller_mailbox_id,
        },
        { status: 400 },
      );
    }
  }

  const supabase = createAdminClient();

  // Per-mailbox NXT context.
  const { data: settings } = await supabase
    .schema("debtor")
    .from("labeling_settings")
    .select("dry_run, nxt_database, brand_id")
    .eq("source_mailbox", input.source_mailbox)
    .maybeSingle();
  const dryRun = settings?.dry_run ?? true;
  const nxtDatabase: string | null = settings?.nxt_database ?? null;
  const brandId: string | null = settings?.brand_id ?? null;

  // Resolve email row (must exist from upstream email ingest).
  const { data: email } = await supabase
    .schema("email_pipeline")
    .from("emails")
    .select("id, conversation_id")
    .eq("internet_message_id", input.graph_message_id)
    .maybeSingle();
  if (!email) {
    return NextResponse.json(
      { error: "email_not_ingested", graph_message_id: input.graph_message_id },
      { status: 404 },
    );
  }

  const convId = input.conversation_id ?? email.conversation_id ?? null;

  // 4-layer resolver. NXT lookups (layers 2+3) are skipped if nxt_database
  // or brand_id is missing — falls through to thread_inheritance / unresolved.
  let result: ResolveResult;
  let resolverError: string | null = null;
  if (!nxtDatabase) {
    // No NXT context — only thread_inheritance is achievable. Fall through
    // to unresolved if no prior label exists in this conversation.
    result = await runThreadInheritanceOnly({
      supabase,
      conversation_id: convId,
    });
  } else {
    try {
      result = await resolveDebtor({
        nxt_database: nxtDatabase,
        brand_id: brandId,
        conversation_id: convId,
        from_email: input.from_email ?? null,
        subject: input.subject,
        body_text: input.body_text,
      });
    } catch (err) {
      resolverError = err instanceof Error ? err.message : String(err);
      result = {
        method: "unresolved",
        customer_account_id: null,
        customer_name: null,
        confidence: "none",
      };
    }
  }

  // Keep extracted invoice candidates around for the audit row even when the
  // resolver picked a different layer.
  const invoices = extractInvoiceCandidates(input.subject, input.body_text);

  const reason = buildReason(result, invoices, {
    nxtDatabaseSet: !!nxtDatabase,
    brandIdSet: !!brandId,
    resolverError,
  });

  const { data: labelRow, error: insertError } = await supabase
    .schema("debtor")
    .from("email_labels")
    .insert({
      email_id: email.id,
      icontroller_mailbox_id: input.icontroller_mailbox_id,
      source_mailbox: input.source_mailbox,
      debtor_id: result.customer_account_id,
      debtor_name: result.customer_name,
      customer_account_id: result.customer_account_id,
      conversation_id: convId,
      confidence: result.confidence,
      method: result.method,
      invoice_numbers: invoices.candidates,
      reason,
      nxt_database: nxtDatabase,
      status: dryRun ? "dry_run" : result.customer_account_id ? "pending" : "skipped",
      error: resolverError,
    })
    .select("id")
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "insert_failed", details: insertError.message },
      { status: 500 },
    );
  }

  return NextResponse.json({
    label_id: labelRow?.id,
    method: result.method,
    confidence: result.confidence,
    customer_account_id: result.customer_account_id,
    customer_name: result.customer_name,
    candidates_considered: result.candidates_considered,
    dry_run: dryRun,
    invoice_candidates: invoices.candidates,
    next:
      dryRun
        ? "logged_only"
        : result.customer_account_id
          ? "label_pending_browser_step"
          : "no_action",
  });
}

/**
 * Fallback when the mailbox has no nxt_database configured: do thread
 * inheritance only, otherwise unresolved. Mirrors layer 1 of resolveDebtor
 * inline so we don't touch NXT-Zap when context is absent.
 */
async function runThreadInheritanceOnly(args: {
  supabase: ReturnType<typeof createAdminClient>;
  conversation_id: string | null;
}): Promise<ResolveResult> {
  if (!args.conversation_id) {
    return {
      method: "unresolved",
      customer_account_id: null,
      customer_name: null,
      confidence: "none",
    };
  }
  const { data: prior } = await args.supabase
    .schema("debtor")
    .from("email_labels")
    .select("customer_account_id, debtor_id, debtor_name")
    .eq("conversation_id", args.conversation_id)
    .or("customer_account_id.not.is.null,debtor_id.not.is.null")
    .in("status", ["labeled", "dry_run"])
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const accountId =
    (prior as { customer_account_id?: string | null; debtor_id?: string | null } | null)
      ?.customer_account_id ?? (prior as { debtor_id?: string | null } | null)?.debtor_id ?? null;
  if (accountId) {
    return {
      method: "thread_inheritance",
      customer_account_id: accountId,
      customer_name:
        (prior as { debtor_name?: string | null } | null)?.debtor_name ?? null,
      confidence: "high",
    };
  }
  return {
    method: "unresolved",
    customer_account_id: null,
    customer_name: null,
    confidence: "none",
  };
}

function buildReason(
  result: ResolveResult,
  invoices: ReturnType<typeof extractInvoiceCandidates>,
  ctx: { nxtDatabaseSet: boolean; brandIdSet: boolean; resolverError: string | null },
): string {
  if (ctx.resolverError) return `resolver error: ${ctx.resolverError}`;
  if (!ctx.nxtDatabaseSet)
    return "labeling_settings.nxt_database not configured for this mailbox";
  switch (result.method) {
    case "thread_inheritance":
      return "inherited from prior label in same conversation";
    case "sender_match":
      return "matched via sender → contact_person → top-level customer";
    case "identifier_match":
      if (invoices.fromSubject.length > 0)
        return `matched via invoice number(s) in subject: ${invoices.fromSubject.join(", ")}`;
      if (invoices.fromBody.length > 0)
        return `matched via invoice number(s) in body: ${invoices.fromBody.join(", ")}`;
      return "matched via invoice number(s)";
    case "llm_tiebreaker":
      return result.reason
        ? `LLM tiebreaker (${result.candidates_considered ?? 0} candidates): ${result.reason}`
        : `LLM tiebreaker (${result.candidates_considered ?? 0} candidates)`;
    case "unresolved":
      if (!ctx.brandIdSet)
        return "no thread inheritance and brand_id not configured (NXT lookups skipped)";
      if (invoices.candidates.length > 0)
        return `invoice numbers parsed but NXT returned no matches: ${invoices.candidates.join(", ")}`;
      return "no deterministic signal";
  }
}
