import { NextRequest, NextResponse } from "next/server";
import { classify } from "@/lib/debtor-email/classify";
import { categorizeEmail, archiveEmail, fetchMessageBody, getMessageMeta } from "@/lib/outlook";
import { createAdminClient } from "@/lib/supabase/admin";
import { inngest } from "@/lib/inngest/client";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { readWhitelist } from "@/lib/classifier/cache";
import { ICONTROLLER_MAILBOXES } from "@/lib/automations/debtor-email/mailboxes";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Backwards-compat default: existing Smeba Zap does NOT yet pass source_mailbox.
// Once every Zap carries the field this constant becomes dead and the branch
// below turns into a hard 400.
const LEGACY_DEFAULT_MAILBOX = "debiteuren@smeba.nl";
const LEGACY_DEFAULT_ICONTROLLER_COMPANY = "smebabrandbeveiliging";

/**
 * Whitelist van classifier-regels die auto-action mogen triggeren. Alleen
 * regels die Wilson 95% CI-lower-bound ≥ 95% hebben gehaald in productie-
 * telemetry komen hier — of de categorie als geheel (payment_admittance)
 * bewezen is met N>300 en 100% observed precision.
 *
 * Status 2026-04-22 (na 845+ hand-gereviewde samples):
 *   ✓ subject_paid_marker          N=169  CI_lo=97.8%
 *   ✓ payment_subject              N=151  CI_lo=96.7%
 *   ✓ payment_sender+subject       N= 79  CI_lo=95.4%
 *   ✓ payment_system_sender+body   N=  9  100% (dekking via category-rollup)
 *   ✓ payment_sender+hint+body     N=  8  100% (dekking via category-rollup)
 *   ✓ payment_sender+body          N=  2  100% (dekking via category-rollup)
 *
 * payment_admittance als categorie-rollup: N=415 OK=415 → CI_lo=99.1%.
 * Alle 6 regels die naar payment_admittance leiden zijn whitelist-veilig.
 *
 * Auto-reply rules zijn nog niet live-ready — subject_autoreply staat op
 * 98% (CI_lo 93%), de specifieke regels hebben individueel nog te weinig
 * samples. Laat die via bulk-review UI blijven lopen tot ze ook bewezen
 * zijn.
 */
// Phase 60-02 (D-28 step 3): the whitelist now lives in
// public.classifier_rules and is fetched per request via readWhitelist (60s
// in-memory cache, FALLBACK_WHITELIST inside cache.ts on DB error). The
// JSDoc above documents the seed empirics that backfill 60-02 wrote into
// the table.

const CATEGORY_LABEL: Record<string, string> = {
  auto_reply: "Auto-Reply",
  ooo_temporary: "OoO — Temporary",
  ooo_permanent: "OoO — Permanent",
  payment_admittance: "Payment Admittance",
};

const MR_LABELS = new Set(Object.values(CATEGORY_LABEL));

type EntityKey =
  | "smeba"
  | "berki"
  | "sicli-noord"
  | "sicli-sud"
  | "smeba-fire";

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
  /** NEW — Zaps should pass the mailbox they triggered on. Legacy Zap
   *  without this field falls back to LEGACY_DEFAULT_MAILBOX. */
  source_mailbox?: string;
}

interface IngestResponse {
  action:
    | "labeled"
    | "skipped_idempotent"
    | "skipped_not_whitelisted"
    | "skipped_unknown"
    | "skipped_not_found"
    | "skipped_disabled"
    | "failed";
  messageId?: string;
  source_mailbox?: string;
  entity?: EntityKey;
  category?: string;
  rule?: string;
  /** Classifier's hand-assigned confidence (0-1). NIET een gemeten precision
   * — dat is Wilson CI-lo uit de review-telemetry en wordt gebruikt voor de
   * whitelist-beslissing. */
  confidence?: number;
  label?: string;
  reason?: string;
  error?: string;
  /** True als de unknown-mail het triage-event heeft gefired (shadow-mode). */
  triage_fired?: boolean;
}

/**
 * Zapier-ingest webhook. Draait synchroon voor elke nieuwe mail uit een
 * van de debteuren-mailboxen:
 *
 *   1. resolve mailbox → settings (entity, icontroller_company, gates)
 *   2. fetch volledige body via Graph (subject + from al in trigger, maar
 *      body nodig voor body-gebaseerde regels)
 *   3. check idempotency — als al een MR-label → skip
 *   4. classify
 *   5. als rule in classifier-whitelist (D-08 cache) én auto_label_enabled=true →
 *      categorize + archive + log pending iController-delete. Anders →
 *      skip (blijft in inbox voor bulk-review).
 *   6. als category=unknown én triage_shadow_mode=true → fire
 *      debtor/email.received event voor de triage-swarm (fire-and-forget).
 *
 * iController-delete wordt NIET synchroon gedaan — die pakt de Inngest
 * cleanup-cron (elke 5 min) op via de pending-rij.
 *
 * Security: vereist X-Zapier-Secret header die matcht met
 * ZAPIER_INGEST_SECRET env var.
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
    console.warn(
      `[debtor-email/ingest] Legacy Zap without source_mailbox — defaulting to ${LEGACY_DEFAULT_MAILBOX}. Update your Zapier config to pass source_mailbox.`,
    );
  }

  const admin = createAdminClient();
  const isoNow = new Date().toISOString();

  // Phase 60-02 (D-08, D-28 step 3): cache-backed read with FALLBACK_WHITELIST
  // defense-in-depth on transient DB error. Fetched once per request — the
  // module-level Map in cache.ts amortizes across requests for 60s.
  const whitelist = await readWhitelist(admin, "debtor-email");

  // Phase 60-02 (D-11): typed mailbox_id mirrors the migration backfill in
  // 20260428_automation_runs_typed_columns.sql (CASE on source_mailbox).
  // debtor.labeling_settings has no `id` column, so we resolve via the
  // ICONTROLLER_MAILBOXES lookup table that already keys this mapping.
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

  // Haal de mail op. We gebruiken fetchMessageBody dat naast de body ook
  // subject/from nodig heeft — maar die zit niet in de Graph body endpoint.
  // Gebruik een aparte Graph call die alles tegelijk pakt.
  let msg: {
    subject: string;
    from: string;
    fromName: string;
    receivedAt: string;
    body: string;
    categories: string[];
  };
  try {
    const [meta, body] = await Promise.all([
      getMessageMeta(sourceMailbox, messageId),
      fetchMessageBody(sourceMailbox, messageId),
    ]);
    msg = {
      subject: meta.subject,
      from: meta.from,
      fromName: meta.fromName,
      receivedAt: meta.receivedAt,
      body: body.bodyText,
      categories: meta.categories,
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

  // Idempotency: al een van onze MR-labels? Dan niks doen.
  if (msg.categories.some((c) => MR_LABELS.has(c))) {
    return NextResponse.json({
      action: "skipped_idempotent",
      messageId,
      source_mailbox: sourceMailbox,
      entity: settings.entity ?? undefined,
      reason: `already labeled: ${msg.categories.filter((c) => MR_LABELS.has(c)).join(", ")}`,
    });
  }

  // Classify
  const r = classify({ subject: msg.subject, from: msg.from, bodySnippet: msg.body.slice(0, 1000) });

  const isWhitelistMatch = whitelist.has(r.matchedRule);
  const autoActionAllowed = isWhitelistMatch && settings.auto_label_enabled;

  // Bulk-review pad: geen whitelist-match, OF whitelist maar auto-label is af.
  if (!autoActionAllowed) {
    await admin.from("automation_runs").insert({
      automation: "debtor-email-review",
      status: "predicted",
      swarm_type: "debtor-email",
      topic: r.category ?? null,
      entity: settings.entity,
      mailbox_id: mailboxId,
      result: {
        stage: "zapier_ingest_classify",
        message_id: messageId,
        source_mailbox: sourceMailbox,
        entity: settings.entity,
        subject: msg.subject,
        from: msg.from,
        predicted: { category: r.category, confidence: r.confidence, rule: r.matchedRule },
        action: isWhitelistMatch && !settings.auto_label_enabled
          ? "skipped_disabled"
          : "skipped_not_whitelisted",
      },
      triggered_by: "zapier:ingest",
      completed_at: isoNow,
    });
    await emitAutomationRunStale(admin, "debtor-email-review");

    // Triage hook — fire-and-forget for unknown emails when shadow mode is on.
    let triageFired = false;
    if (r.category === "unknown" && settings.triage_shadow_mode && settings.entity) {
      triageFired = await fireTriageEvent({
        admin,
        messageId,
        sourceMailbox,
        entity: settings.entity,
        subject: msg.subject,
        from: msg.from,
        fromName: msg.fromName,
        bodyText: msg.body,
        receivedAt: msg.receivedAt || isoNow,
      });
    }

    return NextResponse.json({
      action: r.category === "unknown" ? "skipped_unknown" : "skipped_not_whitelisted",
      messageId,
      source_mailbox: sourceMailbox,
      entity: settings.entity ?? undefined,
      category: r.category,
      rule: r.matchedRule,
      confidence: r.confidence,
      triage_fired: triageFired,
      reason:
        r.category === "unknown"
          ? "geen regel matched — mens moet dit labelen via bulk-review UI"
          : isWhitelistMatch && !settings.auto_label_enabled
            ? "whitelist-match maar auto_label_enabled=false voor deze mailbox"
            : "regel classificeert correct maar Wilson CI-lo is nog < 95% op telemetry — bewijs via bulk-review moet nog binnen voordat auto-action vrijgegeven wordt",
    });
  }

  // Auto-action: categorize + archive + queue iController delete.
  const categoryKey = r.category;
  const label = CATEGORY_LABEL[categoryKey];
  if (!label) {
    return NextResponse.json(
      { action: "failed", messageId, source_mailbox: sourceMailbox, error: `no label for category ${categoryKey}` },
      { status: 500 },
    );
  }

  const catRes = await categorizeEmail(sourceMailbox, messageId, label);
  if (!catRes.success) {
    await admin.from("automation_runs").insert({
      automation: "debtor-email-review",
      status: "failed",
      swarm_type: "debtor-email",
      topic: r.category ?? null,
      entity: settings.entity,
      mailbox_id: mailboxId,
      result: {
        stage: "categorize",
        message_id: messageId,
        source_mailbox: sourceMailbox,
        entity: settings.entity,
        category: label,
      },
      error_message: catRes.error ?? null,
      triggered_by: "zapier:ingest",
      completed_at: isoNow,
    });
    await emitAutomationRunStale(admin, "debtor-email-review");
    return NextResponse.json({
      action: "failed",
      messageId,
      source_mailbox: sourceMailbox,
      entity: settings.entity ?? undefined,
      error: `categorize: ${catRes.error}`,
    });
  }

  const arcRes = await archiveEmail(sourceMailbox, messageId);
  if (!arcRes.success) {
    await admin.from("automation_runs").insert({
      automation: "debtor-email-review",
      status: "failed",
      swarm_type: "debtor-email",
      topic: r.category ?? null,
      entity: settings.entity,
      mailbox_id: mailboxId,
      result: {
        stage: "archive",
        message_id: messageId,
        source_mailbox: sourceMailbox,
        entity: settings.entity,
        category: label,
      },
      error_message: arcRes.error ?? null,
      triggered_by: "zapier:ingest",
      completed_at: isoNow,
    });
    await emitAutomationRunStale(admin, "debtor-email-review");
    return NextResponse.json({
      action: "failed",
      messageId,
      source_mailbox: sourceMailbox,
      entity: settings.entity ?? undefined,
      error: `archive: ${arcRes.error}`,
    });
  }

  // Log succesvolle Outlook-actie.
  await admin.from("automation_runs").insert({
    automation: "debtor-email-review",
    status: "completed",
    swarm_type: "debtor-email",
    topic: r.category ?? null,
    entity: settings.entity,
    mailbox_id: mailboxId,
    result: {
      stage: "categorize+archive",
      message_id: messageId,
      source_mailbox: sourceMailbox,
      entity: settings.entity,
      applied_category: label,
      decision: "approve",
      triggered_by: "zapier:ingest",
      predicted: { category: categoryKey, confidence: r.confidence, rule: r.matchedRule },
    },
    triggered_by: "zapier:ingest",
    completed_at: isoNow,
  });
  await emitAutomationRunStale(admin, "debtor-email-review");

  // Queue iController-delete als pending. De Inngest cleanup-cron pakt
  // 'm binnen 5 min op. Cleanup-worker leest `company` nog niet uit de
  // row (hardcoded Smeba) — zie .planning/todos/pending/
  // 2026-04-23-cleanup-worker-multi-mailbox.md.
  const icontrollerCompany =
    settings.icontroller_company ?? LEGACY_DEFAULT_ICONTROLLER_COMPANY;
  await admin.from("automation_runs").insert({
    automation: "debtor-email-review",
    status: "pending",
    swarm_type: "debtor-email",
    topic: r.category ?? null,
    entity: settings.entity,
    mailbox_id: mailboxId,
    result: {
      stage: "icontroller_delete",
      message_id: messageId,
      source_mailbox: sourceMailbox,
      entity: settings.entity,
      company: icontrollerCompany,
      icontroller: "pending",
      from: msg.from,
      subject: msg.subject,
      received_at: msg.receivedAt || isoNow,
    },
    triggered_by: "zapier:ingest",
    completed_at: isoNow,
  });
  await emitAutomationRunStale(admin, "debtor-email-review");

  return NextResponse.json({
    action: "labeled",
    messageId,
    source_mailbox: sourceMailbox,
    entity: settings.entity ?? undefined,
    category: categoryKey,
    rule: r.matchedRule,
    confidence: r.confidence,
    label,
  });
}

/**
 * Fire the debtor/email.received Inngest event for triage. Best-effort:
 * failures are logged but do NOT propagate to the webhook response so that
 * a broken Inngest connection never breaks the regex-classifier ingest.
 */
async function fireTriageEvent(params: {
  admin: ReturnType<typeof createAdminClient>;
  messageId: string;
  sourceMailbox: string;
  entity: EntityKey;
  subject: string;
  from: string;
  fromName: string;
  bodyText: string;
  receivedAt: string;
}): Promise<boolean> {
  try {
    const emailId = await resolveOrCreateEmailRow(params);
    if (!emailId) return false;

    const senderDomain = params.from.split("@")[1]?.toLowerCase() ?? "";
    const senderFirstName = firstNameFromDisplayName(params.fromName);

    await inngest.send({
      name: "debtor/email.received",
      data: {
        email_id: emailId,
        graph_message_id: params.messageId,
        subject: params.subject,
        body_text: params.bodyText,
        sender_email: params.from,
        sender_domain: senderDomain,
        sender_first_name: senderFirstName,
        mailbox: params.sourceMailbox,
        entity: params.entity,
        received_at: params.receivedAt,
      },
    });
    return true;
  } catch (err) {
    console.error(
      `[debtor-email/ingest] triage fire failed for ${params.messageId}:`,
      err,
    );
    return false;
  }
}

/**
 * Resolve the email_pipeline.emails row for this Zapier-triggered message,
 * creating a minimal row if none exists.
 *
 * The upstream email-ingest pipeline (separate process) uses
 * `source='outlook'` with its own Graph message-ID encoding. Zapier's
 * webhook trigger delivers a DIFFERENT Graph ID encoding for the same
 * message. To avoid silently failing the lookup (which blocked the very
 * first smoke-test on 2026-04-23), we key Zapier-ingested rows under
 * `source='outlook-zapier'` + the Zapier-provided messageId. Rows
 * inserted here stay isolated from upstream rows — no collisions.
 */
async function resolveOrCreateEmailRow(params: {
  admin: ReturnType<typeof createAdminClient>;
  messageId: string;
  sourceMailbox: string;
  subject: string;
  from: string;
  fromName: string;
  bodyText: string;
  receivedAt: string;
}): Promise<string | null> {
  const existing = await params.admin
    .schema("email_pipeline")
    .from("emails")
    .select("id")
    .eq("source", "outlook-zapier")
    .eq("source_id", params.messageId)
    .maybeSingle();

  if (existing.data?.id) return existing.data.id;

  const inserted = await params.admin
    .schema("email_pipeline")
    .from("emails")
    .insert({
      source: "outlook-zapier",
      source_id: params.messageId,
      mailbox: params.sourceMailbox,
      subject: params.subject,
      sender_email: params.from,
      sender_name: params.fromName || null,
      body_text: params.bodyText,
      received_at: params.receivedAt,
      direction: "inbound",
    })
    .select("id")
    .single();

  if (inserted.error || !inserted.data?.id) {
    console.error(
      `[debtor-email/ingest] failed to upsert email_pipeline.emails for ${params.messageId}:`,
      inserted.error,
    );
    return null;
  }
  return inserted.data.id;
}

function firstNameFromDisplayName(displayName: string): string | null {
  const trimmed = displayName.trim();
  if (!trimmed) return null;
  // "Jan de Vries" → "Jan"; "jan.devries@..." style addresses never reach
  // this helper because fromName comes from the Graph display-name field.
  // If the display-name is a bare email address (Graph falls back to that),
  // avoid leaking the address as a "first name".
  if (trimmed.includes("@")) return null;
  const first = trimmed.split(/\s+/)[0];
  return first || null;
}
