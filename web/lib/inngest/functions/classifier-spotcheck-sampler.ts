// Phase 60-08 (D-04, D-22, D-28). Event-only Inngest function:
// samples up to 50 hard-case rows per promotable rule into public.agent_runs
// for human review under intent_version='corpus-backfill-spotcheck'.
//
// Trigger via Inngest dashboard:
//   classifier/spotcheck.queue { "max_per_rule": 50, "triggeredBy": "<operator>" }
//
// "Hard case" = rule fired AND isAgreement(predicted, llm) is false.
// If a rule has fewer than max_per_rule hard cases, fill the remainder with
// random agreements (deterministic shuffle by email_id hash) so the operator
// always reviews a fixed-size sample per rule.
//
// D-22: classify.ts is read-only. D-28: agent_runs schema unchanged
// (additive insert with new intent_version sentinel).
// Idempotency: pre-insert check on (email_id, intent_version='corpus-backfill-spotcheck').

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { classify, type ClassifyResult } from "@/lib/debtor-email/classify";
import { isAgreement } from "@/lib/classifier/corpus-mapping";
import { PROMOTE_N_MIN } from "@/lib/classifier/wilson";

const SPOTCHECK_INTENT_VERSION = "corpus-backfill-spotcheck";
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
}

interface JoinedRow extends AnalysisRow {
  email: EmailRow | null;
}

interface RuleRow {
  rule_key: string;
  n: number;
  status: string;
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

    // Step 2 — load corpus (same shape as corpus-backfill).
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

    // Step 3 — classify and bucket per rule_key into hard cases / agreements.
    const buckets = await step.run("classify-and-bucket", () => {
      const promotableSet = new Set(promotable.map((r) => r.rule_key));
      const bucketed = new Map<
        string,
        {
          hard: Array<{ email_id: string; predicted: ClassifyResult }>;
          agree: Array<{ email_id: string; predicted: ClassifyResult }>;
        }
      >();

      for (const row of rows) {
        const e = row.email;
        if (!e || !e.subject || !e.sender_email) continue;
        const body = e.body_text ?? stripHtml(e.body_html ?? "");
        if (!body) continue;

        const predicted = classify({
          subject: e.subject,
          from: e.sender_email,
          bodySnippet: body,
        });
        if (!promotableSet.has(predicted.matchedRule)) continue;
        if (predicted.category === "unknown") continue;

        const bucket = bucketed.get(predicted.matchedRule) ?? { hard: [], agree: [] };
        if (isAgreement(predicted.category, row.category, row.email_intent)) {
          bucket.agree.push({ email_id: row.email_id, predicted });
        } else {
          bucket.hard.push({ email_id: row.email_id, predicted });
        }
        bucketed.set(predicted.matchedRule, bucket);
      }

      // Deterministic shuffle per rule via email_id hash so re-runs sample the
      // same rows (auditable). Sort by hash then take first N.
      const samples: Array<{
        rule_key: string;
        hard: Array<{ email_id: string; predicted: ClassifyResult }>;
        fillers: Array<{ email_id: string; predicted: ClassifyResult }>;
      }> = [];
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

    // Step 4 — idempotency check + batch insert. Skip rows already present
    // under intent_version='corpus-backfill-spotcheck'.
    const inserted = await step.run("insert-samples", async () => {
      const allEmailIds = buckets.flatMap((b) => [
        ...b.hard.map((x) => x.email_id),
        ...b.fillers.map((x) => x.email_id),
      ]);
      const existingIds = new Set<string>();

      // Page existing-id checks at 1k per query.
      for (let i = 0; i < allEmailIds.length; i += 1000) {
        const chunk = allEmailIds.slice(i, i + 1000);
        const { data, error } = await admin
          .from("agent_runs")
          .select("email_id")
          .eq("intent_version", SPOTCHECK_INTENT_VERSION)
          .in("email_id", chunk);
        if (error) throw new Error(`idempotency check: ${error.message}`);
        for (const r of (data ?? []) as Array<{ email_id: string }>) existingIds.add(r.email_id);
      }

      const perRule: PerRuleResult[] = [];
      let totalInserted = 0;

      for (const b of buckets) {
        const hardRows = b.hard.filter((x) => !existingIds.has(x.email_id));
        const fillerRows = b.fillers.filter((x) => !existingIds.has(x.email_id));
        const allRows = [...hardRows, ...fillerRows];

        // Build insert payloads. Note: we explicitly do NOT set human_verdict
        // so the queue surfaces these for operator review.
        const payloads = allRows.map((x) => ({
          swarm_type: "debtor-email" as const,
          email_id: x.email_id,
          entity: FALLBACK_ENTITY,
          rule_key: x.predicted.matchedRule,
          intent: mapPredictedToIntent(x.predicted.category),
          intent_version: SPOTCHECK_INTENT_VERSION,
          confidence: mapConfidence(x.predicted.confidence),
          status: "routed_human_queue" as const,
          // human_verdict omitted -> NULL on insert (queue signal)
        }));

        // Page inserts at 100 rows per round-trip.
        for (let i = 0; i < payloads.length; i += 100) {
          const chunk = payloads.slice(i, i + 100);
          if (chunk.length === 0) continue;
          const { error } = await admin.from("agent_runs").insert(chunk);
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

// Map classify().confidence (0-1) → agent_runs.confidence enum (low/medium/high).
function mapConfidence(c: number): "low" | "medium" | "high" {
  if (c < 0.7) return "low";
  if (c <= 0.9) return "medium";
  return "high";
}

// Map predicted Category → agent_runs.intent enum value. Spot-check rows are
// not real intent-agent output, but agent_runs.intent has a CHECK constraint
// so we pick the closest enum slot.
function mapPredictedToIntent(category: string): string {
  switch (category) {
    case "payment_admittance":
      return "payment_dispute"; // closest enum slot for payment-related signal
    case "auto_reply":
    case "ooo_temporary":
    case "ooo_permanent":
      return "general_inquiry";
    default:
      return "other";
  }
}
