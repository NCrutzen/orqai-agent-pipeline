// Phase 82.2 Plan 09 — D-03 / D-04 / D-05.
//
// One-shot Inngest backfill that closes the 30-day historical gap in
// `public.pipeline_events.stage=0`. For every email_id discovered by
// `public.stage0_backfill_candidates(window_days)` (Plan 03 RPC) it writes
// exactly one Stage 0 row reconstructed from `automation_runs.result` where
// available, or marked `decision='unknown_legacy'` (honest marker) otherwise.
//
// Triggered manually:
//   inngest.send({ name: 'pipeline.stage0.backfill', data: { window_days?: 30 } })
//
// Source priority per CONTEXT D-04 / RESEARCH §Row construction logic:
//   automation_runs.result.verdict='safe'              → decision='safe'
//   automation_runs.result.verdict='injection_suspected' → decision='injection_suspected'
//   automation_runs.result.stage='stage_0_safety_pending' → decision='unknown_legacy' (pending_orphan)
//   no automation_runs row                              → decision='unknown_legacy' (no_source_record)
//
// We do NOT re-run the safety verdict logic (D-04 rationale: risks divergence
// if rules changed since the original run, plus avoidable LLM cost).
//
// Why bypass `emitPipelineEvent` (RESEARCH Risk #4):
//   the helper at `web/lib/pipeline-events/emit.ts` does not accept a
//   `created_at` override; backfill writes the historical timestamp
//   explicitly. We INSERT directly via `admin.from('pipeline_events').insert(...)`
//   and signal non-live-path provenance via `triggered_by='backfill'` and
//   `decision_details.source='backfill'`.
//
// Replay-safety (CLAUDE.md Phase 65 learning — commit dd2583a):
//   `runId = crypto.randomUUID()` MUST be resolved inside `step.run` so a
//   replayed batch reuses the same id rather than minting a fresh one and
//   tagging the same row with two different `backfill_run_id` values.
//
// Idempotency (Plan 01 partial UNIQUE index + defense-in-depth):
//   the DB has `pipeline_events_one_per_stage_email (email_id, swarm_type, stage)
//   WHERE email_id IS NOT NULL`. Defense: per-batch SELECT to skip rows that
//   already exist, so re-runs do not surface unique-violation errors.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

const BATCH_SIZE = 500;
const MAX_WINDOW_DAYS = 30; // D-05 cap (Plan 03 RPC also clamps server-side)

type Candidate = {
  email_id: string;
  swarm_type: string;
  completed_at: string | null;
  result: {
    verdict?: string;
    id?: string;
    stage?: string;
    regex_matched?: unknown;
    llm_reason?: unknown;
    matched_span?: unknown;
    cost_cents?: number;
  } | null;
};

type BackfillRow = {
  swarm_type: string;
  stage: 0;
  email_id: string;
  decision: "safe" | "injection_suspected" | "unknown_legacy";
  confidence: number | null;
  decision_details: Record<string, unknown>;
  cost_cents: number | null;
  created_at: string;
  triggered_by: "backfill";
};

export const stage0Backfill = inngest.createFunction(
  { id: "stage-0/backfill", retries: 1 },
  { event: "pipeline.stage0.backfill" },
  async ({ event, step }) => {
    // Client-side clamp (defense; RPC also clamps to 30). Reject < 1 → 30.
    const rawWindow =
      (event?.data as { window_days?: number } | undefined)?.window_days ?? 30;
    const windowDays = Math.min(
      MAX_WINDOW_DAYS,
      Math.max(1, Number.isFinite(rawWindow) ? rawWindow : 30),
    );

    // Phase 65 replay-id rule — runId MUST be minted inside step.run so a
    // replayed batch sees the same value.
    const runId = await step.run("resolve-run-id", async () =>
      crypto.randomUUID(),
    );

    // Discover all gap candidates in one RPC call. Plan 02 measured ~266 for
    // 30d on prod; comfortably fits in one round trip.
    const candidates = await step.run("find-gaps", async () => {
      const admin = createAdminClient();
      const { data, error } = await admin.rpc("stage0_backfill_candidates", {
        window_days: windowDays,
      });
      if (error) {
        throw new Error(`stage0_backfill_candidates failed: ${error.message}`);
      }
      return (data ?? []) as Candidate[];
    });

    let written = 0;
    let skipped = 0;

    for (let i = 0; i < candidates.length; i += BATCH_SIZE) {
      const batchIdx = Math.floor(i / BATCH_SIZE);
      const batch = candidates.slice(i, i + BATCH_SIZE);

      const batchResult = await step.run(
        `backfill-batch-${batchIdx}`,
        async () => {
          const admin = createAdminClient();

          // Pre-insert dedupe SELECT — defense-in-depth against the race
          // between gap query and insert, and against re-runs.
          const emailIds = batch.map((b) => b.email_id);
          const { data: existing, error: selErr } = await admin
            .from("pipeline_events")
            .select("email_id, swarm_type")
            .in("email_id", emailIds)
            .eq("stage", 0);
          if (selErr) {
            throw new Error(`pipeline_events dedupe SELECT failed: ${selErr.message}`);
          }
          const existingKeys = new Set(
            (existing ?? []).map(
              (r: { email_id: string; swarm_type: string }) =>
                `${r.email_id}|${r.swarm_type}`,
            ),
          );

          const rows = batch.map((c) => buildBackfillRow(c, runId));
          const toInsert = rows.filter(
            (r) => !existingKeys.has(`${r.email_id}|${r.swarm_type}`),
          );

          if (toInsert.length === 0) {
            return { inserted: 0, skipped: rows.length };
          }

          const { error: insErr } = await admin
            .from("pipeline_events")
            .insert(toInsert);
          if (insErr) {
            throw new Error(`pipeline_events backfill insert failed: ${insErr.message}`);
          }
          return {
            inserted: toInsert.length,
            skipped: rows.length - toInsert.length,
          };
        },
      );

      written += batchResult.inserted;
      skipped += batchResult.skipped;
    }

    return {
      run_id: runId,
      candidates_count: candidates.length,
      written,
      skipped,
    };
  },
);

// Row-construction per RESEARCH §Row construction logic table. Kept as a
// free function so it is trivially unit-testable from the test file.
export function buildBackfillRow(c: Candidate, runId: string): BackfillRow {
  const verdict = c.result?.verdict;
  if (verdict === "safe" || verdict === "injection_suspected") {
    return {
      swarm_type: c.swarm_type,
      stage: 0,
      email_id: c.email_id,
      decision: verdict,
      confidence: null,
      decision_details: {
        source: "backfill",
        backfill_run_id: runId,
        original_automation_run_id: c.result?.id ?? null,
        regex_matched: c.result?.regex_matched ?? null,
        llm_reason: c.result?.llm_reason ?? null,
        matched_span: c.result?.matched_span ?? null,
      },
      cost_cents: c.result?.cost_cents ?? null,
      // c.completed_at is non-null for completed runs; explicit historical ts
      // (Plan 03 RPC returns ar.completed_at). Defensive fallback to now() iso.
      created_at: c.completed_at ?? new Date().toISOString(),
      triggered_by: "backfill",
    };
  }

  // unknown_legacy branch — pending orphan vs no source record
  const pendingOrphan = c.result?.stage === "stage_0_safety_pending";
  return {
    swarm_type: c.swarm_type,
    stage: 0,
    email_id: c.email_id,
    decision: "unknown_legacy",
    confidence: null,
    decision_details: {
      source: "backfill",
      backfill_run_id: runId,
      original_automation_run_id: c.result?.id ?? null,
      reason: pendingOrphan ? "pending_orphan" : "no_source_record",
    },
    cost_cents: null,
    created_at: c.completed_at ?? new Date().toISOString(),
    triggered_by: "backfill",
  };
}
