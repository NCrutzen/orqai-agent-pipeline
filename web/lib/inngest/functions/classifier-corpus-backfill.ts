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

    // Step 1 — load the corpus. Two queries because the Supabase JS client
    // lacks cross-schema joins. Page emails in 1k chunks to stay under the
    // default row-limit ceiling.
    const rows = await step.run("load-corpus", async (): Promise<JoinedRow[]> => {
      const { data: analysis, error: aErr } = await admin
        .schema("debtor")
        .from("email_analysis")
        .select("email_id, email_intent, category");
      if (aErr) throw new Error(`corpus load (analysis): ${aErr.message}`);

      const analysisRows = (analysis ?? []) as AnalysisRow[];
      const ids = analysisRows.map((r) => r.email_id);
      const emails: Record<string, EmailRow> = {};

      for (let i = 0; i < ids.length; i += 1000) {
        const chunk = ids.slice(i, i + 1000);
        const { data, error } = await admin
          .schema("email_pipeline")
          .from("emails")
          .select("id, subject, sender_email, body_text, body_html")
          .in("id", chunk);
        if (error) throw new Error(`corpus load (emails ${i}): ${error.message}`);
        for (const e of (data ?? []) as EmailRow[]) emails[e.id] = e;
      }

      return analysisRows.map((a) => ({ ...a, email: emails[a.email_id] ?? null }));
    });

    // Step 2 — classify and aggregate. Pure JS, no IO. Wrapped in step.run so
    // Inngest captures the tally for replay/visibility but it is fast.
    const result = await step.run("classify-and-aggregate", () => {
      const tally = new Map<string, { n: number; agree: number; predictedCategory: string }>();
      let skippedMissingFields = 0;
      let totalClassified = 0;

      for (const row of rows) {
        const e = row.email;
        if (!e || !e.subject || !e.sender_email) {
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

        // Skip catch-alls and hard-blocks — they cannot promote.
        if (predicted.matchedRule === "no_match") continue;
        if (predicted.category === "unknown") continue;

        const key = predicted.matchedRule;
        const cur = tally.get(key) ?? { n: 0, agree: 0, predictedCategory: predicted.category };
        cur.n += 1;
        if (isAgreement(predicted.category, row.category, row.email_intent)) cur.agree += 1;
        tally.set(key, cur);
      }
      return {
        tally: Array.from(tally.entries()),
        skippedMissingFields,
        totalClassified,
      };
    });

    // Step 3 — upsert each rule. status='candidate' — promotion is the cron's job.
    const seeded = await step.run("upsert-rules", async () => {
      const now = new Date().toISOString();
      let count = 0;
      for (const [ruleKey, t] of result.tally) {
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
      return count;
    });

    return {
      processed: rows.length,
      skipped_missing_fields: result.skippedMissingFields,
      total_classified: result.totalClassified,
      rules_seeded: seeded,
    };
  },
);

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
