/**
 * Plan 03-04 Task 1 — Stage 3 Coordinator smoke driver.
 *
 * Modes:
 *   --mode=seeded --count=N
 *     Seeds N support_tickets rows + Stage 2 aggregate pipeline_events rows
 *     directly via service-role Supabase, then `inngest.send` the stage-3
 *     trigger. Skips Stage 0/1/2 LLM calls. Each seeded ticket has a
 *     hand-crafted transcript designed to hit a specific intent.
 *
 *   --mode=verify
 *     Runs aggregate SQL queries over rows whose submitter_id begins with
 *     'smoke-phase3-'. Prints decision distribution + verdict invariant check.
 *
 * Required env (loads from agent-workforce/web/.env.local):
 *   - SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - INNGEST_EVENT_KEY (Inngest dev server uses any value)
 *
 * Usage:
 *   cd agent-workforce/web
 *   npx tsx --env-file=.env.local scripts/smoke-stage-3-coordinator.ts --mode=seeded --count=4
 *   npx tsx --env-file=.env.local scripts/smoke-stage-3-coordinator.ts --mode=verify
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { Inngest } from "inngest";
import { randomUUID } from "node:crypto";

const args = new Map<string, string>();
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--([^=]+)=(.*)$/);
  if (m) args.set(m[1], m[2]);
  else if (a.startsWith("--")) args.set(a.slice(2), "true");
}
const mode = args.get("mode") ?? "verify";
const count = Number(args.get("count") ?? "4");

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? "").replace(/\\n$/, "");
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error("Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in env");
  process.exit(1);
}

const supabase: SupabaseClient = createClient(SUPABASE_URL, SERVICE_KEY, {
  auth: { persistSession: false },
});

// Inngest dev server defaults
const inngest = new Inngest({
  id: "support-tickets-smoke",
  eventKey: process.env.INNGEST_EVENT_KEY ?? "dev",
  baseUrl: "http://localhost:8288",
});

interface SeedCase {
  label: string;
  transcript: string;
  user_chosen_type: "bug" | "feature-request" | "info-request" | "question" | "other";
  submitter_locale: "nl" | "en" | "fr";
  expected_intent_hint: string;
  pii_quarantine?: boolean;
  quarantine_state?: string | null;
}

const SEED_CASES: SeedCase[] = [
  {
    label: "1-bug-clear",
    transcript:
      "I cannot log in to NXT, getting a 500 internal server error on the dashboard after I click sign in.",
    user_chosen_type: "bug",
    submitter_locale: "en",
    expected_intent_hint: "clickup-escalate (complete)",
  },
  {
    label: "2-vague-sparse",
    transcript: "Something is broken in the system.",
    user_chosen_type: "bug",
    submitter_locale: "en",
    expected_intent_hint: "clarification-needed (incomplete)",
  },
  {
    label: "3-info-howto",
    transcript:
      "How do I export an invoice report to Excel from iController? I need a step-by-step.",
    user_chosen_type: "info-request",
    submitter_locale: "en",
    expected_intent_hint: "info-answer (complete)",
  },
  {
    label: "4-quarantine-blocked",
    transcript: "This transcript should never reach the agent because we quarantine it.",
    user_chosen_type: "bug",
    submitter_locale: "en",
    expected_intent_hint: "blocked (quarantine defense-in-depth)",
    pii_quarantine: true,
    quarantine_state: "smoke_test_forced_quarantine",
  },
];

async function seedSubmission(c: SeedCase, idx: number): Promise<{ id: string; submission_id: string; label: string }> {
  const submission_id = randomUUID();
  const submitter_id = `smoke-phase3-${Date.now()}-${idx}`;
  const external_task_id = `CU-SMOKE3-${Date.now()}-${idx}`;

  // 1. Insert support_tickets row with Stage-2-completed state
  const { data: ticket, error: ticketErr } = await supabase
    .from("support_tickets")
    .insert({
      submission_id,
      submitter_id,
      external_task_id,
      attempt: 1,
      user_chosen_type: c.user_chosen_type,
      submitter_locale: c.submitter_locale,
      transcript: c.transcript,
      proposed_system: null,
      proposed_system_status: "unknown",
      pii_quarantine: c.pii_quarantine ?? false,
      quarantine_state: c.quarantine_state ?? null,
      stage2_cost_cents: 0.5,
      stage2_completed_at: new Date().toISOString(),
      submitted_at: new Date().toISOString(),
    })
    .select("id, submission_id")
    .single();

  if (ticketErr || !ticket) {
    throw new Error(`seed ticket ${idx} failed: ${ticketErr?.message ?? "no row"}`);
  }

  // 2. Insert the Stage 2 aggregate pipeline_events row carrying PipelineStageContext v1
  const stage2Decision = c.pii_quarantine ? "stage_2_enrichment_pii_quarantined" : "stage_2_enrichment";
  const { error: peErr } = await supabase.from("pipeline_events").insert({
    swarm_type: "support-tickets",
    stage: 2,
    decision: stage2Decision,
    decision_details: {
      external_task_id,
      attempt: 1,
      context_version: "2026-05-26.v1",
      prior_tickets_same_user: [],
      prior_tickets_same_system: [],
      similar_tickets: [],
      prior_clarifications: [],
      transcribe: { ok: true, submitter_locale: c.submitter_locale, cost_cents: 0.5 },
      pii_check: { flagged: c.pii_quarantine ?? false, reason: c.quarantine_state ?? null },
      stage2_cost_cents: 0.5,
    },
    duration_ms: 100,
    cost_cents: 0.5,
    triggered_by: "support-tickets-smoke:stage-2-seed",
    automation_run_id: ticket.id,
    email_id: ticket.submission_id,
  });
  if (peErr) {
    throw new Error(`seed pipeline_events stage=2 for ${idx} failed: ${peErr.message}`);
  }

  return { id: ticket.id, submission_id: ticket.submission_id, label: c.label };
}

async function fireStage3Trigger(t: { id: string; submission_id: string; label: string }): Promise<void> {
  await inngest.send({
    name: "support-tickets/stage-3.coordinator.requested",
    data: {
      support_ticket_id: t.id,
      submission_id: t.submission_id,
    },
  });
}

async function runSeeded(): Promise<void> {
  const N = Math.min(count, SEED_CASES.length);
  console.log(`Seeding ${N} cases...`);
  const seeded: Array<{ id: string; submission_id: string; label: string }> = [];
  for (let i = 0; i < N; i++) {
    const t = await seedSubmission(SEED_CASES[i], i);
    seeded.push(t);
    console.log(JSON.stringify({ idx: i, ...t, expected: SEED_CASES[i].expected_intent_hint }));
  }
  console.log("Firing Stage 3 triggers...");
  for (const t of seeded) {
    await fireStage3Trigger(t);
  }
  console.log(`✓ Fired ${seeded.length} stage-3 triggers. Wait ~30-60s then run --mode=verify.`);
}

async function runVerify(): Promise<void> {
  // 1. Decision-value distribution for the smoke run
  const { data: dist, error: distErr } = await supabase.rpc("execute_sql_smoke", {});
  if (distErr) {
    // fallback: direct queries via REST
  }
  void dist;

  console.log("\n=== Stage 3 results for submitter_id LIKE 'smoke-phase3-%' ===\n");
  const { data: rows, error: rowsErr } = await supabase
    .from("support_tickets")
    .select(
      "submitter_id, submission_id, transcript, user_chosen_type, proposed_intent, proposed_intent_confidence, completeness_verdict, clarification_questions, stage3_cost_cents, stage3_completed_at, pii_quarantine, quarantine_state",
    )
    .like("submitter_id", "smoke-phase3-%")
    .order("submitted_at", { ascending: true });
  if (rowsErr) {
    console.error("support_tickets query failed:", rowsErr);
    process.exit(1);
  }
  console.table(
    (rows ?? []).map((r) => ({
      submitter: r.submitter_id?.slice(-15),
      type: r.user_chosen_type,
      transcript: (r.transcript ?? "").slice(0, 40),
      intent: r.proposed_intent,
      conf: r.proposed_intent_confidence,
      verdict: r.completeness_verdict,
      cost: r.stage3_cost_cents,
      pii: r.pii_quarantine,
      stage3_done: r.stage3_completed_at ? "✓" : "✗",
    })),
  );

  const { data: events, error: evErr } = await supabase
    .from("pipeline_events")
    .select("email_id, decision, cost_cents, duration_ms, decision_details")
    .eq("swarm_type", "support-tickets")
    .eq("stage", 3)
    .in(
      "email_id",
      (rows ?? []).map((r) => r.submission_id),
    );
  if (evErr) {
    console.error("pipeline_events query failed:", evErr);
    process.exit(1);
  }

  console.log("\n=== pipeline_events stage=3 ===\n");
  console.table(
    (events ?? []).map((e) => ({
      email_id_tail: (e.email_id ?? "").slice(-12),
      decision: e.decision,
      cost: e.cost_cents,
      duration_ms: e.duration_ms,
    })),
  );

  // Invariant check
  const violations = (rows ?? []).filter((r) => {
    if (!r.proposed_intent || !r.completeness_verdict) return false;
    const isClarification = r.proposed_intent === "clarification-needed";
    const isIncomplete = r.completeness_verdict === "incomplete";
    return isClarification !== isIncomplete; // bidirectional invariant
  });
  console.log(`\n=== Verdict invariant check ===`);
  console.log(`Violations: ${violations.length} (must be 0 for Success Criterion 3)`);
  if (violations.length > 0) {
    console.table(
      violations.map((r) => ({
        submitter: r.submitter_id?.slice(-15),
        intent: r.proposed_intent,
        verdict: r.completeness_verdict,
      })),
    );
  }

  // Stage 3 row uniqueness check (UNIQUE constraint pipeline_events_one_per_stage_email)
  const eventCounts = new Map<string, number>();
  for (const e of events ?? []) {
    eventCounts.set(e.email_id!, (eventCounts.get(e.email_id!) ?? 0) + 1);
  }
  const duplicates = Array.from(eventCounts.entries()).filter(([, n]) => n !== 1);
  console.log(`\n=== Stage 3 row uniqueness ===`);
  console.log(`Submissions with != 1 stage=3 rows: ${duplicates.length} (must be 0)`);

  console.log("\n✓ Verify complete.");
}

(async () => {
  if (mode === "seeded") await runSeeded();
  else if (mode === "verify") await runVerify();
  else {
    console.error(`Unknown mode: ${mode}. Use --mode=seeded or --mode=verify`);
    process.exit(1);
  }
})();
