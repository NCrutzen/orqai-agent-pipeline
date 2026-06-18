/**
 * info-routing backlog reprocess (2026-06-18, operator-initiated).
 *
 * WHY: from swarm go-live (2026-05-21) until the agent_runs CHECK fix
 * (migration 20260616115210, 2026-06-16 11:52 UTC) every info-routing Stage-1
 * LLM 2nd-pass INSERT threw Postgres 23514 → the email fell to `unknown` and
 * was NEVER classified or dispatched. 683 distinct emails are stranded at
 * Stage 1. Now that (a) the constraint is fixed and (b) stage_1_archive is LIVE
 * (migration 20260618_info_routing_stage1_archive_golive), re-running these
 * through the pipeline lets high-confidence noise auto-archive out of the
 * info@smeba.nl inbox and surfaces the legit business mail for routing.
 *
 * WHAT: for each target email_id, create a fresh `pending` automation_runs row
 * and emit `stage-0/email.received` to PRODUCTION Inngest (inn.gs) — exactly the
 * payload /api/automations/info-routing/ingest builds. Stage 0 re-screens safety,
 * Stage 1 re-classifies (constraint now fixed), the verdict-worker archives
 * high-confidence noise (gate now open). Medium/low noise → requires_review
 * (held, no side effect). The `factuur`/`offerte`/... actionable-token carve-out
 * still protects business mail from being archived.
 *
 * SAFETY:
 *   - DRY-RUN by default; prints the plan. Pass --live to actually emit.
 *   - --limit N  (default 10) caps how many emails are processed this run.
 *   - Idempotent: default target = emails whose latest Stage-1 event still
 *     carries an llm_error. Once reprocessed they get a clean event and drop out
 *     of the selection — re-running never double-archives.
 *   - --ids a,b,c  overrides the query with an explicit email_id allowlist
 *     (used for the small verification batch).
 *
 * Env (loaded from web/.env.local): SUPABASE_URL (or NEXT_PUBLIC_SUPABASE_URL),
 *   SUPABASE_SERVICE_ROLE_KEY, INNGEST_EVENT_KEY (production send key).
 *
 * inngest.send is NOT used (Phase 65 leer dae6276); POST to the Inngest REST
 * endpoint directly, mirroring scripts/support-tickets-phase4-smoke.ts.
 *
 * Run:  cd web
 *       npx tsx scripts/info-routing-backlog-reprocess.ts                       # dry-run, 10
 *       npx tsx scripts/info-routing-backlog-reprocess.ts --live --ids <id1>,<id2>  # small batch
 *       npx tsx scripts/info-routing-backlog-reprocess.ts --live --limit 1000   # full backlog
 */

import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url)); // web/scripts

const SWARM_TYPE = "info-routing";
const AUTOMATION = "info-routing";
const ENTITY = "smeba";
const PROD_URL_HINT = "mvqjhlxfvtqqubqgdvhz";

// ── Env loader (web/.env.local; minimal parser, no dotenv dep) ────────────────
function loadEnvLocal(): void {
  const envPath = resolve(SCRIPT_DIR, "..", ".env.local"); // web/.env.local
  let raw = "";
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
  }
  for (const line of raw.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
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

// ── Args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const LIVE = args.includes("--live");
function argVal(flag: string): string | null {
  const i = args.findIndex((a) => a === flag || a.startsWith(`${flag}=`));
  if (i === -1) return null;
  const a = args[i];
  return a.includes("=") ? a.split("=")[1] : (args[i + 1] ?? null);
}
const LIMIT = parseInt(argVal("--limit") ?? "10", 10);
const idsRaw = argVal("--ids");
const EXPLICIT_IDS = idsRaw
  ? idsRaw.split(",").map((s) => s.trim()).filter(Boolean)
  : null;

const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const INNGEST_EVENT_KEY = process.env.INNGEST_EVENT_KEY ?? "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  throw new Error(
    "Missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY (load web/.env.local).",
  );
}
if (LIVE && !INNGEST_EVENT_KEY) {
  throw new Error(
    "INNGEST_EVENT_KEY (production send key) must be set for --live. Load web/.env.local.",
  );
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

interface EmailRow {
  id: string;
  source_id: string | null;
  mailbox: string | null;
  subject: string | null;
  sender_email: string | null;
  body_unique_text: string | null;
  body_text: string | null;
  body_html: string | null;
}

async function selectTargetIds(): Promise<string[]> {
  if (EXPLICIT_IDS) return EXPLICIT_IDS.slice(0, LIMIT);
  const { data, error } = await admin
    .from("pipeline_events")
    .select("email_id, created_at, decision_details")
    .eq("swarm_type", SWARM_TYPE)
    .eq("stage", 1)
    .not("decision_details->>llm_error", "is", null)
    .order("created_at", { ascending: false })
    .limit(5000);
  if (error) throw new Error(`target select failed: ${error.message}`);
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const r of (data ?? []) as { email_id: string }[]) {
    if (seen.has(r.email_id)) continue;
    seen.add(r.email_id);
    ids.push(r.email_id);
    if (ids.length >= LIMIT) break;
  }
  return ids;
}

async function sendInngest(payload: { name: string; data: Record<string, unknown> }) {
  const res = await fetch(`https://inn.gs/e/${INNGEST_EVENT_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Inngest send failed (HTTP ${res.status}): ${text}`);
  }
}

async function main() {
  const isProd = SUPABASE_URL.includes(PROD_URL_HINT);
  const ids = await selectTargetIds();
  console.log(
    `\ninfo-routing backlog reprocess — ${isProd ? "PRODUCTION" : "non-prod"} — ` +
      `${LIVE ? "LIVE" : "DRY-RUN"} — ${ids.length} email(s) (limit ${LIMIT})\n`,
  );
  if (ids.length === 0) {
    console.log("No stranded emails match the selection. Nothing to do.");
    return;
  }

  // Chunk the .in() fetch: a single GET with hundreds of UUIDs blows the URL
  // length limit → 400 Bad Request.
  const byId = new Map<string, EmailRow>();
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100);
    const { data: emails, error } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select(
        "id, source_id, mailbox, subject, sender_email, body_unique_text, body_text, body_html",
      )
      .in("id", chunk);
    if (error) throw new Error(`email fetch failed: ${error.message}`);
    for (const e of (emails ?? []) as EmailRow[]) byId.set(e.id, e);
  }

  let emitted = 0;
  let skipped = 0;
  for (const id of ids) {
    const e = byId.get(id);
    if (!e || !e.source_id) {
      console.log(`  SKIP ${id} — missing email row or source_id`);
      skipped++;
      continue;
    }
    const body = e.body_unique_text || e.body_text || "";
    console.log(
      `  ${LIVE ? "EMIT" : "PLAN"} ${id}  [${e.sender_email}]  "${(e.subject ?? "").slice(0, 60)}"`,
    );
    if (!LIVE) continue;

    // Clear the stale Stage-1 event so the reprocessed run can insert a fresh
    // verdict (pipeline_events_one_per_stage_email is UNIQUE on stage+email).
    // Stage-0 re-run is conflict-tolerant, so only Stage-1 needs clearing.
    await admin
      .from("pipeline_events")
      .delete()
      .eq("swarm_type", SWARM_TYPE)
      .eq("stage", 1)
      .eq("email_id", e.id);

    const ins = await admin
      .from("automation_runs")
      .insert({
        automation: AUTOMATION,
        status: "pending",
        swarm_type: SWARM_TYPE,
        topic: null,
        entity: ENTITY,
        mailbox_id: null,
        result: {
          stage: "stage_0_safety_pending",
          message_id: e.source_id,
          source_mailbox: e.mailbox,
          entity: ENTITY,
          subject: e.subject,
          from: e.sender_email,
          reprocess: "info-routing-backlog-2026-06-18",
        },
        triggered_by: "script:backlog-reprocess",
      })
      .select("id")
      .single();
    const runId = ins.data?.id as string | undefined;
    if (!runId) {
      console.log(`    ERROR insert automation_runs: ${ins.error?.message}`);
      skipped++;
      continue;
    }
    await sendInngest({
      name: "stage-0/email.received",
      data: {
        automation_run_id: runId,
        message_id: e.source_id,
        source_mailbox: e.mailbox,
        email_id: e.id,
        swarm_type: SWARM_TYPE,
        entity: ENTITY,
        subject: e.subject,
        sender_email: e.sender_email,
        body_text: body,
        body_html: e.body_html,
      },
    });
    emitted++;
  }

  console.log(
    `\nDone. ${LIVE ? `emitted=${emitted}` : "dry-run (no emits)"} skipped=${skipped}\n` +
      (LIVE
        ? "Watch pipeline_events (swarm_type=info-routing, stage=1) for the new verdicts; high-confidence noise archives out of the inbox.\n"
        : "Re-run with --live to emit.\n"),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
