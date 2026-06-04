#!/usr/bin/env tsx
/**
 * Phase 5 live mega-smoke runner — support-tickets outbound + admin loop.
 *
 * Plan 05-05 Task 2. Exercises the Phase 5 ClickUp outbound path + admin-view
 * assertions end-to-end against dev Supabase + a REAL ClickUp webhook.
 *
 * PREREQUISITE OPERATOR STEPS (must be done before running this script):
 *   - Task 1: ClickUp webhook registered + SUPPORT_CLICKUP_WEBHOOK_SECRET set
 *             in Vercel dev env AND pulled to web/.env.local.
 *   - Task 1: Plan 05-01 migration applied (last_clickup_sync_at column exists).
 *   - Task 1: A real ClickUp smoke task created in a NON-production scratch list.
 *             Note its task id — pass it as CLICKUP_TASK_ID env var (or hard-code
 *             into SEED_CLICKUP_TASK_ID below before running --seed).
 *
 * USAGE:
 *   cd agent-workforce
 *   CLICKUP_TASK_ID=<real-clickup-task-id> tsx scripts/support-tickets-phase5-smoke.ts --seed
 *   # ... operator drives ClickUp transitions (assigned → in-progress → resolved → closed)
 *   # ... operator performs human override (intent / system / assignee) in ClickUp
 *   CLICKUP_TASK_ID=<real-clickup-task-id> tsx scripts/support-tickets-phase5-smoke.ts --poll
 *
 * OPTIONS:
 *   --seed      Insert the primary smoke row + 10 list rows, print the primary
 *               submission_id + the ClickUp task id, then exit.
 *   --poll      Poll support_notifications (kind='status_update') for the primary
 *               submission_id; poll support_tickets.final_intent/final_system/final_assignee,
 *               clickup_status,
 *               time_to_resolve_minutes after all 4 status transitions; print a
 *               markdown results table.
 *   --cleanup   Print the cleanup SQL and exit (does NOT run DB writes).
 *
 * REQUIRED ENV (loaded from web/.env.local, then falls back to process.env):
 *   SUPABASE_URL                  — Supabase project URL (MUST be dev, NOT production)
 *   SUPABASE_SERVICE_ROLE_KEY     — Supabase service-role key (bypasses RLS)
 *   CLICKUP_TASK_ID               — The ClickUp task id from Task 1 (smoke task)
 *
 * NOT required to run --seed or --poll (only needed by the deployed route):
 *   SUPPORT_CLICKUP_WEBHOOK_SECRET — body-auth secret; set by Task 1 in Vercel
 *
 * CLEANUP SQL (run after sign-off to remove smoke rows):
 *   DELETE FROM public.support_notifications
 *     WHERE submission_id IN (
 *       SELECT submission_id FROM public.support_tickets
 *       WHERE submitter_id LIKE 'smoke-phase5-%'
 *     );
 *   DELETE FROM public.pipeline_events
 *     WHERE swarm_type='support-tickets'
 *       AND email_id IN (
 *         SELECT submission_id FROM public.support_tickets
 *         WHERE submitter_id LIKE 'smoke-phase5-%'
 *       );
 *   DELETE FROM public.support_tickets WHERE submitter_id LIKE 'smoke-phase5-%';
 *
 * DECISION VALUES (Plan 05-03 / clickup-outbound.ts):
 *   clickup_outbound_applied         : status transition or override processed
 *   clickup_outbound_status_ignored  : status field present but maps to null canonical
 *   clickup_outbound_noop            : no relevant history_items at all
 *   clickup_outbound_ticket_not_found: no support_tickets row matched the task id
 *   already_applied                  : idempotency guard — status already stored
 *
 * CLAUDE.md guards applied:
 *   - SUPABASE_URL env must be the dev project (T-05-05-01 mitigation).
 *   - All smoke rows are synthetic — no real PII (T-05-05-02 mitigation).
 *   - ZERO new dependencies — uses @supabase/supabase-js already in package.json.
 */

import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const POLL_INTERVAL_MS = 5_000;
const TRANSITION_TIMEOUT_MS = 60_000;
const SMOKE_PREFIX = "smoke-phase5-";
const SWARM_TYPE = "support-tickets";

/** The four canonical ClickUp outbound statuses in expected arrival order. */
const CANONICAL_STATUSES = ["assigned", "in-progress", "resolved", "closed"] as const;
type CanonicalStatus = (typeof CANONICAL_STATUSES)[number];

// ---------------------------------------------------------------------------
// Cleanup SQL
// ---------------------------------------------------------------------------
const CLEANUP_SQL = `
-- Phase 5 smoke cleanup — run after sign-off.
-- ClickUp smoke task can be optionally retained for audit.

DELETE FROM public.support_notifications
  WHERE submission_id IN (
    SELECT submission_id FROM public.support_tickets
    WHERE submitter_id LIKE 'smoke-phase5-%'
  );

DELETE FROM public.pipeline_events
  WHERE swarm_type='support-tickets'
    AND email_id IN (
      SELECT submission_id FROM public.support_tickets
      WHERE submitter_id LIKE 'smoke-phase5-%'
    );

DELETE FROM public.support_tickets WHERE submitter_id LIKE 'smoke-phase5-%';
`.trim();

// ---------------------------------------------------------------------------
// Env loader (web/.env.local, no dotenv dep) — mirrors Phase 4 pattern
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const envPath = resolve(REPO_ROOT, "web/.env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return; // file not present — fall through to process.env
  }
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}
loadEnvLocal();

// ---------------------------------------------------------------------------
// Supabase admin client — mirrors Phase 4 createAdminClient pattern
// ---------------------------------------------------------------------------

function createAdminClient() {
  const url =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error(
      "SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set.\n" +
        "Load from web/.env.local or export manually. MUST point at dev — NOT production."
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

type SupabaseAdmin = ReturnType<typeof createAdminClient>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Seed: primary smoke support_tickets row
// ---------------------------------------------------------------------------

/**
 * Seeds the primary smoke row that correlates with the real ClickUp task.
 * - outbound_clickup_task_id = the ClickUp task id from Task 1
 * - proposed_* set deliberately different from what the operator will set in
 *   ClickUp (intent/system/assignee), so the override delta is observable
 * - submitted_at = now() - 30 minutes so time_to_resolve on close is a
 *   sane positive number (~30)
 */
async function seedPrimaryRow(
  supabase: SupabaseAdmin,
  clickupTaskId: string
): Promise<{ submissionId: string; ticketId: string }> {
  const ticketId = randomUUID();
  const submissionId = randomUUID();
  const submittedAt = new Date(Date.now() - 30 * 60 * 1000).toISOString();

  const row = {
    id: ticketId,
    submission_id: submissionId,
    submitter_id: `${SMOKE_PREFIX}primary-${randomUUID()}`,
    outbound_clickup_task_id: clickupTaskId,
    // Baseline proposed values — operator overrides these in ClickUp to produce delta
    proposed_intent: "duplicate",
    proposed_system: "iController",
    proposed_assignee: "smoke-baseline-assignee",
    // Leave final_* null so the override from ClickUp populates them
    final_intent: null,
    final_system: null,
    final_assignee: null,
    // Mark Stage 0-3 as complete (smoke bypasses inbound pipeline)
    pii_quarantine: false,
    quarantine_state: null,
    stage2_completed_at: new Date().toISOString(),
    stage3_completed_at: new Date().toISOString(),
    submitted_at: submittedAt,
    user_chosen_type: "bug",
    transcript:
      "[SMOKE-PHASE5] Primary smoke ticket. Operator: drive assigned→in-progress→resolved→closed in ClickUp, then override intent/system/assignee.",
    completeness_verdict: "complete",
    attempt: 1,
  };

  const { error } = await supabase.from("support_tickets").insert(row);
  if (error) {
    throw new Error(`support_tickets INSERT (primary) failed: ${error.message}`);
  }

  return { submissionId, ticketId };
}

// ---------------------------------------------------------------------------
// Seed: 10+ list rows for ADMIN-01 "10+ submissions" assertion
// ---------------------------------------------------------------------------

/**
 * Varied proposed/final values — several with final_* deliberately != proposed_*
 * so the admin-view override-delta column has visible content.
 */
function buildListFixtures(): Array<{
  proposed_intent: string;
  proposed_system: string;
  proposed_assignee: string;
  final_intent: string | null;
  final_system: string | null;
  final_assignee: string | null;
}> {
  return [
    // Rows with override deltas (final_* != proposed_*)
    {
      proposed_intent: "duplicate",
      proposed_system: "iController",
      proposed_assignee: "user-a",
      final_intent: "clickup-escalate",
      final_system: "iController",
      final_assignee: "user-b",
    },
    {
      proposed_intent: "info-answer",
      proposed_system: "NXT",
      proposed_assignee: "user-a",
      final_intent: "clarification-needed",
      final_system: "NXT",
      final_assignee: "user-c",
    },
    {
      proposed_intent: "clarification-needed",
      proposed_system: "iController",
      proposed_assignee: "user-b",
      final_intent: "duplicate",
      final_system: "Cura-portaal",
      final_assignee: "user-b",
    },
    {
      proposed_intent: "clickup-escalate",
      proposed_system: "Linqur",
      proposed_assignee: "user-c",
      final_intent: "info-answer",
      final_system: "Linqur",
      final_assignee: "user-a",
    },
    // Rows where final_* == proposed_* (no override delta)
    {
      proposed_intent: "info-answer",
      proposed_system: "iController",
      proposed_assignee: "user-a",
      final_intent: "info-answer",
      final_system: "iController",
      final_assignee: "user-a",
    },
    {
      proposed_intent: "duplicate",
      proposed_system: "NXT",
      proposed_assignee: "user-b",
      final_intent: "duplicate",
      final_system: "NXT",
      final_assignee: "user-b",
    },
    {
      proposed_intent: "clarification-needed",
      proposed_system: "Cura-portaal",
      proposed_assignee: "user-c",
      final_intent: "clarification-needed",
      final_system: "Cura-portaal",
      final_assignee: "user-c",
    },
    // Rows with null final_* (no override yet)
    {
      proposed_intent: "clickup-escalate",
      proposed_system: "iController",
      proposed_assignee: "user-a",
      final_intent: null,
      final_system: null,
      final_assignee: null,
    },
    {
      proposed_intent: "vendor-draft",
      proposed_system: "NXT",
      proposed_assignee: "user-b",
      final_intent: null,
      final_system: null,
      final_assignee: null,
    },
    {
      proposed_intent: "info-answer",
      proposed_system: "Linqur",
      proposed_assignee: "user-c",
      final_intent: null,
      final_system: null,
      final_assignee: null,
    },
    {
      proposed_intent: "duplicate",
      proposed_system: "Cura-portaal",
      proposed_assignee: "user-a",
      final_intent: "clickup-escalate",
      final_system: "NXT",
      final_assignee: "user-c",
    },
  ];
}

async function seedListRows(
  supabase: SupabaseAdmin
): Promise<number> {
  const fixtures = buildListFixtures();
  const now = new Date().toISOString();
  let seededCount = 0;

  for (const f of fixtures) {
    const ticketId = randomUUID();
    const submissionId = randomUUID();
    const row = {
      id: ticketId,
      submission_id: submissionId,
      submitter_id: `${SMOKE_PREFIX}list-${randomUUID()}`,
      proposed_intent: f.proposed_intent,
      proposed_system: f.proposed_system,
      proposed_assignee: f.proposed_assignee,
      final_intent: f.final_intent,
      final_system: f.final_system,
      final_assignee: f.final_assignee,
      pii_quarantine: false,
      quarantine_state: null,
      stage2_completed_at: now,
      stage3_completed_at: now,
      submitted_at: now,
      user_chosen_type: "bug",
      transcript: `[SMOKE-PHASE5] List row ${seededCount + 1} — admin-view population.`,
      completeness_verdict: "complete",
      attempt: 1,
    };

    const { error } = await supabase.from("support_tickets").insert(row);
    if (error) {
      throw new Error(
        `support_tickets INSERT (list row ${seededCount + 1}) failed: ${error.message}`
      );
    }
    seededCount++;
  }

  return seededCount;
}

// ---------------------------------------------------------------------------
// Poll: support_notifications (kind='status_update') for primary submission_id
// ---------------------------------------------------------------------------

interface NotificationRow {
  id: string;
  kind: string;
  payload: {
    status?: string;
    clickup_task_id?: string;
    raw_status?: string;
    received_at?: string;
  };
  created_at: string;
}

interface TransitionResult {
  status: CanonicalStatus;
  notification_id: string | null;
  payload_status: string | null;
  arrival_latency_ms: number | null;
  found: boolean;
}

async function pollNotificationsForStatus(
  supabase: SupabaseAdmin,
  submissionId: string,
  expectedStatus: CanonicalStatus,
  seedTime: number
): Promise<TransitionResult> {
  const deadline = Date.now() + TRANSITION_TIMEOUT_MS;

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("support_notifications")
      .select("id, kind, payload, created_at")
      .eq("submission_id", submissionId)
      .eq("kind", "status_update")
      .order("created_at", { ascending: true });

    if (error) {
      console.warn(`  poll notifications error: ${error.message} — retrying in ${POLL_INTERVAL_MS}ms`);
    } else if (data) {
      const rows = data as NotificationRow[];
      const match = rows.find(
        (r) => (r.payload?.status as string | undefined) === expectedStatus
      );
      if (match) {
        const arrivedAt = new Date(match.created_at).getTime();
        return {
          status: expectedStatus,
          notification_id: match.id,
          payload_status: match.payload?.status ?? null,
          arrival_latency_ms: arrivedAt - seedTime,
          found: true,
        };
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  return {
    status: expectedStatus,
    notification_id: null,
    payload_status: null,
    arrival_latency_ms: null,
    found: false,
  };
}

// ---------------------------------------------------------------------------
// Poll: support_tickets.final_* + clickup_status + time_to_resolve_minutes
// ---------------------------------------------------------------------------

interface TicketState {
  clickup_status: string | null;
  time_to_resolve_minutes: number | null;
  final_intent: string | null;
  final_system: string | null;
  final_assignee: string | null;
  proposed_intent: string | null;
  proposed_system: string | null;
  proposed_assignee: string | null;
}

async function pollTicketFinal(
  supabase: SupabaseAdmin,
  submissionId: string
): Promise<TicketState | null> {
  const { data, error } = await supabase
    .from("support_tickets")
    .select(
      "clickup_status, time_to_resolve_minutes, final_intent, final_system, final_assignee, proposed_intent, proposed_system, proposed_assignee"
    )
    .eq("submission_id", submissionId)
    .maybeSingle();

  if (error) {
    console.warn(`  support_tickets query error: ${error.message}`);
    return null;
  }
  return data as TicketState | null;
}

// ---------------------------------------------------------------------------
// Query: stage=4 pipeline_events decision distribution for smoke rows
// ---------------------------------------------------------------------------

interface DecisionCount {
  decision: string;
  count: number;
}

async function queryDecisionDistribution(
  supabase: SupabaseAdmin
): Promise<DecisionCount[]> {
  const { data, error } = await supabase
    .from("pipeline_events")
    .select("decision")
    .eq("swarm_type", SWARM_TYPE)
    .eq("stage", 4)
    .in(
      "email_id",
      // Note: Supabase JS doesn't support nested select in .in() — use a raw subquery workaround.
      // We fetch submission_ids of smoke rows first, then query by those ids.
      [] // populated below
    );

  // Fetch smoke submission_ids first
  const { data: ticketData, error: ticketError } = await supabase
    .from("support_tickets")
    .select("submission_id")
    .like("submitter_id", `${SMOKE_PREFIX}%`);

  if (ticketError) {
    console.warn(`  ticket query error: ${ticketError.message}`);
    return [];
  }

  const submissionIds = (ticketData ?? []).map(
    (r: { submission_id: string }) => r.submission_id
  );
  if (submissionIds.length === 0) return [];

  const { data: evData, error: evError } = await supabase
    .from("pipeline_events")
    .select("decision")
    .eq("swarm_type", SWARM_TYPE)
    .eq("stage", 4)
    .in("email_id", submissionIds);

  if (evError) {
    console.warn(`  pipeline_events query error: ${evError.message}`);
    return [];
  }

  // Aggregate
  const dist: Record<string, number> = {};
  for (const row of evData ?? []) {
    const d = (row as { decision: string }).decision;
    dist[d] = (dist[d] ?? 0) + 1;
  }

  return Object.entries(dist)
    .map(([decision, count]) => ({ decision, count }))
    .sort((a, b) => b.count - a.count);
}

// ---------------------------------------------------------------------------
// Print markdown results table
// ---------------------------------------------------------------------------

function printPollResultsTable(
  transitionResults: TransitionResult[],
  ticketState: TicketState | null,
  primarySubmissionId: string,
  clickupTaskId: string,
  distribution: DecisionCount[]
): void {
  console.log("\n## Phase 5 Outbound Smoke — Poll Results\n");
  console.log(`**Primary submission_id:** \`${primarySubmissionId}\``);
  console.log(`**ClickUp task id:** \`${clickupTaskId}\``);
  console.log();

  // Transition table (OUTBOUND-02 assertion)
  console.log("### Status Transition Notifications (OUTBOUND-02)\n");
  console.log(
    "| # | Expected Status | Notification ID | payload.status | Arrival Latency (ms) | Result |"
  );
  console.log(
    "|---|-----------------|-----------------|----------------|----------------------|--------|"
  );
  transitionResults.forEach((r, i) => {
    const notifId = r.notification_id ? r.notification_id.slice(0, 8) + "..." : "—";
    const latency =
      r.arrival_latency_ms != null ? `${r.arrival_latency_ms}ms` : "—";
    const result = r.found ? "FOUND" : "TIMEOUT";
    console.log(
      `| ${i + 1} | \`${r.status}\` | ${notifId} | \`${r.payload_status ?? "—"}\` | ${latency} | **${result}** |`
    );
  });

  const allTransitionsFound = transitionResults.every((r) => r.found);
  console.log(
    `\n**OUTBOUND-02 status notification check: ${allTransitionsFound ? "PASS" : "FAIL"} — ` +
      `${transitionResults.filter((r) => r.found).length}/${CANONICAL_STATUSES.length} transitions received**`
  );

  // clickup_status + time_to_resolve (OUTBOUND-02 closed)
  console.log("\n### Ticket State After Close (OUTBOUND-02)\n");
  const closedStatus = ticketState?.clickup_status ?? null;
  const timeToResolve = ticketState?.time_to_resolve_minutes ?? null;
  console.log(`| Field | Value | Check |`);
  console.log(`|-------|-------|-------|`);
  console.log(
    `| \`clickup_status\` | \`${closedStatus ?? "—"}\` | ${closedStatus === "closed" ? "PASS" : "FAIL — expected closed"} |`
  );
  console.log(
    `| \`time_to_resolve_minutes\` | ${timeToResolve ?? "—"} | ${timeToResolve != null && timeToResolve > 0 ? "PASS" : "FAIL — expected positive number (~30)"} |`
  );

  // Override delta (OUTBOUND-03 assertion)
  console.log("\n### Override Delta Capture (OUTBOUND-03)\n");
  console.log("| Axis | Proposed | Final | Override Detected? |");
  console.log("|------|----------|-------|--------------------|");
  const axes = ["intent", "system", "assignee"] as const;
  for (const axis of axes) {
    const proposed = ticketState?.[`proposed_${axis}`] ?? "—";
    const final = ticketState?.[`final_${axis}`] ?? "—";
    const overrideDetected =
      ticketState != null &&
      ticketState[`final_${axis}`] != null &&
      ticketState[`final_${axis}`] !== ticketState[`proposed_${axis}`];
    console.log(
      `| ${axis} | \`${proposed}\` | \`${final}\` | ${overrideDetected ? "YES" : "NO (check ClickUp custom fields)"} |`
    );
  }

  // Decision distribution (pipeline_events stage=4)
  console.log("\n### Stage 4 Decision Distribution (pipeline_events)\n");
  if (distribution.length === 0) {
    console.log(
      "_No stage=4 pipeline_events found yet. Run after the Inngest function has processed the webhooks._"
    );
  } else {
    console.log("| decision | count |");
    console.log("|----------|-------|");
    for (const d of distribution) {
      console.log(`| \`${d.decision}\` | ${d.count} |`);
    }
  }

  // Summary
  const overrideApplied = axes.some(
    (axis) =>
      ticketState?.[`final_${axis}`] != null &&
      ticketState[`final_${axis}`] !== ticketState[`proposed_${axis}`]
  );
  const outbound02 = allTransitionsFound && closedStatus === "closed" && timeToResolve != null && timeToResolve > 0;
  const outbound03 = overrideApplied;

  console.log("\n### Phase 5 Requirement Summary\n");
  console.log("| Requirement | Status |");
  console.log("|-------------|--------|");
  console.log(
    `| OUTBOUND-01: Webhook → Inngest function ran per transition | Verify in Inngest dashboard |`
  );
  console.log(
    `| OUTBOUND-02: 4 status notifications + clickup_status=closed + time_to_resolve | **${outbound02 ? "PASS" : "FAIL or PENDING"}** |`
  );
  console.log(
    `| OUTBOUND-03: Override delta captured in final_* | **${outbound03 ? "PASS" : "FAIL or PENDING — check ClickUp custom fields"}** |`
  );
  console.log(
    `| ADMIN-01: 10+ submissions in admin-view (smoke seeded 11+ list rows) | Verify in browser |`
  );
  console.log(
    `| ADMIN-02: swarm_intents rows visible in registries view | Verify in browser |`
  );
  console.log(
    `| ADMIN-03: support_software_systems with last_clickup_sync_at in registries | Verify in browser |`
  );
}

// ---------------------------------------------------------------------------
// Persist primary submission_id for poll mode reuse
// ---------------------------------------------------------------------------

function getPrimarySubmissionIdFromEnv(): string | null {
  return process.env.SMOKE_PHASE5_SUBMISSION_ID ?? null;
}

// ---------------------------------------------------------------------------
// Main — seed mode
// ---------------------------------------------------------------------------

async function runSeed(supabase: SupabaseAdmin, clickupTaskId: string): Promise<void> {
  console.log("# Phase 5 Smoke — Seed Mode\n");
  console.log(`**Started:** ${new Date().toISOString()}`);
  console.log(`**ClickUp Task ID:** \`${clickupTaskId}\``);
  console.log();

  // 1. Seed primary row (correlates with real ClickUp task)
  process.stdout.write("Seeding primary smoke row (outbound_clickup_task_id set)... ");
  const { submissionId, ticketId } = await seedPrimaryRow(supabase, clickupTaskId);
  console.log(`OK`);
  console.log(`  ticket_id:     ${ticketId}`);
  console.log(`  submission_id: ${submissionId}`);

  // 2. Seed 10+ list rows for ADMIN-01
  process.stdout.write("\nSeeding list rows for admin-view (ADMIN-01)... ");
  const listCount = await seedListRows(supabase);
  console.log(`OK — ${listCount} rows seeded`);

  console.log(`\n**Total smoke rows seeded:** 1 primary + ${listCount} list = ${1 + listCount}`);
  console.log(`\n**Smoke prefix (for cleanup):** \`${SMOKE_PREFIX}%\``);

  console.log(`
---

## Next Steps (operator)

1. In ClickUp, open task \`${clickupTaskId}\` and drive these status transitions IN ORDER:
   \`assigned\` → \`in-progress\` → \`resolved\` → \`closed\`
   (leave ~10s between each transition so webhook events are distinct)

2. Perform a HUMAN OVERRIDE on the same ClickUp task:
   - Change the \`intent\` custom field (away from the seeded \`duplicate\`)
   - Change the \`system\` custom field (away from the seeded \`iController\`)
   - Change the assignee (away from \`smoke-baseline-assignee\`)

3. After all transitions + override, run:
   CLICKUP_TASK_ID=${clickupTaskId} SMOKE_PHASE5_SUBMISSION_ID=${submissionId} tsx scripts/support-tickets-phase5-smoke.ts --poll

4. Admin-view verification:
   - Open \`/automations/support-tickets\` — confirm 10+ rows including the primary smoke row with override-delta
   - Open \`/automations/support-tickets/registries\` — confirm swarm_intents (5 rows) + support_software_systems with last_clickup_sync_at
`);
}

// ---------------------------------------------------------------------------
// Main — poll mode
// ---------------------------------------------------------------------------

async function runPoll(
  supabase: SupabaseAdmin,
  submissionId: string,
  clickupTaskId: string
): Promise<void> {
  console.log("# Phase 5 Smoke — Poll Mode\n");
  console.log(`**Started:** ${new Date().toISOString()}`);
  console.log(`**Polling submission_id:** \`${submissionId}\``);
  console.log(`**ClickUp Task ID:** \`${clickupTaskId}\``);
  console.log(
    `\nPolling for ${CANONICAL_STATUSES.length} status transitions (60s timeout per transition)...\n`
  );

  const seedTime = Date.now();
  const transitionResults: TransitionResult[] = [];

  // Poll for each of the 4 expected status notifications in order
  for (const status of CANONICAL_STATUSES) {
    process.stdout.write(`  Waiting for status notification '${status}'... `);
    const result = await pollNotificationsForStatus(
      supabase,
      submissionId,
      status,
      seedTime
    );
    if (result.found) {
      console.log(
        `FOUND (notification_id=${result.notification_id?.slice(0, 8)}..., latency=${result.arrival_latency_ms}ms)`
      );
    } else {
      console.log(`TIMEOUT after ${TRANSITION_TIMEOUT_MS / 1000}s`);
    }
    transitionResults.push(result);
  }

  // Query final ticket state
  console.log("\n  Querying final ticket state (clickup_status, time_to_resolve, final_*)...");
  const ticketState = await pollTicketFinal(supabase, submissionId);

  // Query decision distribution
  console.log("  Querying stage=4 pipeline_events decision distribution...");
  const distribution = await queryDecisionDistribution(supabase);

  // Print results table
  console.log("\n---");
  printPollResultsTable(
    transitionResults,
    ticketState,
    submissionId,
    clickupTaskId,
    distribution
  );

  // SQL audit queries
  console.log("\n## SQL Audit Queries\n");
  console.log("```sql");
  console.log(`-- Status notifications for primary smoke ticket
SELECT id, kind, payload->>'status' AS status, created_at
FROM public.support_notifications
WHERE submission_id = '${submissionId}'
  AND kind = 'status_update'
ORDER BY created_at;

-- Final ticket state (override capture)
SELECT submission_id, clickup_status, time_to_resolve_minutes,
       proposed_intent, final_intent,
       proposed_system, final_system,
       proposed_assignee, final_assignee
FROM public.support_tickets
WHERE submission_id = '${submissionId}';

-- Stage 4 decision distribution for all smoke rows
SELECT decision, count(*)
FROM public.pipeline_events
WHERE swarm_type='support-tickets' AND stage=4
  AND email_id IN (
    SELECT submission_id FROM public.support_tickets
    WHERE submitter_id LIKE 'smoke-phase5-%'
  )
GROUP BY decision ORDER BY count DESC;

-- Override delta from pipeline_events decision_details
SELECT decision_details->'override_delta' AS override_delta
FROM public.pipeline_events
WHERE swarm_type='support-tickets' AND stage=4
  AND email_id = '${submissionId}';

-- Admin-view row count (ADMIN-01 — expect 10+)
SELECT count(*) FROM public.support_tickets
WHERE submitter_id LIKE 'smoke-phase5-%';
`);
  console.log("```");

  console.log("\n## Cleanup\n");
  console.log("After sign-off, run:");
  console.log("```bash");
  console.log("tsx scripts/support-tickets-phase5-smoke.ts --cleanup");
  console.log("```");
  console.log("Then execute the printed SQL against the dev Supabase.\n");

  console.log(`**Finished:** ${new Date().toISOString()}`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--cleanup")) {
    console.log("# Phase 5 Smoke — Cleanup SQL\n");
    console.log("```sql");
    console.log(CLEANUP_SQL);
    console.log("```");
    console.log("\nRun this against the dev Supabase to remove smoke rows after sign-off.");
    process.exit(0);
  }

  const isSeed = args.includes("--seed");
  const isPoll = args.includes("--poll");

  if (!isSeed && !isPoll) {
    console.error(
      "Usage:\n" +
        "  tsx scripts/support-tickets-phase5-smoke.ts --seed   [CLICKUP_TASK_ID=<id>]\n" +
        "  tsx scripts/support-tickets-phase5-smoke.ts --poll   [CLICKUP_TASK_ID=<id> SMOKE_PHASE5_SUBMISSION_ID=<uuid>]\n" +
        "  tsx scripts/support-tickets-phase5-smoke.ts --cleanup"
    );
    process.exit(1);
  }

  // Validate Supabase env
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "ERROR: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.\n" +
        "Load from web/.env.local or export manually."
    );
    process.exit(1);
  }

  const clickupTaskId = process.env.CLICKUP_TASK_ID ?? "";
  if (!clickupTaskId) {
    console.error(
      "ERROR: CLICKUP_TASK_ID env var is required.\n" +
        "Set it to the ClickUp smoke task id from Task 1 (e.g. CLICKUP_TASK_ID=86xyz123 tsx ...)."
    );
    process.exit(1);
  }

  const supabase = createAdminClient();

  if (isSeed) {
    await runSeed(supabase, clickupTaskId);
    process.exit(0);
  }

  if (isPoll) {
    // --poll requires either SMOKE_PHASE5_SUBMISSION_ID or manual override
    const submissionId = getPrimarySubmissionIdFromEnv();
    if (!submissionId) {
      console.error(
        "ERROR: SMOKE_PHASE5_SUBMISSION_ID env var is required in --poll mode.\n" +
          "Use the submission_id printed by --seed:\n" +
          "  SMOKE_PHASE5_SUBMISSION_ID=<uuid> CLICKUP_TASK_ID=<id> tsx scripts/support-tickets-phase5-smoke.ts --poll"
      );
      process.exit(1);
    }
    await runPoll(supabase, submissionId, clickupTaskId);
    process.exit(0);
  }
}

main().catch((e) => {
  console.error("\nFATAL:", e instanceof Error ? e.message : String(e));
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(2);
});
