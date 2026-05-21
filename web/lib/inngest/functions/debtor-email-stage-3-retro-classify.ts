// Phase 87 Plan 04 — debtor-email Stage 3 retro-classify.
//
// One-shot Inngest function. Re-runs the V3 Stage 3 agent against the last
// N days of persisted historical mail, produces per-email retro verdicts in
// stage_3_retro_runs, and emits one intent_volume_baselines snapshot for
// V8.2 / V9.0 / V11.0 to read.
//
// Architectural locks (all enforced by Wave 0 guard tests):
//
//   1. **Side-Channel Isolation** (NEW for this phase). This file MUST NOT
//      touch live-pipeline state. The full forbidden-token list lives in
//      retro-classify-side-channel-isolation.test.ts (it source-greps this
//      file). Allowed writes: stage_3_retro_runs + intent_volume_baselines
//      ONLY.
//
//   2. **Cache bypass** (Pitfall 3). The retro path calls invokeIntentAgent
//      directly. No imports from the live coordinator wrapper file.
//
//   3. **R-04 precondition gate**. Refuse to run if the cluster surface is
//      empty (< 5 rows) or stale (max refreshed_at older than 7 days).
//
//   4. **Replay-safe run_id** (CLAUDE.md Phase 65). run_id is generated
//      INSIDE step.run("resolve-run-id", ...) so replays reuse the same id.
//
//   5. **Step-memo discipline** (Pitfall 4). Each per-email step.run returns
//      ONLY the token count. The full agent output is persisted to Supabase
//      inside the step.
//
//   6. **inngest.send binding** (CLAUDE.md Phase 65). Never destructured.
//      This file does not call inngest.send anywhere (no downstream events).

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  selectCandidates,
  STAGE_3_RETRO_HARD_CAP,
} from "@/lib/automations/debtor-email/retro/select-candidates";
import { reconstructInput } from "@/lib/automations/debtor-email/retro/reconstruct-input";
import { aggregateBaseline } from "@/lib/automations/debtor-email/retro/aggregate-baseline";
import { invokeIntentAgent } from "@/lib/automations/debtor-email/coordinator/invoke-intent";

const PRECONDITION_MIN_CLUSTERS = 5;
const PRECONDITION_FRESH_DAYS = 7;
const PRECONDITION_FRESH_MS = PRECONDITION_FRESH_DAYS * 86_400_000;

void STAGE_3_RETRO_HARD_CAP;

export const debtorEmailStage3RetroClassify = inngest.createFunction(
  {
    id: "debtor-email-stage-3-retro-classify",
    name: "Phase 87 — debtor-email Stage 3 retro-classify",
    retries: 3,
    concurrency: { limit: 1 },
  },
  { event: "debtor-email/retro-classify.requested" },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const swarm_type = event.data.swarm_type;

    // 1. R-04 precondition gate. Refuse to run if the cluster surface is
    //    empty or stale. Fail-loud so the operator narrows the window or
    //    waits for Phase 86 to accumulate signal.
    await step.run("precondition-gate", async () => {
      const { data, error } = (await admin
        .from("intent_proposal_clusters")
        .select("refreshed_at")
        .eq("swarm_type", swarm_type)) as {
        data: Array<{ refreshed_at: string | null }> | null;
        error: unknown;
      };
      if (error) throw error as Error;
      const rows = data ?? [];
      if (rows.length < PRECONDITION_MIN_CLUSTERS) {
        throw new Error(
          `Phase 87 precondition gate failed: cluster surface has ${rows.length} rows, need ≥${PRECONDITION_MIN_CLUSTERS}. ` +
            `Wait for Phase 86's observation window to accumulate signal.`,
        );
      }
      let maxRefreshedAt = 0;
      for (const r of rows) {
        if (!r.refreshed_at) continue;
        const t = Date.parse(r.refreshed_at);
        if (Number.isFinite(t) && t > maxRefreshedAt) maxRefreshedAt = t;
      }
      const ageMs = Date.now() - maxRefreshedAt;
      if (maxRefreshedAt === 0 || ageMs > PRECONDITION_FRESH_MS) {
        const ageDays = maxRefreshedAt === 0 ? "∞" : (ageMs / 86_400_000).toFixed(1);
        throw new Error(
          `Phase 87 precondition gate failed: max(refreshed_at) is ${ageDays} days stale, need ≥${PRECONDITION_FRESH_DAYS} days fresh. ` +
            `Run the nightly cluster refresh first.`,
        );
      }
      return { clusters: rows.length, max_age_days: ageMs / 86_400_000 };
    });

    // 2. Replay-safe run_id (CLAUDE.md Phase 65). Must be INSIDE step.run.
    const run_id = await step.run("resolve-run-id", async () =>
      event.data.run_id ?? crypto.randomUUID(),
    );

    // 3. Candidate selection. Helper enforces D-03 5000 hard cap.
    const candidates = await step.run("select-candidates", async () =>
      selectCandidates(admin, {
        swarm_type,
        since: event.data.since,
        until: event.data.until,
        cap: event.data.sample_limit,
      }),
    );

    // 4. Per-email loop. Pitfall 4: each step.run returns ONLY token count.
    //    Full agent output is persisted to stage_3_retro_runs inside the step.
    let total_tokens = 0;
    for (const c of candidates) {
      const tokens: number = await step.run(`classify-${c.email_id}`, async () => {
        const input = await reconstructInput(admin, c.email_id, run_id);
        const { output, usage } = await invokeIntentAgent(input);
        const ranked = output.ranked;
        const top = ranked[0];

        const isV3 = output.intent_version === "2026-05-19.v3";
        const intent_proposal_value =
          isV3 ? (output as { intent_proposal?: string | null }).intent_proposal ?? null : null;
        const proposal_reason_value =
          isV3 ? (output as { proposal_reason?: string | null }).proposal_reason ?? null : null;

        // Idempotent insert. (run_id, email_id) UNIQUE in DDL — on Inngest
        // replay we hit onConflict and skip, never throw 23505.
        const { error: insErr } = (await admin
          .from("stage_3_retro_runs")
          .upsert(
            {
              run_id,
              email_id: c.email_id,
              swarm_type,
              original_top_intent: c.original_top_intent,
              original_confidence: c.original_confidence,
              new_top_intent: top.intent,
              new_confidence: top.confidence,
              intent_proposal: intent_proposal_value,
              proposal_reason: proposal_reason_value,
              ranked_intents: ranked,
              token_usage_total: usage?.total_tokens ?? 0,
            },
            { onConflict: "run_id,email_id", ignoreDuplicates: true },
          )) as { error: unknown };
        if (insErr) throw insErr as Error;
        return usage?.total_tokens ?? 0;
      });
      total_tokens += tokens;
    }

    // 5. End-of-run baseline aggregation.
    const baseline_rows = await step.run("aggregate-baseline", async () =>
      aggregateBaseline(admin, {
        run_id,
        window_start: event.data.since,
        window_end: event.data.until,
        swarm_type,
      }),
    );

    return {
      run_id,
      processed: candidates.length,
      total_tokens,
      baseline_rows,
    };
  },
);
