"use server";

import { categorizeEmail, archiveEmail, fetchMessageBody } from "@/lib/outlook";
import { classify } from "@/lib/debtor-email/classify";
import { createAdminClient } from "@/lib/supabase/admin";
// iController delete is no longer called inline — see comment in the
// execute loop. The import stays available for the catchup script via
// `@/lib/automations/debtor-email-cleanup/browser`.

const MAILBOX = "debiteuren@smeba.nl";

// iController sidebar category that corresponds to debiteuren@smeba.nl.
// Hardcoded while this review page is single-mailbox — generalize when we add
// other subsidiary pairs.
const ICONTROLLER_COMPANY = "smebabrandbeveiliging";

const CATEGORY_LABEL: Record<string, string> = {
  auto_reply: "Auto-Reply",
  ooo_temporary: "OoO — Temporary",
  ooo_permanent: "OoO — Permanent",
  payment_admittance: "Payment Admittance",
};

/**
 * Categories that get labeled but NOT archived / iController-deleted.
 *
 * `ooo_permanent` means the person has left OR the mailbox is retired —
 * both require a human to update the vendor master in NXT with the new
 * contact. If we archive automatically, that ERP-update action disappears
 * from view and future invoices keep landing in the wrong mailbox. The
 * label still goes on so the mail is visually grouped in Outlook and a
 * human can sweep them later after updating NXT.
 */
const LABEL_ONLY_CATEGORIES = new Set(["ooo_permanent"]);

export interface ExecuteResult {
  total: number;
  executed: number;
  succeeded: number;
  failed: number;
  excluded: number;
  recategorized: number;
  errors: Array<{ messageId: string; subject: string; error: string }>;
}

type Decision = "approve" | "exclude" | "recategorize";

export interface ReviewDecision {
  id: string;
  subject: string;
  from: string;
  bodyPreview: string;
  receivedAt: string;
  predictedCategory: string;
  predictedConfidence: number;
  predictedRule: string;
  decision: Decision;
  // If decision === "recategorize", the human's chosen label. Treated as an
  // action override: we will categorize+archive with this label AND log it.
  overrideCategory?: string;
  notes?: string;
  // When true: apply the Outlook label only. Skip archive + iController
  // delete. Used for items hand-picked from the Onbekend bucket — we want
  // those labeled for classifier training but kept in the inbox for manual
  // verification before the classifier learns to auto-action them.
  labelOnly?: boolean;
  // Optional reviewer hint for Onbekend hand-picks: welke bestaande
  // classifier-regel had deze mail MOETEN matchen. Opgeslagen in telemetry
  // zodat we later concreet per regel kunnen zien welke woorden/patronen
  // ontbreken en de regex gericht kunnen uitbreiden.
  ruleHint?: string;
}

/**
 * Execute the reviewer's decisions for one batch.
 *
 * Each item carries its decision:
 *   - "approve"       → categorize+archive with the predicted category.
 *   - "exclude"       → do not act, but log the rejection as feedback.
 *   - "recategorize"  → categorize+archive with overrideCategory, log the
 *                        human correction for classifier learning.
 *
 * Server-side re-classification is done before every "approve" as a safety
 * net — if the rule set changed between load and execute, we skip.
 */
export async function executeReviewDecisions(
  decisions: ReviewDecision[],
): Promise<ExecuteResult> {
  const result: ExecuteResult = {
    total: decisions.length,
    executed: 0,
    succeeded: 0,
    failed: 0,
    excluded: 0,
    recategorized: 0,
    errors: [],
  };
  const admin = createAdminClient();

  for (const d of decisions) {
    const isoNow = new Date().toISOString();

    // Always log feedback — whatever the decision.
    const feedbackRow = {
      automation: "debtor-email-review",
      status: "feedback" as const,
      result: {
        stage: "review_decision",
        decision: d.decision,
        message_id: d.id,
        subject: d.subject,
        from: d.from,
        received_at: d.receivedAt,
        predicted: {
          category: d.predictedCategory,
          confidence: d.predictedConfidence,
          rule: d.predictedRule,
        },
        override_category: d.overrideCategory ?? null,
        notes: d.notes ?? null,
        rule_hint: d.ruleHint ?? null,
      },
      error_message: null,
      triggered_by: "bulk-review:ui",
      completed_at: isoNow,
    };
    await admin.from("automation_runs").insert(feedbackRow);

    if (d.decision === "exclude") {
      result.excluded++;
      continue;
    }

    const targetCategoryKey =
      d.decision === "recategorize" ? d.overrideCategory ?? "" : d.predictedCategory;
    const categoryLabel = CATEGORY_LABEL[targetCategoryKey];
    if (!categoryLabel) {
      result.failed++;
      const errMsg = `no Outlook category configured for ${targetCategoryKey}`;
      result.errors.push({ messageId: d.id, subject: d.subject, error: errMsg });
      await admin.from("automation_runs").insert({
        automation: "debtor-email-review",
        status: "failed",
        result: {
          stage: "no_category_configured",
          message_id: d.id,
          target_category: targetCategoryKey,
          decision: d.decision,
        },
        error_message: errMsg,
        triggered_by: "bulk-review:ui",
        completed_at: isoNow,
      });
      continue;
    }

    // Approve path: re-classify server-side. Recategorize path: trust the human.
    if (d.decision === "approve") {
      const predicted = classify({
        subject: d.subject,
        from: d.from,
        bodySnippet: d.bodyPreview,
      });
      if (predicted.category !== d.predictedCategory) {
        result.failed++;
        result.errors.push({
          messageId: d.id,
          subject: d.subject,
          error: `server re-classified to ${predicted.category} — skipped`,
        });
        await admin.from("automation_runs").insert({
          automation: "debtor-email-review",
          status: "failed",
          result: {
            stage: "reclass_guard",
            expected: d.predictedCategory,
            actual: predicted.category,
            message_id: d.id,
          },
          error_message: "re-classification mismatch",
          triggered_by: "bulk-review:ui",
          completed_at: isoNow,
        });
        continue;
      }
    }

    const catRes = await categorizeEmail(MAILBOX, d.id, categoryLabel);
    if (!catRes.success) {
      result.failed++;
      result.errors.push({
        messageId: d.id,
        subject: d.subject,
        error: `categorize: ${catRes.error}`,
      });
      await admin.from("automation_runs").insert({
        automation: "debtor-email-review",
        status: "failed",
        result: { stage: "categorize", message_id: d.id, category: categoryLabel },
        error_message: catRes.error ?? null,
        triggered_by: "bulk-review:ui",
        completed_at: isoNow,
      });
      continue;
    }

    // labelOnly: two sources trigger this path —
    //   (a) reviewer hand-picked from the Onbekend bucket — we want to
    //       train the classifier but verify before auto-actioning.
    //   (b) category is in LABEL_ONLY_CATEGORIES (ooo_permanent) —
    //       requires a human to update NXT with the new contact address
    //       before the mail can be archived.
    if (d.labelOnly || LABEL_ONLY_CATEGORIES.has(targetCategoryKey)) {
      result.executed++;
      result.succeeded++;
      if (d.decision === "recategorize") result.recategorized++;
      await admin.from("automation_runs").insert({
        automation: "debtor-email-review",
        status: "completed",
        result: {
          stage: "categorize_only",
          message_id: d.id,
          applied_category: categoryLabel,
          decision: d.decision,
          source: d.labelOnly ? "unknown_group" : "label_only_category",
        },
        error_message: null,
        triggered_by: "bulk-review:ui",
        completed_at: isoNow,
      });
      continue;
    }

    const arcRes = await archiveEmail(MAILBOX, d.id);
    if (!arcRes.success) {
      result.failed++;
      result.errors.push({
        messageId: d.id,
        subject: d.subject,
        error: `archive: ${arcRes.error}`,
      });
      await admin.from("automation_runs").insert({
        automation: "debtor-email-review",
        status: "failed",
        result: { stage: "archive", message_id: d.id, category: categoryLabel },
        error_message: arcRes.error ?? null,
        triggered_by: "bulk-review:ui",
        completed_at: isoNow,
      });
      continue;
    }

    result.executed++;
    result.succeeded++;
    if (d.decision === "recategorize") result.recategorized++;
    await admin.from("automation_runs").insert({
      automation: "debtor-email-review",
      status: "completed",
      result: {
        stage: "categorize+archive",
        message_id: d.id,
        applied_category: categoryLabel,
        decision: d.decision,
      },
      error_message: null,
      triggered_by: "bulk-review:ui",
      completed_at: isoNow,
    });

    // iController delete wordt NIET inline uitgevoerd. Een enkele browser-
    // session duurt 15-25s; een chunk van 10 items tikt daardoor tegen
    // Vercel's Cloudflare proxy idle-timeout (~60-90s) aan en de connectie
    // wordt gekapt met ERR_CONNECTION_CLOSED / "Failed to fetch". Items
    // worden dan op de server wel verwerkt maar de UI ziet geen resultaat.
    //
    // In plaats daarvan loggen we een 'deferred' rij. De Inngest
    // cleanup-cron (debtor-email-icontroller-cleanup) pakt deze later op.
    // De Outlook-kant is al gesynct (categorize + archive staat).
    //
    // `deferred` i.p.v. `pending` zodat de V7 swarm-bridge deze in de
    // "Ready" kanban-lane toont (waiting for a different worker) i.p.v.
    // "In Progress" (actively processing). Zie docs/swarm-bridge-contract.md.
    await admin.from("automation_runs").insert({
      automation: "debtor-email-review",
      status: "deferred",
      result: {
        stage: "icontroller_delete",
        message_id: d.id,
        company: ICONTROLLER_COMPANY,
        icontroller: "pending",
        from: d.from,
        subject: d.subject,
        received_at: d.receivedAt,
      },
      error_message: null,
      triggered_by: "bulk-review:ui",
      completed_at: isoNow,
    });
  }

  return result;
}

/**
 * On-demand fetch of a single message body for the review UI. Reviewers
 * only expand a few items per batch — cheaper than fetching bodies for all
 * 300 on page load.
 */
export async function fetchReviewEmailBody(messageId: string): Promise<
  | { ok: true; bodyText: string; bodyHtml: string; bodyType: "text" | "html" }
  | { ok: false; error: string }
> {
  try {
    const body = await fetchMessageBody(MAILBOX, messageId);
    return { ok: true, ...body };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
