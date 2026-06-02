#!/usr/bin/env tsx
/**
 * Phase 4 live mega-smoke runner — support-tickets Stage 4 handlers.
 *
 * Plan 04-06 Task 3. Exercises all five Stage 4 handler paths + I18N-05 fallback
 * end-to-end against dev Supabase + dev Inngest + live Orq.ai + live Zapier → ClickUp.
 *
 * PREREQUISITE OPERATOR STEPS (must be done before running this script):
 *   - Task 1: Zapier ClickUp Zap configured + zapier_tools.target_url updated
 *   - Task 2: support_software_systems rows seeded (iController + NXT)
 *
 * USAGE:
 *   cd agent-workforce && tsx scripts/support-tickets-phase4-smoke.ts
 *
 * OPTIONS:
 *   --cleanup   Print the cleanup SQL and exit (does NOT run DB writes)
 *
 * REQUIRED ENV (loaded from web/.env.local, then falls back to process.env):
 *   ORQ_API_KEY                  — Orq.ai API key (real cost: ~6 × 1.5¢ = ~10¢ total)
 *   SUPPORT_CLICKUP_ZAP_SECRET   — Secret for Zap auth validation (set by Task 1)
 *   SUPABASE_URL                 — Supabase project URL (MUST be dev, NOT production)
 *   SUPABASE_SERVICE_ROLE_KEY    — Supabase service-role key (bypasses RLS)
 *   INNGEST_DEV                  — "true" to send events to localhost:8288 dev server
 *   NEXT_PUBLIC_APP_URL          — App base URL, e.g. http://localhost:3000
 *                                  (used by Inngest client for the Serve endpoint URL)
 *
 * CLEANUP SQL (run after sign-off to remove smoke rows):
 *   DELETE FROM public.pipeline_events
 *     WHERE swarm_type='support-tickets'
 *       AND email_id IN (
 *         SELECT submission_id FROM public.support_tickets
 *         WHERE submitter_id LIKE 'smoke-phase4-%'
 *       );
 *   DELETE FROM public.support_notifications
 *     WHERE submission_id IN (
 *       SELECT submission_id FROM public.support_tickets
 *       WHERE submitter_id LIKE 'smoke-phase4-%'
 *     );
 *   DELETE FROM public.support_tickets WHERE submitter_id LIKE 'smoke-phase4-%';
 *
 * STAGE 4 DECISION DISTRIBUTION EXPECTED:
 *   stage_4_clarification  : 1   (case 1)
 *   stage_4_duplicate      : 1   (case 2)
 *   stage_4_info_answer    : 2   (cases 3 + 6)
 *   stage_4_clickup_escalate: 2  (cases 4 + 5)
 *   (vendor-draft sub-mode UPDATEs case 5's row — no extra row)
 *
 * CLAUDE.md guards applied:
 *   - inngest.send NOT destructured (Phase 65 leer dae6276): use fetch-based
 *     send to Inngest Dev Server REST API instead (scripts run outside Next.js
 *     compile unit; path alias @/ is unavailable in this context).
 *   - SUPABASE_URL env must be the dev project (T-04-06-02 mitigation).
 *   - All smoke transcripts are synthetic — no real PII (T-04-06-03 mitigation).
 *   - 6 cases × max ~1.5¢ each = ~10¢ total (T-04-06-04 mitigation).
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
const POLL_TIMEOUT_MS = 90_000;
const SMOKE_PREFIX = "smoke-phase4-";
const SWARM_TYPE = "support-tickets";
const INNGEST_EVENT_NAME = "support-tickets/stage-4.handler.requested";
const CONTEXT_VERSION = "2026-05-26.v1" as const;

// ---------------------------------------------------------------------------
// Cleanup SQL (printed with --cleanup flag)
// ---------------------------------------------------------------------------
const CLEANUP_SQL = `
-- Phase 4 smoke cleanup — run after sign-off.
-- Operator decides whether to retain ClickUp smoke tasks for audit or delete them.

DELETE FROM public.pipeline_events
  WHERE swarm_type='support-tickets'
    AND email_id IN (
      SELECT submission_id FROM public.support_tickets
      WHERE submitter_id LIKE 'smoke-phase4-%'
    );

DELETE FROM public.support_notifications
  WHERE submission_id IN (
    SELECT submission_id FROM public.support_tickets
    WHERE submitter_id LIKE 'smoke-phase4-%'
  );

DELETE FROM public.support_tickets WHERE submitter_id LIKE 'smoke-phase4-%';
`.trim();

// ---------------------------------------------------------------------------
// Env loader (web/.env.local, no dotenv dep)
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
// Types
// ---------------------------------------------------------------------------

type SupportTicketIntent =
  | "clarification-needed"
  | "duplicate"
  | "info-answer"
  | "clickup-escalate"
  | "vendor-draft";

type CompletenessVerdict = "complete" | "incomplete";

interface SimilarTicketFixture {
  ticket_id: string;
  source_key: string;
  summary_text: string;
  resolution_text: string | null;
  final_intent: string | null;
  final_system: string | null;
  cosine_distance: number;
}

interface SmokeCase {
  /** e.g. 'clarification-nl' */
  case_id: string;
  label: string;
  submitter_id: string;
  submitter_locale: string;
  transcript: string;
  user_chosen_type: "bug" | "feature-request" | "info-request" | "other" | "question";
  proposed_system: string;
  proposed_intent: SupportTicketIntent;
  completeness_verdict: CompletenessVerdict;
  stage2_cost_cents: number;
  stage3_cost_cents: number;
  attempt: number;
  similar_tickets: SimilarTicketFixture[];
  expected_decision: string;
  /** I18N expectation: if set, notification.payload.submitter_locale must equal this */
  expected_notification_locale?: string;
  /** True if this case should produce an outbound_clickup_task_id */
  expect_clickup_task?: boolean;
  /** True if this case exercises vendor-draft sub-mode via NXT system */
  expect_vendor_draft?: boolean;
}

interface SmokeRow {
  support_ticket_id: string;
  submission_id: string;
  external_task_id: string;
}

interface PollResult {
  stage4_completed_at: string | null;
  handler_executed: string | null;
  outbound_clickup_task_id: string | null;
}

interface OutcomeRow {
  case_id: string;
  label: string;
  expected_decision: string;
  actual_decision: string | null;
  handler_executed: string | null;
  submitter_locale: string;
  notification_locale: string | null;
  notification_id: string | null;
  clickup_task_id: string | null;
  cost_cents: number | null;
  duration_ms: number | null;
  status: "PASS" | "FAIL" | "TIMEOUT" | "PENDING";
  notes: string;
}

// ---------------------------------------------------------------------------
// Smoke case definitions (6 cases per Task 3 spec)
// ---------------------------------------------------------------------------

function buildSmokeCases(): SmokeCase[] {
  return [
    // Case 1: clarification-needed, locale=nl (HANDLE-01 + I18N-01 + I18N-02)
    {
      case_id: "clarification-nl",
      label: "Clarification (nl)",
      submitter_id: `${SMOKE_PREFIX}clarification-nl-${randomUUID()}`,
      submitter_locale: "nl",
      transcript: "Er werkt iets niet bij iController.",
      user_chosen_type: "bug",
      proposed_system: "iController",
      proposed_intent: "clarification-needed",
      completeness_verdict: "incomplete",
      stage2_cost_cents: 0.5,
      stage3_cost_cents: 0.5,
      attempt: 1,
      similar_tickets: [],
      expected_decision: "stage_4_clarification",
      expected_notification_locale: "nl",
      expect_clickup_task: false,
    },
    // Case 2: duplicate, locale=en (HANDLE-03)
    {
      case_id: "duplicate-en",
      label: "Duplicate (en)",
      submitter_id: `${SMOKE_PREFIX}duplicate-en-${randomUUID()}`,
      submitter_locale: "en",
      transcript:
        "My PDF export crashes in iController when exporting more than 50 invoices.",
      user_chosen_type: "bug",
      proposed_system: "iController",
      proposed_intent: "duplicate",
      completeness_verdict: "complete",
      stage2_cost_cents: 0.5,
      stage3_cost_cents: 0.5,
      attempt: 1,
      similar_tickets: [
        {
          ticket_id: randomUUID(),
          source_key: "CU-SMOKE-DUP-001",
          summary_text: "PDF export crash in iController bulk export",
          resolution_text:
            "Resolved by patching the SAP integration.",
          final_intent: "duplicate",
          final_system: "iController",
          cosine_distance: 0.05,
        },
      ],
      expected_decision: "stage_4_duplicate",
      expected_notification_locale: undefined,
      expect_clickup_task: false,
    },
    // Case 3: info-answer, locale=fr (HANDLE-04 + I18N-03)
    {
      case_id: "info-answer-fr",
      label: "Info-answer (fr)",
      submitter_id: `${SMOKE_PREFIX}info-answer-fr-${randomUUID()}`,
      submitter_locale: "fr",
      transcript:
        "Comment exporter un rapport de factures vers Excel depuis iController?",
      user_chosen_type: "info-request",
      proposed_system: "iController",
      proposed_intent: "info-answer",
      completeness_verdict: "complete",
      stage2_cost_cents: 0.5,
      stage3_cost_cents: 0.5,
      attempt: 1,
      similar_tickets: [
        {
          ticket_id: randomUUID(),
          source_key: "CU-SMOKE-INFO-001",
          summary_text: "How to export invoice report to Excel in iController",
          resolution_text:
            "In iController, go to Reports > Export and choose Excel format with date range.",
          final_intent: "info-answer",
          final_system: "iController",
          cosine_distance: 0.12,
        },
      ],
      expected_decision: "stage_4_info_answer",
      expected_notification_locale: "fr",
      expect_clickup_task: false,
    },
    // Case 4: clickup-escalate WITHOUT vendor signal, locale=en (HANDLE-05)
    {
      case_id: "clickup-escalate-no-vendor-en",
      label: "ClickUp escalate, no vendor (en)",
      submitter_id: `${SMOKE_PREFIX}clickup-escalate-no-vendor-en-${randomUUID()}`,
      submitter_locale: "en",
      transcript:
        "A bug in iController: when I bulk-tag invoices the modal freezes.",
      user_chosen_type: "bug",
      proposed_system: "iController",
      proposed_intent: "clickup-escalate",
      completeness_verdict: "complete",
      stage2_cost_cents: 0.5,
      stage3_cost_cents: 0.5,
      attempt: 1,
      similar_tickets: [],
      expected_decision: "stage_4_clickup_escalate",
      expected_notification_locale: undefined,
      expect_clickup_task: true,
      expect_vendor_draft: false,
    },
    // Case 5: clickup-escalate WITH vendor signal (NXT), locale=en (HANDLE-05 + HANDLE-06 + I18N-04)
    {
      case_id: "clickup-escalate-with-vendor-nxt-en",
      label: "ClickUp escalate + vendor-draft (NXT, en)",
      submitter_id: `${SMOKE_PREFIX}clickup-escalate-with-vendor-nxt-en-${randomUUID()}`,
      submitter_locale: "en",
      transcript:
        "NXT keeps crashing every time I open the contacts module — please fix NXT.",
      user_chosen_type: "bug",
      proposed_system: "NXT",
      proposed_intent: "clickup-escalate",
      completeness_verdict: "complete",
      stage2_cost_cents: 0.5,
      stage3_cost_cents: 0.5,
      attempt: 1,
      similar_tickets: [],
      expected_decision: "stage_4_clickup_escalate",
      expected_notification_locale: undefined,
      expect_clickup_task: true,
      expect_vendor_draft: true,
    },
    // Case 6: info-answer with unknown locale (de → en fallback, I18N-05)
    {
      case_id: "info-answer-de-fallback",
      label: "Info-answer (de→en I18N-05 fallback)",
      submitter_id: `${SMOKE_PREFIX}info-answer-de-fallback-${randomUUID()}`,
      submitter_locale: "de", // unsupported → resolveSubmitterLocale warns + falls back to 'en'
      transcript:
        "Wie exportiere ich einen Bericht aus iController?",
      user_chosen_type: "info-request",
      proposed_system: "iController",
      proposed_intent: "info-answer",
      completeness_verdict: "complete",
      stage2_cost_cents: 0.5,
      stage3_cost_cents: 0.5,
      attempt: 1,
      similar_tickets: [
        {
          ticket_id: randomUUID(),
          source_key: "CU-SMOKE-INFO-002",
          summary_text: "How to export a report from iController",
          resolution_text:
            "In iController, navigate to Reports and select the export option for the desired format.",
          final_intent: "info-answer",
          final_system: "iController",
          cosine_distance: 0.18,
        },
      ],
      // Expected: I18N-05 warning logged + notification.payload.submitter_locale='en'
      // decision_details.locale_input='de' in stage=4 pipeline_events row
      expected_decision: "stage_4_info_answer",
      expected_notification_locale: "en",
      expect_clickup_task: false,
    },
  ];
}

// ---------------------------------------------------------------------------
// Supabase admin client
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
// Inngest event sender — posts directly to Inngest Dev Server REST API.
// Scripts run outside the Next.js compile unit so we cannot import
// @/lib/inngest/client. Using the REST send endpoint avoids the ESM/path-alias
// incompatibility AND avoids the `inngest.send` destructure anti-pattern
// (CLAUDE.md Phase 65 leer dae6276).
// ---------------------------------------------------------------------------

async function sendInngestEvent(payload: {
  name: string;
  data: Record<string, unknown>;
}): Promise<void> {
  // INNGEST_DEV="true" → local dev server on :8288
  // INNGEST_EVENT_KEY → production Inngest send key (fallback)
  const isDevMode =
    process.env.INNGEST_DEV === "true" || process.env.INNGEST_DEV === "1";

  let url: string;
  let headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (isDevMode) {
    // Inngest Dev Server REST API: POST /e/<event-key> or just POST /e/test
    const base = process.env.INNGEST_BASE_URL ?? "http://localhost:8288";
    url = `${base}/e/test`;
  } else {
    const eventKey = process.env.INNGEST_EVENT_KEY;
    if (!eventKey) {
      throw new Error(
        "INNGEST_EVENT_KEY must be set when INNGEST_DEV != 'true'. " +
          "Run: vercel env pull web/.env.local to load it from Vercel."
      );
    }
    url = `https://inn.gs/e/${eventKey}`;
  }

  const body = JSON.stringify(payload);
  const res = await fetch(url, { method: "POST", headers, body });
  if (!res.ok) {
    const text = await res.text().catch(() => "(no body)");
    throw new Error(
      `Inngest send failed (HTTP ${res.status}) for event '${payload.name}': ${text}`
    );
  }
}

// ---------------------------------------------------------------------------
// Seed: insert support_tickets row
// ---------------------------------------------------------------------------

async function seedSupportTicket(
  supabase: SupabaseAdmin,
  c: SmokeCase
): Promise<SmokeRow> {
  const id = randomUUID();
  const submission_id = randomUUID();
  const external_task_id = `SMOKE-PHASE4-EXT-${c.case_id.toUpperCase()}`;

  const row = {
    id,
    submission_id,
    external_task_id,
    submitter_id: c.submitter_id,
    submitter_locale: c.submitter_locale,
    user_chosen_type: c.user_chosen_type,
    transcript: c.transcript,
    proposed_system: c.proposed_system,
    proposed_intent: c.proposed_intent,
    completeness_verdict: c.completeness_verdict,
    attempt: c.attempt,
    // Mark Stage 0→3 as already complete so the handlers can read this row
    // without needing to run the full pipeline.
    pii_quarantine: false,
    quarantine_state: null,
    // Stage 2 is seeded as complete (done_at set) to satisfy any handler reads
    stage2_completed_at: new Date().toISOString(),
    stage2_cost_cents: c.stage2_cost_cents,
    // Stage 3 is seeded as complete
    stage3_completed_at: new Date().toISOString(),
    stage3_cost_cents: c.stage3_cost_cents,
    submitted_at: new Date().toISOString(),
  };

  const { error } = await supabase.from("support_tickets").insert(row);
  if (error) {
    throw new Error(
      `support_tickets INSERT failed for case '${c.case_id}': ${error.message}`
    );
  }

  return { support_ticket_id: id, submission_id, external_task_id };
}

// ---------------------------------------------------------------------------
// Seed: insert Stage 2 aggregate pipeline_events row
// ---------------------------------------------------------------------------

async function seedStage2PipelineEvent(
  supabase: SupabaseAdmin,
  c: SmokeCase,
  smokeRow: SmokeRow
): Promise<void> {
  const decision_details = {
    // PipelineStageContext v1
    context_version: CONTEXT_VERSION,
    prior_tickets_same_user: [],
    prior_tickets_same_system: [],
    similar_tickets: c.similar_tickets,
    prior_clarifications: [],
    // Stage 2 routing metadata
    proposed_system: c.proposed_system,
    proposed_intent: c.proposed_intent,
    completeness_verdict: c.completeness_verdict,
    locale_input: c.submitter_locale,
    stage2_cost_cents: c.stage2_cost_cents,
    stage3_cost_cents: c.stage3_cost_cents,
    smoke_case_id: c.case_id,
  };

  const row = {
    swarm_type: SWARM_TYPE,
    stage: 2,
    decision: "stage_2_enrichment",
    decision_details,
    triggered_by: "support-tickets:stage-4-smoke-seed",
    automation_run_id: smokeRow.support_ticket_id,
    email_id: smokeRow.submission_id,
  };

  const { error } = await supabase.from("pipeline_events").insert(row);
  if (error) {
    throw new Error(
      `pipeline_events stage=2 INSERT failed for case '${c.case_id}': ${error.message}`
    );
  }
}

// ---------------------------------------------------------------------------
// Poll: wait for stage4_completed_at to be set
// ---------------------------------------------------------------------------

async function pollForCompletion(
  supabase: SupabaseAdmin,
  support_ticket_id: string,
  caseId: string
): Promise<PollResult> {
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  let lastResult: PollResult = {
    stage4_completed_at: null,
    handler_executed: null,
    outbound_clickup_task_id: null,
  };

  while (Date.now() < deadline) {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("stage4_completed_at, handler_executed, outbound_clickup_task_id")
      .eq("id", support_ticket_id)
      .maybeSingle();

    if (error) {
      console.warn(
        `  [${caseId}] poll error: ${error.message} — retrying in ${POLL_INTERVAL_MS}ms`
      );
    } else if (data) {
      const r = data as PollResult;
      lastResult = r;
      if (r.stage4_completed_at != null || r.handler_executed != null) {
        return r;
      }
    }

    await sleep(POLL_INTERVAL_MS);
  }

  console.warn(`  [${caseId}] TIMEOUT after ${POLL_TIMEOUT_MS / 1000}s — returning last known state`);
  return lastResult;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Query: stage=4 pipeline_events row
// ---------------------------------------------------------------------------

interface Stage4EventRow {
  decision: string | null;
  decision_details: Record<string, unknown> | null;
}

async function queryStage4Event(
  supabase: SupabaseAdmin,
  submission_id: string
): Promise<Stage4EventRow | null> {
  const { data, error } = await supabase
    .from("pipeline_events")
    .select("decision, decision_details")
    .eq("swarm_type", SWARM_TYPE)
    .eq("stage", 4)
    .eq("email_id", submission_id)
    .maybeSingle();

  if (error) {
    console.warn(`  stage=4 pipeline_events query error: ${error.message}`);
    return null;
  }
  return data as Stage4EventRow | null;
}

// ---------------------------------------------------------------------------
// Query: support_notifications row
// ---------------------------------------------------------------------------

interface NotificationRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
}

async function queryNotification(
  supabase: SupabaseAdmin,
  submission_id: string
): Promise<NotificationRow | null> {
  const { data, error } = await supabase
    .from("support_notifications")
    .select("id, kind, payload")
    .eq("submission_id", submission_id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn(`  support_notifications query error: ${error.message}`);
    return null;
  }
  return data as NotificationRow | null;
}

// ---------------------------------------------------------------------------
// Print markdown results table
// ---------------------------------------------------------------------------

function printResultsTable(outcomes: OutcomeRow[]): void {
  console.log("\n## Phase 4 Mega-Smoke Results\n");
  console.log(
    `| # | Case | Expected | Actual Decision | Handler | Locale | Notification Locale | Notification ID | ClickUp Task | Cost (¢) | Duration (ms) | Status |`
  );
  console.log(
    `|---|------|----------|----------------|---------|--------|---------------------|-----------------|--------------|----------|---------------|--------|`
  );

  outcomes.forEach((o, i) => {
    const row = [
      `${i + 1}`,
      o.label,
      o.expected_decision,
      o.actual_decision ?? "—",
      o.handler_executed ?? "—",
      o.submitter_locale,
      o.notification_locale ?? "—",
      o.notification_id ? o.notification_id.slice(0, 8) + "…" : "—",
      o.clickup_task_id ?? "—",
      o.cost_cents?.toFixed(4) ?? "—",
      o.duration_ms?.toString() ?? "—",
      o.status,
    ];
    console.log(`| ${row.join(" | ")} |`);
  });

  const passed = outcomes.filter((o) => o.status === "PASS").length;
  const failed = outcomes.filter((o) => o.status === "FAIL").length;
  const timeout = outcomes.filter((o) => o.status === "TIMEOUT").length;

  console.log(`\n**Total: ${outcomes.length} cases — ${passed} PASS / ${failed} FAIL / ${timeout} TIMEOUT**\n`);

  // Distribution table (mirrors 03-04-dataset-results.md format)
  const distribution: Record<string, number> = {};
  for (const o of outcomes) {
    if (o.actual_decision) {
      distribution[o.actual_decision] = (distribution[o.actual_decision] ?? 0) + 1;
    }
  }
  console.log("### Stage 4 Decision Distribution\n");
  console.log("| decision | count |");
  console.log("|---|---|");
  for (const [dec, cnt] of Object.entries(distribution)) {
    console.log(`| \`${dec}\` | ${cnt} |`);
  }
  console.log();

  // I18N-05 note
  const case6 = outcomes.find((o) => o.case_id === "info-answer-de-fallback");
  if (case6) {
    const i18n05Pass =
      case6.status === "PASS" && case6.notification_locale === "en";
    console.log(
      `### I18N-05 Fallback Check (case 6 — de→en)\n` +
        `- submitter_locale supplied: \`de\`\n` +
        `- notification.payload.submitter_locale: \`${case6.notification_locale ?? "not found"}\`\n` +
        `- I18N-05 check: **${i18n05Pass ? "PASS" : "FAIL/PENDING"}**\n` +
        `- Verify in Inngest run logs: search for \`[support-tickets/i18n] unknown submitter_locale\` (should appear exactly once for case 6)\n`
    );
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.includes("--cleanup")) {
    console.log("# Phase 4 Smoke — Cleanup SQL\n");
    console.log("```sql");
    console.log(CLEANUP_SQL);
    console.log("```");
    console.log(
      "\nRun this against the dev Supabase to remove smoke rows after sign-off."
    );
    process.exit(0);
  }

  // Validate required env
  const supabaseUrl =
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "ERROR: SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY are required.\n" +
        "Load from web/.env.local or export manually."
    );
    process.exit(1);
  }
  if (!process.env.ORQ_API_KEY) {
    console.error(
      "ERROR: ORQ_API_KEY is required (real Orq.ai cost will be incurred)."
    );
    process.exit(1);
  }

  console.log("# Phase 4 Live Mega-Smoke — support-tickets Stage 4 handlers");
  console.log(`\n**Started:** ${new Date().toISOString()}`);
  console.log(`**Supabase URL:** ${supabaseUrl}`);
  console.log(
    `**Inngest target:** ${process.env.INNGEST_DEV === "true" ? "localhost:8288 (dev)" : "inn.gs (production key)"}\n`
  );

  // Warn if Zapier secret is missing (cases 4+5 will likely time out)
  if (!process.env.SUPPORT_CLICKUP_ZAP_SECRET) {
    console.warn(
      "WARNING: SUPPORT_CLICKUP_ZAP_SECRET is not set. Cases 4+5 (clickup-escalate) " +
        "may timeout if the Zap requires this secret for auth validation.\n"
    );
  }

  const supabase = createAdminClient();
  const cases = buildSmokeCases();
  const outcomes: OutcomeRow[] = [];

  // Phase A: seed all rows first, then fire all events (so Inngest can process concurrently)
  console.log(`## Phase A — Seeding ${cases.length} support_tickets rows + Stage 2 pipeline_events\n`);

  const seeded: Array<{ c: SmokeCase; row: SmokeRow; startMs: number }> = [];

  for (const c of cases) {
    process.stdout.write(`  Seeding case '${c.case_id}'... `);
    const row = await seedSupportTicket(supabase, c);
    await seedStage2PipelineEvent(supabase, c, row);
    const startMs = Date.now();
    seeded.push({ c, row, startMs });
    console.log(`OK — ticket_id=${row.support_ticket_id.slice(0, 8)}…`);
  }

  // Phase B: fire all Inngest events
  console.log(`\n## Phase B — Firing ${INNGEST_EVENT_NAME} events\n`);

  for (const { c, row } of seeded) {
    process.stdout.write(`  Sending event for case '${c.case_id}'... `);
    await sendInngestEvent({
      name: INNGEST_EVENT_NAME,
      data: {
        support_ticket_id: row.support_ticket_id,
        submission_id: row.submission_id,
        chosen_intent: c.proposed_intent,
        completeness_verdict: c.completeness_verdict,
      },
    });
    console.log("OK");
  }

  // Phase C: poll for completion + query outcomes
  console.log(
    `\n## Phase C — Polling outcomes (${POLL_TIMEOUT_MS / 1000}s timeout per case)\n`
  );

  for (const { c, row, startMs } of seeded) {
    console.log(`  Polling case '${c.case_id}' (${c.label})...`);

    const pollResult = await pollForCompletion(
      supabase,
      row.support_ticket_id,
      c.case_id
    );

    const durationMs = Date.now() - startMs;
    const timedOut =
      pollResult.stage4_completed_at == null &&
      pollResult.handler_executed == null;

    // Query stage=4 pipeline_events row
    const stage4Event = await queryStage4Event(supabase, row.submission_id);

    // Query support_notifications (for clarification, duplicate, info-answer, vendor-draft cases)
    const notification = await queryNotification(supabase, row.submission_id);
    const notificationLocale =
      notification?.payload?.submitter_locale != null
        ? String(notification.payload.submitter_locale)
        : null;

    // Derive cost from stage=4 decision_details if available
    const costCents =
      (stage4Event?.decision_details?.cost_cents as number | undefined) ?? null;

    // Determine pass/fail
    let status: "PASS" | "FAIL" | "TIMEOUT" | "PENDING";
    let notes = "";

    if (timedOut) {
      status = "TIMEOUT";
      notes = `No stage4_completed_at after ${POLL_TIMEOUT_MS / 1000}s`;
    } else {
      const actualDecision = stage4Event?.decision ?? pollResult.handler_executed ?? null;
      const decisionMatch = actualDecision === c.expected_decision;

      // Locale check (for cases with expected_notification_locale)
      const localeMatch =
        c.expected_notification_locale == null ||
        notificationLocale === c.expected_notification_locale;

      // ClickUp task check
      const clickupMatch =
        !c.expect_clickup_task ||
        pollResult.outbound_clickup_task_id != null;

      if (decisionMatch && localeMatch && clickupMatch) {
        status = "PASS";
      } else {
        status = "FAIL";
        const reasons: string[] = [];
        if (!decisionMatch)
          reasons.push(`decision: expected '${c.expected_decision}', got '${actualDecision ?? "null"}'`);
        if (!localeMatch)
          reasons.push(
            `locale: expected '${c.expected_notification_locale}', got '${notificationLocale ?? "null"}'`
          );
        if (!clickupMatch)
          reasons.push("missing outbound_clickup_task_id");
        notes = reasons.join("; ");
      }
    }

    const outcome: OutcomeRow = {
      case_id: c.case_id,
      label: c.label,
      expected_decision: c.expected_decision,
      actual_decision: stage4Event?.decision ?? null,
      handler_executed: pollResult.handler_executed,
      submitter_locale: c.submitter_locale,
      notification_locale: notificationLocale,
      notification_id: notification?.id ?? null,
      clickup_task_id: pollResult.outbound_clickup_task_id,
      cost_cents: costCents,
      duration_ms: durationMs,
      status,
      notes,
    };

    outcomes.push(outcome);
    console.log(`    → ${status}${notes ? ` (${notes})` : ""}`);
  }

  // Phase D: print markdown results table
  console.log("\n---\n");
  printResultsTable(outcomes);

  // Print cleanup reminder
  console.log("\n## Cleanup\n");
  console.log(
    "Run `tsx scripts/support-tickets-phase4-smoke.ts --cleanup` to print the cleanup SQL.\n" +
      "Then run it against the dev Supabase after sign-off."
  );

  // SQL audit queries (for operator)
  console.log("## SQL Audit Queries\n");
  console.log("```sql");
  console.log(`-- Decision distribution (stage=4)
SELECT decision, count(*)
FROM public.pipeline_events
WHERE swarm_type='support-tickets' AND stage=4
  AND email_id IN (
    SELECT submission_id FROM public.support_tickets
    WHERE submitter_id LIKE 'smoke-phase4-%'
  )
GROUP BY decision;

-- Support notifications
SELECT kind, payload->>'submitter_locale' AS notification_locale, submission_id
FROM public.support_notifications
WHERE submission_id IN (
  SELECT submission_id FROM public.support_tickets
  WHERE submitter_id LIKE 'smoke-phase4-%'
);

-- ClickUp task ids (cases 4 + 5)
SELECT submitter_id, outbound_clickup_task_id, handler_executed
FROM public.support_tickets
WHERE submitter_id LIKE 'smoke-phase4-%'
  AND outbound_clickup_task_id IS NOT NULL;

-- Vendor-draft sub-mode append verification (case 5)
SELECT decision_details->>'vendor_signal_detected' AS vendor_signal,
       decision_details->'vendor_draft'->>'notification_id' AS vendor_draft_notification_id
FROM public.pipeline_events
WHERE swarm_type='support-tickets' AND stage=4
  AND email_id IN (
    SELECT submission_id FROM public.support_tickets
    WHERE submitter_id LIKE 'smoke-phase4-clickup-escalate-with-vendor-nxt%'
  );
`);
  console.log("```");

  const allPassed = outcomes.every((o) => o.status === "PASS");
  console.log(`\n**Smoke result: ${allPassed ? "ALL PASS" : "FAILURES PRESENT — see table above"}**`);
  console.log(`\n**Finished:** ${new Date().toISOString()}`);

  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error("\nFATAL:", e instanceof Error ? e.message : String(e));
  if (e instanceof Error && e.stack) console.error(e.stack);
  process.exit(2);
});
