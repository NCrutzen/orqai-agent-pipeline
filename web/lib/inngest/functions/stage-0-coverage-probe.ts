// Phase 82.2 Plan 10 — D-07 / D-08.
//
// Daily Inngest cron probe. Measures trailing-24h Stage 0 coverage of
// Stage 1 emails per active mailbox and writes one row per (probe_run,
// mailbox) to `public.pipeline_health`. Rows with stage1_count > 0 and
// coverage < 99% are surfaced via the table-level `breached` generated
// column (definition lives in migration 20260513b_pipeline_health.sql).
//
// Cadence: every weekday at 09:00 Amsterdam time (Mon–Fri).
// The cron string lives in the createFunction config object below. Per
// CLAUDE.md (Inngest section): cron strings containing the */N pattern
// must NEVER appear inside a /** */ JSDoc comment — the */N would close
// the comment block. This file uses single-line // comments only.
//
// Breach surface decision (D-08, planner's discretion per CONTEXT):
// the durable surface is `public.pipeline_health`. `.planning/STATE.md`
// is not in the Vercel serverless bundle, so file-write was rejected.
// `/gsd-progress` (or any operator query) can SELECT from the table
// directly:
//   SELECT * FROM pipeline_health WHERE breached = true ORDER BY recorded_at DESC;
//
// Read-only contract (RESEARCH Risk #5): this probe MUST NOT INSERT to
// pipeline_events. Tests assert this; do not add such a call.
//
// Replay-safety (CLAUDE.md Phase 65): probe_run_id is minted INSIDE
// step.run so a replayed batch reuses the same id and groups its rows
// together.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";

const COVERAGE_FLOOR = 0.99;

// TODO(Phase 82.2 Risk #8 / next swarm onboarding): once a 6th mailbox
// lands, migrate this hardcoded list to a registry query against
// `swarms_labeling_settings` (or successor) so the probe scales without
// code edits. Out of scope this phase; 5 mailboxes verified active on
// 2026-05-12.
const ACTIVE_MAILBOXES: Array<{ mailbox: string; swarm_type: string }> = [
  { mailbox: "verkoop@smeba.nl", swarm_type: "sales-email" },
  { mailbox: "debiteuren@smeba.nl", swarm_type: "debtor-email" },
  { mailbox: "debiteuren@berki.nl", swarm_type: "debtor-email" },
  { mailbox: "debiteuren@smeba-fire.be", swarm_type: "debtor-email" },
  { mailbox: "administratie@fire-control.nl", swarm_type: "debtor-email" },
];

type CoverageRpcRow = { stage1_count: number; stage0_count: number };

type PipelineHealthRow = {
  probe_run_id: string;
  mailbox: string;
  swarm_type: string;
  stage1_count: number;
  stage0_count: number;
  // NOTE: coverage_pct and breached are GENERATED columns in the DB
  // (see migration 20260513b_pipeline_health.sql). We compute breached
  // locally for the function return value and tests, but the DB ignores
  // the supplied values for generated columns at INSERT time.
  breached: boolean;
};

export const stage0CoverageProbe = inngest.createFunction(
  { id: "stage-0/coverage-probe", retries: 1 },
  { cron: "TZ=Europe/Amsterdam 0 9 * * 1-5" },
  async ({ step }) => {
    // Phase 65 replay-id rule — runId minted inside step.run so a
    // replayed tick groups rows under the same id rather than minting
    // a fresh one per replay.
    const probe_run_id = await step.run("resolve-run-id", async () =>
      crypto.randomUUID(),
    );

    const measurements = await step.run("measure-coverage", async () => {
      const admin = createAdminClient();
      const out: PipelineHealthRow[] = [];
      for (const { mailbox, swarm_type } of ACTIVE_MAILBOXES) {
        const { data, error } = await admin.rpc("stage0_coverage_24h", {
          mailbox_arg: mailbox,
          swarm_arg: swarm_type,
        });
        if (error) {
          throw new Error(
            `stage0_coverage_24h failed for ${mailbox}: ${error.message}`,
          );
        }
        const row = (Array.isArray(data) ? data[0] : data) as
          | CoverageRpcRow
          | undefined;
        const stage1_count = Number(row?.stage1_count ?? 0);
        const stage0_count = Number(row?.stage0_count ?? 0);
        const coverage =
          stage1_count === 0 ? 1 : stage0_count / stage1_count;
        const breached = stage1_count > 0 && coverage < COVERAGE_FLOOR;
        out.push({
          probe_run_id,
          mailbox,
          swarm_type,
          stage1_count,
          stage0_count,
          breached,
        });
      }
      return out;
    });

    await step.run("write-pipeline-health", async () => {
      const admin = createAdminClient();
      const { error } = await admin
        .from("pipeline_health")
        .insert(measurements);
      if (error) {
        throw new Error(`pipeline_health insert failed: ${error.message}`);
      }
      return { inserted: measurements.length };
    });

    const breaches = measurements.filter((m) => m.breached).length;
    return {
      probe_run_id,
      mailboxes: measurements.length,
      breaches,
    };
  },
);
