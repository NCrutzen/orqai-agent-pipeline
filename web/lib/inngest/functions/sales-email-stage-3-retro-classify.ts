// Phase 113 Plan 03 (D-01, STAGE3-02) — sales-email Stage 3 retro-classify.
//
// One-shot Inngest function. Re-runs the sales intent agent
// (invokeSalesIntentAgent — cache bypass) against the post-Stage-1 sales
// corpus and writes per-email retro verdicts to stage_3_retro_runs. This is
// the offline vocabulary-discovery machinery: the retro pass feeds the
// existing intent_proposals / intent_proposal_clusters surface the operator
// promotes a data-driven sales vocabulary from (STAGE3-02 — vocabulary emerges
// from data + operator promotion, never hand-curated).
//
// Mirrors the debtor Phase 87 analog (debtor-email-stage-3-retro-classify.ts)
// with the 6 architectural locks, PLUS one deliberate divergence: a BOUNDED
// bootstrap bypass of the R-04 cluster precondition gate (documented below).
//
// Architectural locks (all enforced by the guard tests):
//
//   1. **Side-Channel Isolation**. This file MUST NOT touch live-pipeline
//      state. Allowed write: stage_3_retro_runs ONLY — never automation_runs,
//      live agent_runs, pipeline_events, or coordinator_runs. Enforced by the
//      source-grep guard test (sales-stage-3-retro-side-channel-isolation).
//
//   2. **Cache bypass** (Pitfall 3). The retro path calls invokeSalesIntentAgent
//      DIRECTLY (not the live coordinator). No live-coordinator imports.
//
//   3. **R-04 precondition gate — WITH A BOUNDED BOOTSTRAP BYPASS** (see #7).
//
//   4. **Replay-safe run_id** (CLAUDE.md Phase 65). run_id is generated INSIDE
//      step.run("resolve-run-id", ...) so replays reuse the same id.
//
//   5. **Step-memo discipline** (Pitfall 4). Each per-email step.run returns
//      ONLY the token count. The full verdict is persisted to Supabase inside
//      the step.
//
//   6. **inngest.send binding** (CLAUDE.md commit dae6276). Never destructured.
//      This file emits NO downstream events (no inngest.send call anywhere).
//
//   7. **DIVERGENCE-FROM-DEBTOR — bounded bootstrap bypass.** The debtor retro
//      refuses to run until the cluster surface has ≥5 fresh rows. Sales is
//      GREENFIELD: the cluster surface starts EMPTY, so that gate is an
//      empty-cluster chicken-and-egg — the first discovery pass is exactly what
//      POPULATES the surface. Resolution: event.data.bootstrap. The bypass is
//      SAFE because it is bounded to the empty-vocabulary first pass:
//        - bootstrap=true  AND swarm_intents(sales) count === 0 → SKIP the
//          cluster gate, run as runType='bootstrap' (the legitimate first pass).
//        - bootstrap=true  AND swarm_intents(sales) count  >  0 → THROW. The
//          vocabulary is already seeded; a bootstrap re-run must NOT silently
//          bypass the quality gate after seeding (T-113-11).
//        - bootstrap falsy → apply the normal cluster precondition gate
//          (blocks on the first run while clusters < 5; correct once seeded),
//          runType='normal'.
//      Bootstrap rows are tagged run_type='bootstrap' inside the ranked_intents
//      JSONB envelope ({ ranked: [...], _meta: { run_type } }) so operators can
//      filter bootstrap-quality results when promoting; normal-gate rows carry
//      run_type='normal'.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  selectCandidates,
  STAGE_1_RETRO_HARD_CAP,
} from "@/lib/automations/sales-email/retro/select-candidates";
import { reconstructInput } from "@/lib/automations/sales-email/retro/reconstruct-input";
import { invokeSalesIntentAgent } from "@/lib/automations/sales-email/coordinator/invoke-intent";

const PRECONDITION_MIN_CLUSTERS = 5;
const PRECONDITION_FRESH_DAYS = 7;
const PRECONDITION_FRESH_MS = PRECONDITION_FRESH_DAYS * 86_400_000;

// The selector enforces the 40k fail-loud hard cap; re-exported reference for
// symmetry with the debtor analog (kept referenced to avoid an unused import).
void STAGE_1_RETRO_HARD_CAP;

type RunType = "bootstrap" | "normal";

export const salesEmailStage3RetroClassify = inngest.createFunction(
  {
    id: "sales-email-stage-3-retro-classify",
    name: "Phase 113 — sales-email Stage 3 retro-classify",
    retries: 3,
    concurrency: { limit: 1 },
  },
  { event: "sales-email/retro-classify.requested" },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const swarm_type = event.data.swarm_type;
    const bootstrap = event.data.bootstrap === true;

    // 1. R-04 precondition gate WITH the bounded bootstrap bypass (lock #7).
    //    Resolves the runType used to tag the rows written this run.
    const runType: RunType = (await step.run(
      "bootstrap-precondition",
      async () => {
        // The bound the bootstrap bypass depends on: sales swarm_intents MUST
        // be empty for a bootstrap pass to be legitimate.
        const { count: intentCount, error: intentErr } = (await admin
          .from("swarm_intents")
          .select("*", { count: "exact", head: true })
          .eq("swarm_type", swarm_type)) as {
          count: number | null;
          error: unknown;
        };
        if (intentErr) throw intentErr as Error;
        const seededCount = intentCount ?? 0;

        if (bootstrap) {
          if (seededCount > 0) {
            // T-113-11: a bootstrap re-run after the vocabulary is materialized
            // must NOT bypass the quality gate. Fail loud.
            throw new Error(
              `bootstrap retro refused: sales swarm_intents already seeded ` +
                `(count=${seededCount}) — bootstrap is only for the ` +
                `empty-vocabulary first pass; run a normal (non-bootstrap) ` +
                `retro instead`,
            );
          }
          // Legitimate first-discovery bootstrap: SKIP the cluster gate (the
          // surface it would check is empty by definition — this run populates
          // it). Tag rows as bootstrap-quality.
          return "bootstrap";
        }

        // Normal gate: refuse to run if the cluster surface is empty (< 5 rows)
        // or stale (max refreshed_at older than 7 days). Fail-loud so the
        // operator narrows the window or waits for the discovery surface to
        // accumulate signal.
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
            `Phase 113 precondition gate failed: cluster surface has ` +
              `${rows.length} rows, need ≥${PRECONDITION_MIN_CLUSTERS}. ` +
              `For the FIRST sales discovery pass, run with bootstrap:true ` +
              `(honored only while swarm_intents is empty).`,
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
          const ageDays =
            maxRefreshedAt === 0 ? "∞" : (ageMs / 86_400_000).toFixed(1);
          throw new Error(
            `Phase 113 precondition gate failed: max(refreshed_at) is ` +
              `${ageDays} days stale, need ≥${PRECONDITION_FRESH_DAYS} days ` +
              `fresh. Run the cluster refresh first.`,
          );
        }
        return "normal";
      },
    )) as RunType;

    // 2. Replay-safe run_id (CLAUDE.md Phase 65). Must be INSIDE step.run.
    const run_id = await step.run("resolve-run-id", async () =>
      event.data.run_id ?? crypto.randomUUID(),
    );

    // 3. Candidate selection. The selector enforces the 40k fail-loud hard cap
    //    and the single-tenant SugarCRM invariant. Window is operator-scoped
    //    (since/until passed explicitly) — Open Q #3: we do NOT default to a
    //    full SugarCRM sweep (~$170 Haiku); the operator scopes a recent
    //    Outlook window. sample_limit caps the candidate count.
    const candidates = await step.run("select-candidates", async () =>
      selectCandidates(admin, {
        swarm_type,
        since: event.data.since,
        until: event.data.until,
        cap: event.data.sample_limit,
      }),
    );

    // 4. Per-email loop. Pitfall 4: each step.run returns ONLY the token count.
    //    Full agent output is persisted to stage_3_retro_runs inside the step.
    let total_tokens = 0;
    for (const c of candidates) {
      const tokens: number = await step.run(
        `classify-${c.email_id}`,
        async () => {
          const input = await reconstructInput(admin, c.email_id, run_id);
          // Direct sales invoke (cache bypass — NOT the live coordinator).
          const { output, usage } = await invokeSalesIntentAgent(input);
          const ranked = output.ranked;
          const top = ranked[0];

          // Bootstrap row tagging: stamp run_type in the ranked_intents JSONB
          // envelope so operators can filter bootstrap-quality rows when
          // promoting. We wrap the ranked array in an object carrying a sibling
          // `_meta.run_type` key (the table column is bare jsonb — no
          // migration). The downstream intent_proposals / proposal-cluster
          // refresh reads intent_proposal/proposal_reason columns, which are
          // unaffected by this envelope.
          const ranked_intents = {
            ranked,
            _meta: { run_type: runType },
          };

          // Idempotent insert. (run_id, email_id) UNIQUE in DDL — on Inngest
          // replay we hit onConflict and skip, never throw 23505.
          const { error: insErr } = (await admin
            .from("stage_3_retro_runs")
            .upsert(
              {
                run_id,
                email_id: c.email_id,
                swarm_type,
                // sales retro has no original Stage-3 verdict (greenfield —
                // the live sales Stage 3 has never run); leave originals null.
                original_top_intent: null,
                original_confidence: null,
                new_top_intent: top.intent,
                new_confidence: top.confidence,
                intent_proposal: output.intent_proposal ?? null,
                proposal_reason: output.proposal_reason ?? null,
                ranked_intents,
                token_usage_total: usage?.total_tokens ?? 0,
              },
              { onConflict: "run_id,email_id", ignoreDuplicates: true },
            )) as { error: unknown };
          if (insErr) throw insErr as Error;
          return usage?.total_tokens ?? 0;
        },
      );
      total_tokens += tokens;
    }

    // 5. No baseline aggregation. The sales aggregate-baseline helper is
    //    Stage-1-shaped (reads stage_1_retro_runs); a Stage-3 sales baseline is
    //    optional for V1 discovery and is intentionally omitted here to keep
    //    side-channel isolation tight (stage_3_retro_runs is the only write).

    return {
      run_id,
      run_type: runType,
      processed: candidates.length,
      total_tokens,
    };
  },
);
