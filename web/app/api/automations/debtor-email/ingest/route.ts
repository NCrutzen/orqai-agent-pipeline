import { NextRequest, NextResponse } from "next/server";
import { classify } from "@/lib/debtor-email/classify";
import { categorizeEmail, archiveEmail, fetchMessageBody, getMessageMeta } from "@/lib/outlook";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const MAILBOX = "debiteuren@smeba.nl";
const ICONTROLLER_COMPANY = "smebabrandbeveiliging";

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
const AUTO_ACTION_RULES = new Set<string>([
  "subject_paid_marker",
  "payment_subject",
  "payment_sender+subject",
  "payment_system_sender+body",
  "payment_sender+hint+body",
  "payment_sender+body",
]);

const CATEGORY_LABEL: Record<string, string> = {
  auto_reply: "Auto-Reply",
  ooo_temporary: "OoO — Temporary",
  ooo_permanent: "OoO — Permanent",
  payment_admittance: "Payment Admittance",
};

const MR_LABELS = new Set(Object.values(CATEGORY_LABEL));

interface IngestBody {
  messageId?: string;
}

interface IngestResponse {
  action:
    | "labeled"
    | "skipped_idempotent"
    | "skipped_not_whitelisted"
    | "skipped_unknown"
    | "skipped_not_found"
    | "failed";
  messageId?: string;
  category?: string;
  rule?: string;
  /** Classifier's hand-assigned confidence (0-1). NIET een gemeten precision
   * — dat is Wilson CI-lo uit de review-telemetry en wordt gebruikt voor de
   * whitelist-beslissing. */
  confidence?: number;
  label?: string;
  reason?: string;
  error?: string;
}

/**
 * Zapier-ingest webhook. Draait synchroon voor elke nieuwe mail in
 * debiteuren@smeba.nl:
 *
 *   1. fetch volledige body via Graph (subject + from al in trigger, maar
 *      body nodig voor body-gebaseerde regels)
 *   2. check idempotency — als al een MR-label → skip
 *   3. classify
 *   4. als rule in AUTO_ACTION_RULES → categorize + archive + log
 *      pending iController-delete. Anders → skip (blijft in inbox voor
 *      bulk-review).
 *
 * iController-delete wordt NIET synchroon gedaan — die pakt de Inngest
 * cleanup-cron (elke 5 min) op via de pending-rij. Zo blijft deze
 * webhook binnen Zapier's 30s timeout en heeft geen last van
 * Browserless cold-starts.
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

  const admin = createAdminClient();
  const isoNow = new Date().toISOString();

  // Haal de mail op. We gebruiken fetchMessageBody dat naast de body ook
  // subject/from nodig heeft — maar die zit niet in de Graph body endpoint.
  // Gebruik een aparte Graph call die alles tegelijk pakt.
  let msg: { subject: string; from: string; body: string; categories: string[] };
  try {
    const [meta, body] = await Promise.all([
      getMessageMeta(MAILBOX, messageId),
      fetchMessageBody(MAILBOX, messageId),
    ]);
    msg = {
      subject: meta.subject,
      from: meta.from,
      body: body.bodyText,
      categories: meta.categories,
    };
  } catch (err) {
    const errText = String(err);
    const is404 = /\b404\b/.test(errText);
    await admin.from("automation_runs").insert({
      automation: "debtor-email-review",
      status: is404 ? "completed" : "failed",
      result: {
        stage: "zapier_ingest_fetch",
        message_id: messageId,
        outcome: is404 ? "not_found" : "fetch_error",
      },
      error_message: errText,
      triggered_by: "zapier:ingest",
      completed_at: isoNow,
    });
    return NextResponse.json({
      action: is404 ? "skipped_not_found" : "failed",
      messageId,
      error: errText,
    });
  }

  // Idempotency: al een van onze MR-labels? Dan niks doen.
  if (msg.categories.some((c) => MR_LABELS.has(c))) {
    return NextResponse.json({
      action: "skipped_idempotent",
      messageId,
      reason: `already labeled: ${msg.categories.filter((c) => MR_LABELS.has(c)).join(", ")}`,
    });
  }

  // Classify
  const r = classify({ subject: msg.subject, from: msg.from, bodySnippet: msg.body.slice(0, 1000) });

  // Alleen acteren op whitelist-regels. De bulk-review UI pikt de rest op.
  if (!AUTO_ACTION_RULES.has(r.matchedRule)) {
    // Log de classificatie als feedback zodat telemetry volledig blijft,
    // maar geen actie.
    await admin.from("automation_runs").insert({
      automation: "debtor-email-review",
      status: "feedback",
      result: {
        stage: "zapier_ingest_classify",
        message_id: messageId,
        subject: msg.subject,
        from: msg.from,
        predicted: { category: r.category, confidence: r.confidence, rule: r.matchedRule },
        action: "skipped_not_whitelisted",
      },
      triggered_by: "zapier:ingest",
      completed_at: isoNow,
    });
    return NextResponse.json({
      action: r.category === "unknown" ? "skipped_unknown" : "skipped_not_whitelisted",
      messageId,
      category: r.category,
      rule: r.matchedRule,
      confidence: r.confidence,
      reason:
        r.category === "unknown"
          ? "geen regel matched — mens moet dit labelen via bulk-review UI"
          : "regel classificeert correct maar Wilson CI-lo is nog < 95% op telemetry — bewijs via bulk-review moet nog binnen voordat auto-action vrijgegeven wordt",
    });
  }

  // Auto-action: categorize + archive + queue iController delete.
  const categoryKey = r.category;
  const label = CATEGORY_LABEL[categoryKey];
  if (!label) {
    return NextResponse.json(
      { action: "failed", messageId, error: `no label for category ${categoryKey}` },
      { status: 500 },
    );
  }

  const catRes = await categorizeEmail(MAILBOX, messageId, label);
  if (!catRes.success) {
    await admin.from("automation_runs").insert({
      automation: "debtor-email-review",
      status: "failed",
      result: { stage: "categorize", message_id: messageId, category: label },
      error_message: catRes.error ?? null,
      triggered_by: "zapier:ingest",
      completed_at: isoNow,
    });
    return NextResponse.json({ action: "failed", messageId, error: `categorize: ${catRes.error}` });
  }

  const arcRes = await archiveEmail(MAILBOX, messageId);
  if (!arcRes.success) {
    await admin.from("automation_runs").insert({
      automation: "debtor-email-review",
      status: "failed",
      result: { stage: "archive", message_id: messageId, category: label },
      error_message: arcRes.error ?? null,
      triggered_by: "zapier:ingest",
      completed_at: isoNow,
    });
    return NextResponse.json({ action: "failed", messageId, error: `archive: ${arcRes.error}` });
  }

  // Log succesvolle Outlook-actie.
  await admin.from("automation_runs").insert({
    automation: "debtor-email-review",
    status: "completed",
    result: {
      stage: "categorize+archive",
      message_id: messageId,
      applied_category: label,
      decision: "approve",
      triggered_by: "zapier:ingest",
      predicted: { category: categoryKey, confidence: r.confidence, rule: r.matchedRule },
    },
    triggered_by: "zapier:ingest",
    completed_at: isoNow,
  });

  // Queue iController-delete als pending. De Inngest cleanup-cron pakt
  // 'm binnen 5 min op.
  await admin.from("automation_runs").insert({
    automation: "debtor-email-review",
    status: "pending",
    result: {
      stage: "icontroller_delete",
      message_id: messageId,
      company: ICONTROLLER_COMPANY,
      icontroller: "pending",
      from: msg.from,
      subject: msg.subject,
      received_at: isoNow,
    },
    triggered_by: "zapier:ingest",
    completed_at: isoNow,
  });

  return NextResponse.json({
    action: "labeled",
    messageId,
    category: categoryKey,
    rule: r.matchedRule,
    confidence: r.confidence,
    label,
  });
}
