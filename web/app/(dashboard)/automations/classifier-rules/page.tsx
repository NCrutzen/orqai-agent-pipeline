// Phase 60-04 (D-26). Cross-swarm rules dashboard.
// Server component reading classifier_rules + 14d evaluation history.
// Shadow-mode banner shown when CLASSIFIER_CRON_MUTATE !== "true".
// Page re-fetches every 5 min via revalidate; route group enforces auth.

import { createAdminClient } from "@/lib/supabase/admin";
import { RulesTable } from "./rules-table";
import type { ClassifierRule } from "@/lib/classifier/types";

export const dynamic = "force-dynamic";
export const revalidate = 300;

interface EvaluationRow {
  swarm_type: string;
  rule_key: string;
  ci_lo: number;
  action: string;
  evaluated_at: string;
}

export default async function ClassifierRulesPage() {
  const admin = createAdminClient();
  const mutate = process.env.CLASSIFIER_CRON_MUTATE === "true";

  const { data: rulesData } = await admin
    .from("classifier_rules")
    .select("*")
    .order("last_evaluated", { ascending: false });

  const rules: ClassifierRule[] = (rulesData ?? []) as ClassifierRule[];

  // Pull last 14 days of evaluations for the sparklines.
  const fourteenDaysAgo = new Date(Date.now() - 14 * 86400_000).toISOString();
  const { data: evalsData } = await admin
    .from("classifier_rule_evaluations")
    .select("swarm_type, rule_key, ci_lo, action, evaluated_at")
    .gte("evaluated_at", fourteenDaysAgo)
    .order("evaluated_at", { ascending: true });

  const evals: EvaluationRow[] = (evalsData ?? []) as EvaluationRow[];

  const evalsByRule: Record<string, Array<{ ci_lo: number; evaluated_at: string }>> = {};
  for (const e of evals) {
    const k = `${e.swarm_type}::${e.rule_key}`;
    (evalsByRule[k] ??= []).push({
      ci_lo: e.ci_lo,
      evaluated_at: e.evaluated_at,
    });
  }

  return (
    <div className="px-8 pt-16 pb-12 max-w-[1280px] mx-auto">
      <h1 className="text-[28px] font-semibold leading-[1.2] font-[family-name:var(--font-cabinet)]">
        Classifier Rules
      </h1>
      <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] mt-2">
        Auto-promotion of regex and intent rules across all swarms. Wilson 95%
        CI-lo gates promotion at N≥30 and demotion at &lt;92%.
      </p>
      {!mutate && (
        <div
          role="status"
          className="mt-6 px-6 py-4 rounded-[var(--v7-radius-card)] bg-[var(--v7-blue-soft)] text-[var(--v7-blue)] text-[14px] leading-[1.5]"
        >
          Shadow mode — cron records evaluations but does not mutate rule status.
          Showing &quot;would have promoted&quot; indicators.
        </div>
      )}
      <RulesTable
        rules={rules}
        evalsByRule={evalsByRule}
        shadowMode={!mutate}
      />
    </div>
  );
}
