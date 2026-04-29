// Phase 60-08 (D-04, D-22, D-28). Event-only Inngest function:
// samples up to 50 hard-case rows per promotable rule into public.automation_runs
// with status='predicted' so they appear in the existing review-queue UI.
//
// Trigger via Inngest dashboard:
//   classifier/spotcheck.queue { "max_per_rule": 50, "triggeredBy": "<operator>" }
//
// "Hard case" = rule fired AND isAgreement(predicted, llm) is false.
// If a rule has fewer than max_per_rule hard cases, fill the remainder with
// random agreements (deterministic shuffle by email_id hash) so the operator
// always reviews a fixed-size sample per rule.
//
// Schema (mirrors zapier-ingest predicted rows so the UI renders correctly):
//   automation_runs.automation = 'debtor-email-review'
//   automation_runs.status = 'predicted'
//   automation_runs.triggered_by = 'corpus-backfill-spotcheck' (sentinel)
//   automation_runs.topic = classify().category
//   automation_runs.entity = labeling_settings.entity (lookup) or 'smeba' fallback
//   automation_runs.result = { from, subject, message_id, source_mailbox,
//                              predicted: { rule, category, confidence },
//                              action: 'spotcheck_review',
//                              stage: 'corpus_backfill',
//                              email_id }
//
// Verdicts on these rows flow through the existing recordVerdict server
// action which writes to agent_runs and fires classifier/verdict.recorded.
//
// D-22: classify.ts is read-only. D-28: automation_runs schema unchanged
// (additive insert with new triggered_by sentinel).
// Idempotency: pre-insert check on (triggered_by, result->>email_id).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { classify, type ClassifyResult } from "@/lib/debtor-email/classify";
import { isAgreement } from "@/lib/classifier/corpus-mapping";
import { PROMOTE_N_MIN } from "@/lib/classifier/wilson";

const SPOTCHECK_TRIGGERED_BY = "corpus-backfill-spotcheck";
const DEFAULT_MAX_PER_RULE = 50;
const FALLBACK_ENTITY = "smeba" as const;

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
  mailbox: string | null;
  internet_message_id: string | null;
}

interface RuleRow {
  rule_key: string;
  n: number;
  status: string;
}

interface SampledEmail {
  email_id: string;
  predicted: ClassifyResult;
  subject: string;
  sender: string;
  mailbox: string | null;
  message_id: string | null;
}

interface PerRuleResult {
  rule_key: string;
  hard_cases_inserted: number;
  fillers_inserted: number;
}

export const classifierSpotcheckSampler = inngest.createFunction(
  { id: "classifier/spotcheck.queue", retries: 1 },
  { event: "classifier/spotcheck.queue" },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const maxPerRule = Math.max(1, Math.min(200, event.data?.max_per_rule ?? DEFAULT_MAX_PER_RULE));

    // Step 1 — load promotable rules: candidate + n >= 30, exclude no_match.
    const promotable = await step.run("load-promotable-rules", async (): Promise<RuleRow[]> => {
      const { data, error } = await admin
        .from("classifier_rules")
        .select("rule_key, n, status")
        .eq("swarm_type", "debtor-email")
        .eq("status", "candidate")
        .gte("n", PROMOTE_N_MIN)
        .neq("rule_key", "no_match");
      if (error) throw new Error(`load-promotable-rules: ${error.message}`);
      return (data ?? []) as RuleRow[];
    });

    if (promotable.length === 0) {
      return { rules_processed: 0, total_inserted: 0, per_rule: [] as PerRuleResult[] };
    }

    // Step 2 — load entity lookup (source_mailbox -> entity).
    const entityByMailbox = await step.run("load-entity-lookup", async (): Promise<Record<string, string>> => {
      const { data, error } = await admin
        .schema("debtor")
        .from("labeling_settings")
        .select("source_mailbox, entity");
      if (error) throw new Error(`labeling_settings load: ${error.message}`);
      const map: Record<string, string> = {};
      for (const r of (data ?? []) as { source_mailbox: string; entity: string }[]) {
        map[r.source_mailbox] = r.entity;
      }
      return map;
    });

    // Steps 3+4 merged — load corpus AND classify+bucket in one step.
    // Same lessons as corpus-backfill: paginate analysis (1000-row cap),
    // chunk emails at 200 (URL length), keep bodies inside the closure
    // (output_too_large) and only return the small per-rule samples.
    const buckets = await step.run("load-classify-bucket", async () => {
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

      const promotableSet = new Set(promotable.map((r) => r.rule_key));
      const bucketed = new Map<
        string,
        { hard: SampledEmail[]; agree: SampledEmail[] }
      >();

      const CHUNK = 200;
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK);
        const { data, error } = await admin
          .schema("email_pipeline")
          .from("emails")
          .select("id, subject, sender_email, body_text, body_html, mailbox, internet_message_id")
          .in("id", chunk);
        if (error) throw new Error(`corpus load (emails ${i}): ${error.message}`);

        for (const e of (data ?? []) as EmailRow[]) {
          const a = byId.get(e.id);
          if (!a) continue;
          if (!e.subject || !e.sender_email) continue;
          const body = e.body_text ?? stripHtml(e.body_html ?? "");
          if (!body) continue;

          const predicted = classify({
            subject: e.subject,
            from: e.sender_email,
            bodySnippet: body,
          });
          if (!promotableSet.has(predicted.matchedRule)) continue;
          if (predicted.category === "unknown") continue;

          const sampled: SampledEmail = {
            email_id: a.email_id,
            predicted,
            subject: e.subject,
            sender: e.sender_email,
            mailbox: e.mailbox,
            message_id: e.internet_message_id,
          };

          const bucket = bucketed.get(predicted.matchedRule) ?? { hard: [], agree: [] };
          if (isAgreement(predicted.category, a.category, a.email_intent)) {
            bucket.agree.push(sampled);
          } else {
            bucket.hard.push(sampled);
          }
          bucketed.set(predicted.matchedRule, bucket);
        }
      }

      // Deterministic shuffle per rule via email_id hash so re-runs sample the
      // same rows (auditable). Sort by hash then take first N.
      const samples: Array<{ rule_key: string; hard: SampledEmail[]; fillers: SampledEmail[] }> = [];
      for (const [ruleKey, b] of bucketed) {
        const hardSorted = [...b.hard].sort((a, c) => hashString(a.email_id) - hashString(c.email_id));
        const hardSample = hardSorted.slice(0, maxPerRule);
        const remaining = maxPerRule - hardSample.length;
        const agreeSorted = [...b.agree].sort((a, c) => hashString(a.email_id) - hashString(c.email_id));
        const fillers = remaining > 0 ? agreeSorted.slice(0, remaining) : [];
        samples.push({ rule_key: ruleKey, hard: hardSample, fillers });
      }
      return samples;
    });

    // Step 5 — idempotency check + batch insert into automation_runs.
    // Skip rows already present under triggered_by='corpus-backfill-spotcheck'
    // (matched on result->>email_id).
    const inserted = await step.run("insert-samples", async () => {
      const allSamples = buckets.flatMap((b) => [...b.hard, ...b.fillers]);
      const allEmailIds = allSamples.map((s) => s.email_id);
      const existingIds = new Set<string>();

      // Page existing checks at 200 ids per query (same URL-length reasoning).
      for (let i = 0; i < allEmailIds.length; i += 200) {
        const chunk = allEmailIds.slice(i, i + 200);
        const { data, error } = await admin
          .from("automation_runs")
          .select("result")
          .eq("triggered_by", SPOTCHECK_TRIGGERED_BY)
          .in("result->>email_id", chunk);
        if (error) {
          // Fallback: PostgREST may not allow .in() on jsonb extracts. If so,
          // fetch all spotcheck rows once and filter in-memory.
          const { data: all, error: fbErr } = await admin
            .from("automation_runs")
            .select("result")
            .eq("triggered_by", SPOTCHECK_TRIGGERED_BY);
          if (fbErr) throw new Error(`idempotency check: ${fbErr.message}`);
          for (const r of (all ?? []) as Array<{ result: { email_id?: string } }>) {
            if (r.result?.email_id) existingIds.add(r.result.email_id);
          }
          break;
        }
        for (const r of (data ?? []) as Array<{ result: { email_id?: string } }>) {
          if (r.result?.email_id) existingIds.add(r.result.email_id);
        }
      }

      const perRule: PerRuleResult[] = [];
      let totalInserted = 0;

      for (const b of buckets) {
        const hardRows = b.hard.filter((s) => !existingIds.has(s.email_id));
        const fillerRows = b.fillers.filter((s) => !existingIds.has(s.email_id));
        const allRows = [...hardRows, ...fillerRows];

        const payloads = allRows.map((s) => {
          const entity = (s.mailbox && entityByMailbox[s.mailbox]) || FALLBACK_ENTITY;
          return {
            automation: "debtor-email-review",
            status: "predicted",
            swarm_type: "debtor-email",
            topic: s.predicted.category,
            entity,
            mailbox_id: null,
            triggered_by: SPOTCHECK_TRIGGERED_BY,
            result: {
              from: s.sender,
              stage: "corpus_backfill",
              action: "spotcheck_review",
              entity,
              subject: s.subject,
              email_id: s.email_id,
              predicted: {
                rule: s.predicted.matchedRule,
                category: s.predicted.category,
                confidence: s.predicted.confidence,
              },
              message_id: s.message_id,
              source_mailbox: s.mailbox,
            },
          };
        });

        // Page inserts at 100 rows per round-trip.
        for (let i = 0; i < payloads.length; i += 100) {
          const chunk = payloads.slice(i, i + 100);
          if (chunk.length === 0) continue;
          const { error } = await admin.from("automation_runs").insert(chunk);
          if (error) throw new Error(`insert ${b.rule_key}: ${error.message}`);
        }

        perRule.push({
          rule_key: b.rule_key,
          hard_cases_inserted: hardRows.length,
          fillers_inserted: fillerRows.length,
        });
        totalInserted += allRows.length;
      }

      return { totalInserted, perRule };
    });

    return {
      rules_processed: promotable.length,
      total_inserted: inserted.totalInserted,
      per_rule: inserted.perRule,
    };
  },
);

// ─────────────────────────────────────────────────────────── helpers ──

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

// Deterministic 32-bit string hash (FNV-1a). Used only for stable shuffle order;
// not security-sensitive.
function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h;
}
