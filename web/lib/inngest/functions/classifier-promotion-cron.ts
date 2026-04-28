// Phase 60-03 (D-02, D-03, D-09, D-19, D-23, D-29). Daily classifier promotion cron.
//
// cron: TZ=Europe/Amsterdam 0 6 * * 1-5 -- daily 06:00 Amsterdam, Mon-Fri (D-09)
// Single-line comment only -- never put cron strings inside JSDoc per
// CLAUDE.md learning eb434cfd (the */N would close the comment).
//
// Reads public.classifier_rule_telemetry, writes public.classifier_rule_evaluations.
// Mutates public.classifier_rules.status only when CLASSIFIER_CRON_MUTATE === "true".
// Default is shadow mode (D-19): cron logs what it WOULD do but never flips status.
// Flag-flip happens in plan 60-07 after 14-day operator review.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  wilsonCiLower,
  shouldPromote,
  shouldDemote,
} from "@/lib/classifier/wilson";
import type { EvaluationAction, RuleStatus } from "@/lib/classifier/types";

export interface TelemetryRow {
  swarm_type: string;
  rule_key: string;
  n: number;
  agree: number;
}

export interface RuleRow {
  swarm_type: string;
  rule_key: string;
  status: RuleStatus;
}

export interface EvaluateRuleResult {
  swarm_type: string;
  rule_key: string;
  action: EvaluationAction;
  ci_lo: number;
}

// Minimal admin-client shape we need -- accept any so the test harness can
// pass a stubbed builder. Inngest passes the real Supabase client at runtime.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminLike = any;

/**
 * Pure-ish per-rule evaluator. Extracted from the cron body so unit tests
 * can call it directly without spinning up Inngest's step harness.
 *
 * Behaviour matrix (D-19):
 *   mutate=false (shadow): NEVER updates classifier_rules; writes evaluation
 *     row with action shadow_would_promote / shadow_would_demote / no_change.
 *   mutate=true (live): updates classifier_rules.status when gates pass; writes
 *     evaluation row with action promoted / demoted / no_change. Demotion path
 *     also fires a console.warn alert with rule_key + n + ci_lo (D-03, T-60-03-02).
 *
 * manual_block rules are NEVER auto-touched regardless of telemetry (T-60-03-05).
 */
export async function evaluateRule(
  admin: AdminLike,
  telemetry: TelemetryRow,
  rule: RuleRow | undefined,
  mutate: boolean,
): Promise<EvaluateRuleResult> {
  const ci_lo = wilsonCiLower(telemetry.n, telemetry.agree);
  const status: RuleStatus = rule?.status ?? "candidate";
  const now = new Date().toISOString();

  // manual_block: log the no-op evaluation row, never touch the rule.
  if (status === "manual_block") {
    await admin.from("classifier_rule_evaluations").upsert(
      {
        swarm_type: telemetry.swarm_type,
        rule_key: telemetry.rule_key,
        n: telemetry.n,
        agree: telemetry.agree,
        ci_lo,
        action: "no_change" satisfies EvaluationAction,
      },
      { onConflict: "swarm_type,rule_key,evaluated_at" },
    );
    return {
      swarm_type: telemetry.swarm_type,
      rule_key: telemetry.rule_key,
      action: "no_change",
      ci_lo,
    };
  }

  const promote = status === "candidate" && shouldPromote(telemetry.n, ci_lo);
  const demote = status === "promoted" && shouldDemote(ci_lo);

  let action: EvaluationAction = "no_change";

  if (mutate) {
    // LIVE MODE -- mutate classifier_rules.status when gates trip.
    if (promote) {
      action = "promoted";
      await admin
        .from("classifier_rules")
        .update({
          status: "promoted",
          promoted_at: now,
          n: telemetry.n,
          agree: telemetry.agree,
          ci_lo,
          last_evaluated: now,
        })
        .eq("swarm_type", telemetry.swarm_type)
        .eq("rule_key", telemetry.rule_key);
    } else if (demote) {
      action = "demoted";
      // D-03 / T-60-03-02: demotion is loud. console.warn so operator dashboards
      // pick it up; the classifier_rule_evaluations row carries action='demoted'
      // permanently for audit.
      console.warn("[classifier-cron] DEMOTION", {
        swarm_type: telemetry.swarm_type,
        rule_key: telemetry.rule_key,
        n: telemetry.n,
        ci_lo,
      });
      await admin
        .from("classifier_rules")
        .update({
          status: "demoted",
          last_demoted_at: now,
          n: telemetry.n,
          agree: telemetry.agree,
          ci_lo,
          last_evaluated: now,
        })
        .eq("swarm_type", telemetry.swarm_type)
        .eq("rule_key", telemetry.rule_key);
    } else {
      // No gate trip -- still refresh counters so the table reflects latest stats.
      await admin
        .from("classifier_rules")
        .update({
          n: telemetry.n,
          agree: telemetry.agree,
          ci_lo,
          last_evaluated: now,
        })
        .eq("swarm_type", telemetry.swarm_type)
        .eq("rule_key", telemetry.rule_key);
    }
  } else {
    // SHADOW MODE (D-19) -- never mutate classifier_rules. Just record what
    // we would have done so operators can audit before flipping the flag.
    if (promote) action = "shadow_would_promote";
    else if (demote) action = "shadow_would_demote";
    else action = "no_change";
  }

  // Append-only evaluation row. ON CONFLICT(swarm_type, rule_key, evaluated_at::date)
  // DO UPDATE so a same-day re-trigger refreshes rather than duplicates (T-60-03-03).
  await admin.from("classifier_rule_evaluations").upsert(
    {
      swarm_type: telemetry.swarm_type,
      rule_key: telemetry.rule_key,
      n: telemetry.n,
      agree: telemetry.agree,
      ci_lo,
      action,
    },
    { onConflict: "swarm_type,rule_key,evaluated_at" },
  );

  return {
    swarm_type: telemetry.swarm_type,
    rule_key: telemetry.rule_key,
    action,
    ci_lo,
  };
}

export const classifierPromotionCron = inngest.createFunction(
  { id: "classifier/promotion-cron", retries: 2 },
  { cron: "TZ=Europe/Amsterdam 0 6 * * 1-5" },
  async ({ step }) => {
    const mutate = process.env.CLASSIFIER_CRON_MUTATE === "true";
    const admin = createAdminClient();

    const telemetry = await step.run("load-telemetry", async () => {
      const { data, error } = await admin
        .from("classifier_rule_telemetry")
        .select("swarm_type, rule_key, n, agree");
      if (error) throw new Error(`telemetry load failed: ${error.message}`);
      return (data ?? []) as TelemetryRow[];
    });

    const rules = await step.run("load-rules", async () => {
      const { data, error } = await admin
        .from("classifier_rules")
        .select("swarm_type, rule_key, status");
      if (error) throw new Error(`rules load failed: ${error.message}`);
      return (data ?? []) as RuleRow[];
    });

    const ruleByKey = new Map<string, RuleRow>(
      rules.map((r) => [`${r.swarm_type}::${r.rule_key}`, r]),
    );

    const results: EvaluateRuleResult[] = [];

    for (const t of telemetry) {
      // Per-rule replay-safe isolation: each evaluation runs in its own step.run
      // so an Inngest replay only re-executes the failing rule, not the whole batch.
      const stepId = `eval-${t.swarm_type}-${t.rule_key}`;
      const result = await step.run(stepId, async () => {
        const rule = ruleByKey.get(`${t.swarm_type}::${t.rule_key}`);
        return evaluateRule(admin, t, rule, mutate);
      });
      results.push(result);
    }

    return { mutate, evaluated: results.length, results };
  },
);
