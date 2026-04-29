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
// Registration in the Inngest manifest is deferred to Wave 4 (plan 56-07).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { wilsonCiLower } from "@/lib/classifier/wilson";

const FLIP_N_MIN = 50;          // D-24 (NOT wilson.ts PROMOTE_N_MIN=30)
const FLIP_CI_LO_MIN = 0.95;    // D-24 promotion gate
const DEMOTE_CI_LO_MAX = 0.92;  // D-25 hysteresis demotion gate

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
  n: number;
  agree: number;
  ci_lo: number;
  action: FlipAction;
}

// Minimal admin-client shape we accept -- Inngest passes the real Supabase
// client at runtime, tests pass a stubbed builder.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AdminLike = any;

export async function evaluateMailbox(
  admin: AdminLike,
  mailbox: MailboxRow,
  mutate: boolean,
): Promise<EvaluateMailboxResult> {
  // Pitfall 7: per-mailbox group-by uses jsonb path, since agent_runs
  // does not (yet) have a typed icontroller_mailbox_id column.
  const { data: rows } = await admin
    .from("agent_runs")
    .select("human_verdict")
    .eq("swarm_type", "debtor-email-labeling")
    .not("human_verdict", "is", null)
    .filter(
      "context->>icontroller_mailbox_id",
      "eq",
      String(mailbox.icontroller_mailbox_id),
    )
    .order("verdict_set_at", { ascending: false })
    .limit(FLIP_N_MIN);

  const list = (rows ?? []) as Array<{ human_verdict: string | null }>;
  const n = list.length;
  const agree = list.filter((r) => r.human_verdict === "approve").length;
  const ci_lo = n > 0 ? wilsonCiLower(n, agree) : 0;

  const action = pickAction({ n, ci_lo, dry_run: mailbox.dry_run, mutate });
  const ruleKey = `mailbox_flip:${mailbox.source_mailbox}`;

  await admin.from("classifier_rule_evaluations").insert({
    swarm_type: "debtor-email-labeling",
    rule_key: ruleKey,
    n,
    agree,
    ci_lo,
    action,
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

  return { mailbox: mailbox.source_mailbox, n, agree, ci_lo, action };
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
