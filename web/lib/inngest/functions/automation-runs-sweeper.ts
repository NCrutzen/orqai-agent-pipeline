import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

// Phase 999.4 D-09 — sweep stuck automation_runs.
//
// Cron cadence (described in words per CLAUDE.md JSDoc rule — NEVER paste
// the literal cron string into a JSDoc block because the slash-N sequence
// closes the comment): every 10 minutes, hours 06–19 Amsterdam time, Mon–Fri.
//
// Marks automation_runs rows stuck in status='pending' for more than 15
// minutes where triggered_by starts 'stage-0/' OR triggered_by='zapier:ingest'
// with result.stage='stage_0_safety_pending' as status='failed' with
// result.llm_reason='inngest_cancelled_stale'. Existing result JSONB keys
// (email_id, regex_matched, etc.) are preserved via per-row read-modify-write.
// Refreshes the per-swarm Bulk Review realtime channel after marking.
//
// Scope is intentionally Stage 0 only per RESEARCH.md Open Question 2.
// Stage 1 hangs surface as orphaned agent_runs rows, not automation_runs
// rows, so they are outside this sweeper.
//
// Phase 82.x extension — also reap ingest-side placeholders. Before the
// Stage 0 worker fix that switched its persist-verdict step from INSERT to
// UPDATE, ingest placeholders (triggered_by='zapier:ingest',
// result.stage='stage_0_safety_pending') sat at status='pending' forever
// when the same Outlook message was forwarded into multiple monitored
// mailboxes (each ingest created its own placeholder, but only one event
// won the email_pipeline.emails dedup). New worker fix prevents new
// orphans; this filter widening reaps any that slip through plus
// historical backlog.
//
// EXCLUDED by design: Stage 3 Kanban placeholders
// (automation='*-kanban', triggered_by in
// {'stage-3-no-handler','stage-3-low-confidence','budget-breach-handler'}).
// Per docs/agentic-pipeline/stage-3-coordinator.md Stuck-Status Meaning
// table, those rows' status='pending' is the terminal human-triage state,
// NOT a bug. Sweeper must not touch them.
//
// retries: 0 — sweeper is idempotent (already-failed rows are excluded by
// status='pending' filter); next cron tick is 10 minutes away.

type StaleRow = {
  id: string;
  swarm_type: string;
  result: Record<string, unknown> | null;
};

export const stage0StaleSweeper = inngest.createFunction(
  { id: "stage-0/stale-sweeper", retries: 0 },
  // Cron cadence: every 10 min, hours 06-19 Amsterdam, Mon-Fri.
  { cron: "TZ=Europe/Amsterdam */10 6-19 * * 1-5" },
  async ({ step }) => {
    const admin = createAdminClient();

    // Phase 65 replay-id learning: timestamp MUST be generated inside
    // step.run, otherwise replays regenerate it and pick up different rows.
    const cutoff = await step.run("compute-cutoff", async () =>
      new Date(Date.now() - 15 * 60_000).toISOString(),
    );

    const stale = await step.run("find-stale", async () => {
      // Two distinct orphan shapes:
      //   (a) Stage 0 worker pre-fix INSERTs at triggered_by='stage-0/...'
      //   (b) Ingest-side placeholders at triggered_by='zapier:ingest' AND
      //       result.stage='stage_0_safety_pending'
      // PostgREST .or() composes the OR; nested ->>stage filter narrows (b)
      // so we never sweep classifier-path 'zapier:ingest' rows (which use
      // result.stage='zapier_ingest_classify').
      const { data, error } = await admin
        .from("automation_runs")
        .select("id, swarm_type, result")
        .eq("status", "pending")
        .lt("created_at", cutoff)
        .or(
          "triggered_by.like.stage-0/%,and(triggered_by.eq.zapier:ingest,result->>stage.eq.stage_0_safety_pending)",
        );
      if (error) {
        throw new Error(`stale-sweeper select failed: ${error.message}`);
      }
      return (data ?? []) as StaleRow[];
    });

    if (stale.length === 0) {
      return { swept: 0, channels: [] as string[] };
    }

    // Per-row read-modify-write preserves existing result JSONB keys
    // (Pitfall 3 — bulk UPDATE replaces JSONB).
    const completedAt = await step.run("compute-completed-at", async () =>
      new Date().toISOString(),
    );

    await step.run("mark-failed", async () => {
      for (const row of stale) {
        const mergedResult = {
          ...(row.result ?? {}),
          llm_reason: "inngest_cancelled_stale",
        };
        const { error } = await admin
          .from("automation_runs")
          .update({
            status: "failed",
            completed_at: completedAt,
            result: mergedResult,
          })
          .eq("id", row.id);
        if (error) {
          throw new Error(
            `stale-sweeper mark-failed row ${row.id} failed: ${error.message}`,
          );
        }
      }
    });

    const channels = await step.run("compute-channels", async () =>
      Array.from(new Set(stale.map((r) => `${r.swarm_type}-review`))).sort(),
    );

    for (const ch of channels) {
      await step.run(`emit-stale-${ch}`, async () => {
        await emitAutomationRunStale(admin, ch);
      });
    }

    return { swept: stale.length, channels };
  },
);
