// Phase 60-08 (D-04, D-08, D-22, D-28). Event-only Inngest function:
// re-runs classify() over the 6,114-email LLM corpus and seeds
// public.classifier_rules with corpus-derived n/agree per matchedRule.
//
// Trigger via Inngest dashboard:
//   classifier/corpus-backfill.run { "triggeredBy": "<operator>" }
//
// Status is set to 'candidate' (NOT promoted). Promotion happens via the
// daily classifier-promotion-cron once CLASSIFIER_CRON_MUTATE=true (see 60-07).
//
// D-22: web/lib/debtor-email/classify.ts is read-only — imported, never modified.
// D-28: additive only. classifier_rules schema unchanged. Idempotent on re-run
// via ON CONFLICT(swarm_type, rule_key) DO UPDATE.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { classify } from "@/lib/debtor-email/classify";
import { isAgreement } from "@/lib/classifier/corpus-mapping";
import { wilsonCiLower } from "@/lib/classifier/wilson";

interface AnalysisRow {
  email_id: string;
  email_intent: string | null;
  category: string | null;
}

interface EmailRow {
  id: string;
  subject: string | null;
  sender_email: string | null;
  body_text: string | null;
  body_html: string | null;
}

interface JoinedRow extends AnalysisRow {
  email: EmailRow | null;
}

export const classifierCorpusBackfill = inngest.createFunction(
  { id: "classifier/corpus-backfill", retries: 1 },
  { event: "classifier/corpus-backfill.run" },
  async ({ step }) => {
    const admin = createAdminClient();

    // Step 1+2 merged — load corpus AND classify in the same step. Bodies
    // (especially body_html) are tens of KB each; returning 6k of them blows
    // past Inngest's per-step output limit (~1 MB → output_too_large). Keep
    // them inside the closure and only return the small tally.
    //
    // PostgREST .in() filter has a URL length limit — chunk size 200 keeps
    // each request under it (1000 returned 400 Bad Request).
    const result = await step.run("load-and-classify", async () => {
      // Supabase REST default cap = 1000 rows. Without explicit pagination
      // the analysis fetch silently truncated to 1000 of 6,114 rows on the
      // first run and we tallied ~16% of the corpus. Page in 1k batches.
      const analysisRows: AnalysisRow[] = [];
      const PAGE = 1000;
      for (let from = 0; ; from += PAGE) {
        const { data, error } = await admin
          .schema("debtor")
          .from("email_analysis")
          .select("email_id, email_intent, category")
          .range(from, from + PAGE - 1);
        if (error) throw new Error(`corpus load (analysis ${from}): ${error.message}`);
        const batch = (data ?? []) as AnalysisRow[];
        analysisRows.push(...batch);
        if (batch.length < PAGE) break;
      }

      const byId = new Map<string, AnalysisRow>(analysisRows.map((r) => [r.email_id, r]));
      const ids = analysisRows.map((r) => r.email_id);

      const tally = new Map<string, { n: number; agree: number; predictedCategory: string }>();
      let skippedMissingFields = 0;
      let totalClassified = 0;
      let processed = 0;

      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await admin
          .schema("email_pipeline")
          .from("emails")
          .select("id, subject, sender_email, body_text, body_html")
          .in("id", chunk);
        if (error) throw new Error(`corpus load (emails ${i}): ${error.message}`);

        for (const e of (data ?? []) as EmailRow[]) {
          processed++;
          const a = byId.get(e.id);
          if (!a) continue;
          if (!e.subject || !e.sender_email) {
            skippedMissingFields++;
            continue;
          }
          const body = e.body_text ?? stripHtml(e.body_html ?? "");
          if (!body) {
            skippedMissingFields++;
            continue;
          }

          const predicted = classify({
            subject: e.subject,
            from: e.sender_email,
            bodySnippet: body,
          });
          totalClassified++;

          if (predicted.matchedRule === "no_match") continue;
          if (predicted.category === "unknown") continue;

          const key = predicted.matchedRule;
          const cur = tally.get(key) ?? { n: 0, agree: 0, predictedCategory: predicted.category };
          cur.n += 1;
          if (isAgreement(predicted.category, a.category, a.email_intent)) cur.agree += 1;
          tally.set(key, cur);
        }
      }

      return {
        tally: Array.from(tally.entries()),
        skippedMissingFields,
        totalClassified,
        processed,
      };
    });

    // Step 3 — upsert each rule. status='candidate' — promotion is the cron's job.
    // Skip rules whose existing status is 'promoted' or 'manual_block': the
    // corpus is a smaller signal than whatever seeded those rules originally
    // (60-02 hardcoded numbers from a different historical analysis), so
    // overwriting would be a regression. Additive only — D-28.
    const seeded = await step.run("upsert-rules", async () => {
      const now = new Date().toISOString();

      const { data: existing, error: exErr } = await admin
        .from("classifier_rules")
        .select("rule_key, status")
        .eq("swarm_type", "debtor-email");
      if (exErr) throw new Error(`load existing rules: ${exErr.message}`);
      const lockedRules = new Set(
        ((existing ?? []) as { rule_key: string; status: string }[])
          .filter((r) => r.status === "promoted" || r.status === "manual_block")
          .map((r) => r.rule_key),
      );

      let count = 0;
      let skippedLocked = 0;
      for (const [ruleKey, t] of result.tally) {
        if (lockedRules.has(ruleKey)) {
          skippedLocked++;
          continue;
        }
        const ci_lo = wilsonCiLower(t.n, t.agree);
        const { error } = await admin.from("classifier_rules").upsert(
          {
            swarm_type: "debtor-email",
            rule_key: ruleKey,
            kind: "regex",
            status: "candidate",
            n: t.n,
            agree: t.agree,
            ci_lo,
            last_evaluated: now,
            notes: `corpus-backfill ${now.slice(0, 10)} agree=${t.agree}/${t.n}`,
          },
          { onConflict: "swarm_type,rule_key" },
        );
        if (error) throw new Error(`upsert ${ruleKey}: ${error.message}`);
        count++;
      }
      return { count, skippedLocked };
    });

    return {
      processed: result.processed,
      skipped_missing_fields: result.skippedMissingFields,
      total_classified: result.totalClassified,
      rules_seeded: seeded.count,
      rules_skipped_locked: seeded.skippedLocked,
    };
  },
);

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
