// Phase 111 Plan 03 (D-01) — sales-email Stage-1 retro-classify.
//
// One-shot Inngest function. Re-runs the Stage-1 noise classifier against BOTH
// Smeba corpora (live verkoop@smeba.nl Outlook + historic source='sugarcrm')
// and writes per-email retro verdicts to stage_1_retro_runs, then aggregates
// per-category hit-rate + false-archive estimates (the D-01 calibration
// evidence Plan 04 consumes — informs D-07 seeding + the D-09 loopback decision).
//
// Sales has NO regex Pass 1 (stage1_regex_module=null), so this mirrors the
// LIVE Stage-1 path: the `stage-1-category-classifier` LLM Pass 2 only, with
// the closed-list <categories> built from the enabled swarm_noise_categories
// rows (exactly as classifier-screen-worker does).
//
// Architectural locks (mirrored from Phase 87 debtor-email-stage-3-retro-classify):
//
//   1. **Side-Channel Isolation** (Anti-Pattern A5 / Phase 87 #1 lock). This
//      file MUST NOT touch live-pipeline state. Allowed writes:
//      stage_1_retro_runs ONLY — never automation_runs, live agent_runs, or
//      pipeline_events. Enforced by a source-grep guard test (T-111-08).
//
//   2. **Replay-safe run_id** (CLAUDE.md Phase 65 / T-111-09). run_id is
//      generated INSIDE step.run("resolve-run-id", ...) so replays reuse the
//      same id and the (run_id,email_id) upsert is a no-op.
//
//   3. **Step-memo discipline** (Phase 87 Pitfall 4). Each per-email step.run
//      returns ONLY the token count. The full verdict is persisted to Supabase
//      inside the step.
//
//   4. **inngest.send binding** (CLAUDE.md commit dae6276). Never destructured.
//      This file emits NO downstream events (no inngest.send call anywhere).

import { z } from "zod";
import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarmNoiseCategories } from "@/lib/swarms/registry";
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import {
  selectCandidates,
  STAGE_1_RETRO_HARD_CAP,
} from "@/lib/automations/sales-email/retro/select-candidates";
import { aggregateBaseline } from "@/lib/automations/sales-email/retro/aggregate-baseline";

void STAGE_1_RETRO_HARD_CAP;

// Mirrors classifier-screen-worker's Stage1OutputSchema (z.string() category —
// the agent's category_key is NOT an enum; the closed list is passed at
// call-time, so the runtime invariant is two-place — RESEARCH Finding 3).
const Stage1OutputSchema = z.object({
  category_key: z.string(),
  confidence: z.enum(["low", "medium", "high"]),
  reasoning: z.string().nullable(),
});

export const salesEmailStage1RetroClassify = inngest.createFunction(
  {
    id: "sales-email-stage-1-retro-classify",
    name: "Phase 111 — sales-email Stage 1 retro-classify",
    retries: 3,
    concurrency: { limit: 1 },
  },
  { event: "sales-email/stage-1-retro-classify.requested" },
  async ({ event, step }) => {
    const admin = createAdminClient();
    const swarm_type = event.data.swarm_type;

    // 1. Replay-safe run_id (CLAUDE.md Phase 65). Must be INSIDE step.run.
    const run_id = await step.run("resolve-run-id", async () =>
      event.data.run_id ?? crypto.randomUUID(),
    );

    // 2. Closed-list noise categories (enabled) + per-category action map.
    //    The <categories> input mirrors classifier-screen-worker's call shape;
    //    `action` lets us derive would_archive (categorize_archive) per verdict.
    const categories = await loadSwarmNoiseCategories(admin, swarm_type);
    const enabledCategories = categories.filter((c) => c.enabled !== false);
    const actionByKey = new Map(
      enabledCategories.map((c) => [c.category_key, c.action]),
    );

    // Phase 111 WR-03: deterministic would_archive reference.
    // would_archive feeds the D-09 false-archive calibration signal that the
    // calibration FLIP (auto_reply/ooo_* → categorize_archive) is supposed to
    // INFORM. Reading it from the LIVE action map makes the evidence depend on
    // whether this harness ran before or after the flip migration — the signal
    // can silently invert across apply order, breaking reproducibility.
    //
    // Fix (no migration): if the caller passes an explicit archive_reference_keys
    // set, would_archive is computed against that FIXED disposition regardless
    // of the live action map. Otherwise we fall back to the live map but record
    // which snapshot semantics were in effect in the run output (below), so the
    // baseline stays interpretable even without an explicit reference.
    const referenceKeys = event.data.archive_reference_keys;
    const archiveReferenceSet =
      referenceKeys && referenceKeys.length > 0
        ? new Set(referenceKeys)
        : null;
    const archiveSnapshot: "fixed_reference" | "live_action_map" =
      archiveReferenceSet ? "fixed_reference" : "live_action_map";
    const wouldArchive = (predicted_category_key: string): boolean =>
      archiveReferenceSet
        ? archiveReferenceSet.has(predicted_category_key)
        : actionByKey.get(predicted_category_key) === "categorize_archive";
    const categoriesInput = enabledCategories.map((c) => ({
      category_key: c.category_key,
      display_label: c.display_label,
    }));

    // 3. Candidate selection across both corpora (helper enforces the hard cap).
    const candidates = await step.run("select-candidates", async () =>
      selectCandidates(admin, {
        swarm_type,
        since: event.data.since,
        until: event.data.until,
        cap: event.data.sample_limit,
      }),
    );

    // 4. Per-email loop. Each step.run returns ONLY the token count; the full
    //    verdict is persisted to stage_1_retro_runs inside the step.
    let total_tokens = 0;
    for (const c of candidates) {
      const tokens: number = await step.run(`classify-${c.email_id}`, async () => {
        // Phase 111 WR-04: per-email error isolation. A single malformed LLM
        // verdict (invokeOrqAgent throw, or Stage1OutputSchema.parse failure)
        // must NOT abort a 40k-candidate run and burn tokens on retries.
        // Mirror the live screen-worker D-11 coercion: record an 'unknown'
        // sentinel row carrying the error and continue. Only a DB write
        // failure throws (genuinely retryable / fatal).
        let predicted_category_key: string;
        let confidence: "low" | "medium" | "high";
        let model_key: string | null;
        let total: number;

        try {
          const result = await invokeOrqAgent("stage-1-category-classifier", {
            subject: c.subject ?? "",
            body_text: c.body ?? "",
            categories: categoriesInput,
          });
          const parsed = Stage1OutputSchema.parse(result.raw);
          predicted_category_key = parsed.category_key;
          confidence = parsed.confidence;
          model_key = result.agent?.agent_key ?? null;
          total = result.usage?.total_tokens ?? 0;
        } catch (err) {
          // D-11-style coercion: 'unknown' / 'low' sentinel, error recorded.
          // NOTE: stage_1_retro_runs has no error column (no migration in this
          // phase per WR-03 constraint), so the failure is captured by the
          // 'unknown'/'low' sentinel row + a console error for the Inngest run
          // log. The sentinel keeps the candidate counted (processed total
          // stays accurate) without aborting the batch.
          const classify_error =
            err instanceof Error ? err.message : String(err);
          console.error(
            `[sales-email-stage-1-retro-classify] classify failed for email ${c.email_id} (run ${run_id}); coercing to unknown/low:`,
            classify_error,
          );
          predicted_category_key = "unknown";
          confidence = "low";
          model_key = "stage-1-category-classifier";
          total = 0;
        }

        const is_noise = predicted_category_key !== "unknown";
        // would_archive: computed against the deterministic reference resolved
        // above (fixed archive_reference_keys when provided, else the live
        // action map). Phase 111 WR-03.
        const would_archive = wouldArchive(predicted_category_key);
        // false_archive_suspect: a normalized-INBOUND mail (a real lead-shaped
        // incoming message) that a would-archive noise verdict would have
        // archived — the D-09 loopback false-archive signal.
        const false_archive_suspect =
          would_archive && c.normalized_direction === "inbound";

        const { error: insErr } = (await admin
          .from("stage_1_retro_runs")
          .upsert(
            {
              run_id,
              email_id: c.email_id,
              swarm_type,
              source: c.source,
              normalized_direction: c.normalized_direction,
              predicted_category_key,
              confidence,
              is_noise,
              would_archive,
              false_archive_suspect,
              model_key,
              token_usage_total: total,
            },
            { onConflict: "run_id,email_id", ignoreDuplicates: true },
          )) as { error: unknown };
        if (insErr) throw insErr as Error;
        return total;
      });
      total_tokens += tokens;
    }

    // 5. End-of-run per-category baseline (hit-rate + false-archive estimate).
    const baseline = await step.run("aggregate-baseline", async () =>
      aggregateBaseline(admin, { run_id, swarm_type }),
    );

    return {
      run_id,
      processed: candidates.length,
      total_tokens,
      baseline,
      // Phase 111 WR-03: record which would_archive semantics produced this
      // baseline so the D-09 loopback enable/disable recommendation is
      // reproducible and interpretable regardless of the flip apply order.
      archive_snapshot: archiveSnapshot,
      archive_reference_keys: archiveReferenceSet
        ? [...archiveReferenceSet].sort()
        : null,
    };
  },
);
