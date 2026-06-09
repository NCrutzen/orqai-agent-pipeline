/**
 * Phase 113 Plan 05 Task 2 — sales Stage 3 dead-letter reconciliation smoke
 * (AI-SPEC §5 D1 / STAGE3-03 / threat T-113-08).
 *
 * The hard contract: EVERY post-Stage-1 sales email reaches a TERMINAL,
 * VISIBLE Stage-3 state — a Stage 3 verdict, a routing-held verdict (Plan 05
 * coordinator gate — visible in Bulk Review, routing held in dry-run
 * observation), or a Kanban human-lane row with a reason. Zero silent
 * dead-letters.
 *
 * Reconciliation: count post-Stage-1 sales emails (the population that ENTERED
 * Stage 3) vs. those with ANY terminal Stage-3 outcome; gap = entered −
 * terminal must be 0. The script `process.exit(1)` on any gap, naming the
 * orphan email_ids, so it can run as a CI smoke + an Inngest health check.
 *
 * A Zod-failure (classifier exception) is NOT a dead-letter: it surfaces the
 * raw output in Bulk Review with an operator retry (proven to accept
 * swarm_type='sales-email' by sales-bulk-review-retry.test.ts). Only an email
 * with NO visible state anywhere is a dead-letter.
 *
 * The counting logic is a PURE exported function (reconcileDeadLetters) so the
 * test can drive it with fixtures; main() wires it to Supabase (service-role).
 *
 * Usage:  npx tsx web/scripts/eval/sales-stage3-deadletter-check.ts [sinceISO] [untilISO]
 */

const SWARM = "sales-email";

/** An email that entered Stage 3 (survived Stage 1 and dispatched). */
export interface EnteredEmail {
  email_id: string;
}

/**
 * The set of email_ids that reached a terminal, visible Stage-3 state. Built
 * from the union of:
 *   - pipeline_events stage=3 rows (a persisted verdict),
 *   - coordinator_runs with decision_details.routing_held=true (held verdict —
 *     visible in Bulk Review, routing held; Plan 05 gate),
 *   - agent_runs in a terminal human-lane / done status
 *     (routed_human_queue | predicted | done).
 */
export interface TerminalSets {
  stage3VerdictEmailIds: Iterable<string>;
  routingHeldEmailIds: Iterable<string>;
  terminalAgentRunEmailIds: Iterable<string>;
}

export interface ReconciliationResult {
  entered: number;
  terminal: number;
  gap: number;
  orphanEmailIds: string[];
}

/**
 * Pure reconciliation. Given the population that entered Stage 3 and the three
 * terminal-state sources, compute the dead-letter gap. An email is terminal if
 * it appears in ANY terminal source. gap counts entered emails with no terminal
 * state; orphanEmailIds names them.
 */
export function reconcileDeadLetters(
  entered: EnteredEmail[],
  terminal: TerminalSets,
): ReconciliationResult {
  const terminalIds = new Set<string>();
  for (const id of terminal.stage3VerdictEmailIds) terminalIds.add(id);
  for (const id of terminal.routingHeldEmailIds) terminalIds.add(id);
  for (const id of terminal.terminalAgentRunEmailIds) terminalIds.add(id);

  // De-dup the entered population by email_id (a re-dispatched email enters once).
  const enteredIds = new Set(entered.map((e) => e.email_id));

  const orphanEmailIds: string[] = [];
  for (const id of enteredIds) {
    if (!terminalIds.has(id)) orphanEmailIds.push(id);
  }
  orphanEmailIds.sort();

  return {
    entered: enteredIds.size,
    terminal: enteredIds.size - orphanEmailIds.length,
    gap: orphanEmailIds.length,
    orphanEmailIds,
  };
}

/** Wire the pure function to Supabase over a [since, until) window. */
async function main(): Promise<void> {
  const since = process.argv[2] ?? new Date(Date.now() - 7 * 864e5).toISOString();
  const until = process.argv[3] ?? new Date().toISOString();

  // Lazy import so the pure function (and its test) never needs env/secrets.
  const { createAdminClient } = await import("@/lib/supabase/admin");
  const admin = createAdminClient();

  // ENTERED = post-Stage-1 sales emails that dispatched to Stage 3. The Stage 1
  // verdict that survives to Stage 3 lands a pipeline_events stage=1 row for the
  // swarm; those email_ids are the population that should each reach a terminal
  // Stage-3 state.
  const enteredRes = await admin
    .from("pipeline_events")
    .select("email_id")
    .eq("swarm_type", SWARM)
    .eq("stage", 1)
    .gte("created_at", since)
    .lt("created_at", until)
    .not("email_id", "is", null);
  if (enteredRes.error) throw new Error(`entered query: ${enteredRes.error.message}`);
  const entered: EnteredEmail[] = (enteredRes.data ?? [])
    .map((r: { email_id: string | null }) => r.email_id)
    .filter((id: string | null): id is string => !!id)
    .map((email_id: string) => ({ email_id }));

  // TERMINAL source 1 — Stage 3 verdict rows.
  const verdictRes = await admin
    .from("pipeline_events")
    .select("email_id")
    .eq("swarm_type", SWARM)
    .eq("stage", 3)
    .gte("created_at", since)
    .lt("created_at", until)
    .not("email_id", "is", null);
  if (verdictRes.error) throw new Error(`verdict query: ${verdictRes.error.message}`);
  const stage3VerdictEmailIds = (verdictRes.data ?? [])
    .map((r: { email_id: string | null }) => r.email_id)
    .filter((id: string | null): id is string => !!id);

  // TERMINAL source 2 — routing-held verdicts (Plan 05 gate). coordinator_runs
  // with decision_details.routing_held=true is a visible held verdict.
  const heldRes = await admin
    .from("coordinator_runs")
    .select("email_id")
    .eq("swarm_type", SWARM)
    .eq("decision_details->>routing_held", "true")
    .gte("created_at", since)
    .lt("created_at", until)
    .not("email_id", "is", null);
  // coordinator_runs may not expose email_id directly in every deployment; treat
  // a query error as "no held rows" rather than failing the smoke (the stage-3
  // verdict source already covers persisted verdicts).
  const routingHeldEmailIds = heldRes.error
    ? []
    : (heldRes.data ?? [])
        .map((r: { email_id: string | null }) => r.email_id)
        .filter((id: string | null): id is string => !!id);

  // TERMINAL source 3 — terminal agent_runs (Kanban human-lane / done).
  const agentRes = await admin
    .from("agent_runs")
    .select("email_id, status")
    .eq("swarm_type", SWARM)
    .in("status", ["routed_human_queue", "predicted", "done"])
    .gte("created_at", since)
    .lt("created_at", until)
    .not("email_id", "is", null);
  const terminalAgentRunEmailIds = agentRes.error
    ? []
    : (agentRes.data ?? [])
        .map((r: { email_id: string | null }) => r.email_id)
        .filter((id: string | null): id is string => !!id);

  const result = reconcileDeadLetters(entered, {
    stage3VerdictEmailIds,
    routingHeldEmailIds,
    terminalAgentRunEmailIds,
  });

  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify(
      {
        swarm: SWARM,
        window: { since, until },
        entered: result.entered,
        terminal: result.terminal,
        gap: result.gap,
        orphanEmailIds: result.orphanEmailIds,
      },
      null,
      2,
    ),
  );
  if (result.gap !== 0) {
    // eslint-disable-next-line no-console
    console.error(
      `DEAD-LETTER GAP=${result.gap} — ${result.orphanEmailIds.length} post-Stage-1 sales emails reached no terminal Stage-3 state (STAGE3-03 breach).`,
    );
    process.exit(1);
  }
  // eslint-disable-next-line no-console
  console.log("gap=0 — every post-Stage-1 sales email reached a terminal Stage-3 state.");
}

// Only run main() when invoked directly (tsx), never on import (the test imports
// the pure function only).
const invokedDirectly =
  typeof process !== "undefined" &&
  Array.isArray(process.argv) &&
  /sales-stage3-deadletter-check\.ts$/.test(process.argv[1] ?? "");
if (invokedDirectly) {
  main().catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  });
}
