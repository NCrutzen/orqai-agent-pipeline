// Phase 56-00 (D-24, D-25, D-26, D-30). Per-mailbox debtor-email-labeling
// flip cron skeleton.
//
// cron: TZ=Europe/Amsterdam 0 6 * * 1-5 -- daily 06:00 Amsterdam, Mon-Fri
// Single-line comment only -- never put cron strings inside JSDoc per
// CLAUDE.md learning eb434cfd (the */N would close the comment).
//
// Reads agent_runs.human_verdict per mailbox (Pitfall 7: filters via
// context->>icontroller_mailbox_id), aggregates over the most recent
// FLIP_N_MIN window, computes Wilson CI lower-bound, writes an audit row
// to classifier_rule_evaluations, and (when LABELING_CRON_MUTATE=true)
// flips debtor.labeling_settings.dry_run per mailbox.
//
// CRITICAL (Pitfall 3): we use wilsonCiLower(n, k) ONLY. The Phase 60
// promote/demote helpers in lib/classifier/wilson use N>=30 — Phase 56
// needs N>=50 per D-24. Inline the gates here; do not import those helpers.
//
// Phase 999.8 Plan 06 — per-predictor Wilson-CI split (D-07/D-09) +
// high-conf LLM FP calibration alarm (D-03). evaluateMailbox now iterates
// over predictor IN ('regex','llm_2nd_pass') with predictor IS NOT NULL
// filter (forward-only). Audit rule_key includes the predictor suffix so
// the two streams are independently visible. On the llm_2nd_pass stream
// we compute the high-conf FP rate and emit
// classifier/calibration_drift.detected at the alarm tier (>=5%).
//
// Registration in the Inngest manifest is deferred to Wave 4 (plan 56-07).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { wilsonCiLower } from "@/lib/classifier/wilson";

const FLIP_N_MIN = 50;          // D-24 (NOT wilson.ts PROMOTE_N_MIN=30)
const FLIP_CI_LO_MIN = 0.95;    // D-24 promotion gate
const DEMOTE_CI_LO_MAX = 0.92;  // D-25 hysteresis demotion gate

// Phase 999.8 D-03 calibration-drift thresholds (planner-locked, RESEARCH §3)
const CALIBRATION_WARN_FP_RATE = 0.02;   // >=2% warn (audit row only)
const CALIBRATION_ALARM_FP_RATE = 0.05;  // >=5% alarm (audit row + event)

// CLAUDE.md learning dae6276 — never destructure inngest.send.
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

const PREDICTORS = ["regex", "llm_2nd_pass"] as const;
type Predictor = (typeof PREDICTORS)[number];

export type FlipAction =
  | "promoted"
  | "demoted"
  | "no_change"
  | "shadow_would_promote"
  | "shadow_would_demote";

export interface PickActionArgs {
  n: number;
  ci_lo: number;
  dry_run: boolean;
  mutate: boolean;
}

/**
 * Pure decision helper. Extracted so unit tests can call it directly without
 * Inngest harness or admin-client stubs.
 *
 * Promotion gate (D-24): dry_run && n >= 50 && ci_lo >= 0.95
 * Demotion gate (D-25):  !dry_run && ci_lo < 0.92
 */
export function pickAction({
  n,
  ci_lo,
  dry_run,
  mutate,
}: PickActionArgs): FlipAction {
  const wouldPromote = dry_run && n >= FLIP_N_MIN && ci_lo >= FLIP_CI_LO_MIN;
  const wouldDemote = !dry_run && ci_lo < DEMOTE_CI_LO_MAX;
  if (mutate) {
    if (wouldPromote) return "promoted";
    if (wouldDemote) return "demoted";
    return "no_change";
  }
  if (wouldPromote) return "shadow_would_promote";
  if (wouldDemote) return "shadow_would_demote";
  return "no_change";
}

export interface MailboxRow {
  source_mailbox: string;
  icontroller_mailbox_id: number;
  nxt_database: string | null;
  dry_run: boolean;
}

export interface EvaluateMailboxResult {
  mailbox: string;
  predictor: Predictor;
  n: number;
  agree: number;
  ci_lo: number;
  action: FlipAction;
}

// Minimal admin-client shape we accept -- Inngest passes the real Supabase
// client at runtime, tests pass a stubbed builder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminLike = any;

interface AgentRunRow {
  human_verdict: string | null;
  predictor?: Predictor | null;
  confidence?: string | number | null;
  corrected_category?: string | null;
}

/**
 * Evaluate ONE (mailbox, predictor) stream. Issues one agent_runs query,
 * computes Wilson-CI, writes an audit row, and on the llm_2nd_pass stream
 * additionally runs the D-03 high-conf FP calibration check.
 */
async function evaluatePredictorStream(
  admin: AdminLike,
  mailbox: MailboxRow,
  predictor: Predictor,
  mutate: boolean,
): Promise<EvaluateMailboxResult> {
  const { data: rows } = await admin
    .from("agent_runs")
    .select("human_verdict, predictor, confidence, corrected_category")
    .eq("swarm_type", "debtor-email")
    .eq("predictor", predictor)
    .not("predictor", "is", null)
    .not("human_verdict", "is", null)
    .filter(
      "context->>icontroller_mailbox_id",
      "eq",
      String(mailbox.icontroller_mailbox_id),
    )
    .order("verdict_set_at", { ascending: false })
    .limit(FLIP_N_MIN);

  const list = (rows ?? []) as AgentRunRow[];
  const n = list.length;
  const agree = list.filter((r) => r.human_verdict === "approve").length;
  const ci_lo = n > 0 ? wilsonCiLower(n, agree) : 0;

  const action = pickAction({ n, ci_lo, dry_run: mailbox.dry_run, mutate });
  const ruleKey = `mailbox_flip:${mailbox.source_mailbox}:${predictor}`;

  await admin.from("classifier_rule_evaluations").insert({
    swarm_type: "debtor-email",
    rule_key: ruleKey,
    n,
    agree,
    ci_lo,
    action,
    // Cold-start observability (RESEARCH Pitfall 7): operators can distinguish
    // sparse-bucket no_change from steady-state no_change.
    reason: n < FLIP_N_MIN ? { cold_start: true } : null,
  });

  if (mutate) {
    if (action === "promoted") {
      await admin
        .schema("debtor")
        .from("labeling_settings")
        .update({ dry_run: false })
        .eq("source_mailbox", mailbox.source_mailbox);
    } else if (action === "demoted") {
      console.warn("[labeling-flip-cron] demote", {
        mailbox: mailbox.source_mailbox,
        predictor,
        n,
        ci_lo,
      });
      await admin
        .schema("debtor")
        .from("labeling_settings")
        .update({ dry_run: true })
        .eq("source_mailbox", mailbox.source_mailbox);
    }
  }

  // Phase 999.8 D-03 — high-conf LLM FP calibration check, only on the
  // llm_2nd_pass stream. Computed in-memory from the already-fetched window
  // (RESEARCH §3 simpler variant). "high" matches the stage-1 LLM confidence
  // band; the verdict-side writer (Plan 05) writes the string label, not a
  // numeric, so we filter on equality.
  if (predictor === "llm_2nd_pass") {
    await runCalibrationDriftCheck(admin, mailbox, list);
  }

  return { mailbox: mailbox.source_mailbox, predictor, n, agree, ci_lo, action };
}

async function runCalibrationDriftCheck(
  admin: AdminLike,
  mailbox: MailboxRow,
  list: AgentRunRow[],
): Promise<void> {
  const highConfRows = list.filter((r) => r.confidence === "high");
  const highConfN = highConfRows.length;
  if (highConfN < FLIP_N_MIN) return; // cold-start, no D-03 output

  const highConfFp = highConfRows.filter(
    (r) =>
      (r.human_verdict ?? "").startsWith("rejected_") ||
      r.corrected_category != null,
  ).length;
  const fpRate = highConfFp / highConfN;
  if (fpRate < CALIBRATION_WARN_FP_RATE) return;

  // fpRate > 0.05 => alarm; otherwise warn. Use strict > on alarm threshold
  // so 5.00% counts as warn (matches Plan 06 spec wording: ">5% → alarm").
  const tier: "warn" | "alarm" = fpRate > CALIBRATION_ALARM_FP_RATE ? "alarm" : "warn";

  await admin.from("classifier_rule_evaluations").insert({
    swarm_type: "debtor-email",
    rule_key: `llm_calibration:${mailbox.source_mailbox}`,
    n: highConfN,
    agree: highConfN - highConfFp,
    ci_lo: 1 - fpRate,
    action: `calibration_${tier}`,
  });

  if (tier === "alarm") {
    // Generated INSIDE the surrounding step.run (parent handler wraps
    // evaluateMailbox in step.run) — Phase 65 replay-id rule preserved.
    const detectedAt = new Date().toISOString();
    await (inngest.send as unknown as SendFn)({
      name: "classifier/calibration_drift.detected",
      data: {
        swarm_type: "debtor-email",
        source_mailbox: mailbox.source_mailbox,
        icontroller_mailbox_id: mailbox.icontroller_mailbox_id,
        n_high_conf: highConfN,
        fp_count: highConfFp,
        fp_rate: fpRate,
        threshold: tier,
        detected_at: detectedAt,
      },
    });
  }
}

/**
 * Evaluate a mailbox across BOTH predictor streams (regex + llm_2nd_pass).
 *
 * Returns the llm_2nd_pass stream result for backwards compatibility with the
 * top-level handler shape (one result per mailbox). The regex stream's
 * audit row + flip action are written as a side effect.
 *
 * Phase 999.8 D-07/D-09 — per-(mailbox, predictor) Wilson-CI bucket with
 * predictor IS NOT NULL forward-only filter.
 */
export async function evaluateMailbox(
  admin: AdminLike,
  mailbox: MailboxRow,
  mutate: boolean,
): Promise<EvaluateMailboxResult> {
  let lastResult: EvaluateMailboxResult | null = null;
  for (const predictor of PREDICTORS) {
    lastResult = await evaluatePredictorStream(admin, mailbox, predictor, mutate);
  }
  // Both predictors always iterate; lastResult is non-null.
  return lastResult as EvaluateMailboxResult;
}

export const labelingFlipCron = inngest.createFunction(
  { id: "labeling/flip-cron", name: "Per-mailbox debtor-email-labeling flip", retries: 2 },
  { cron: "TZ=Europe/Amsterdam 0 6 * * 1-5" },
  async ({ step }) => {
    const mutate = process.env.LABELING_CRON_MUTATE === "true";
    const admin = createAdminClient();
    const { data: settings } = await admin
      .schema("debtor")
      .from("labeling_settings")
      .select("source_mailbox, icontroller_mailbox_id, nxt_database, dry_run");
    if (!settings || settings.length === 0) return { skipped: "no_settings" };

    const out: EvaluateMailboxResult[] = [];
    for (const m of settings as MailboxRow[]) {
      const result = await step.run(`eval-${m.source_mailbox}`, async () =>
        evaluateMailbox(admin, m, mutate),
      );
      out.push(result);
    }
    return { mutate, results: out };
  },
);
