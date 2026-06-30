#!/usr/bin/env tsx
/**
 * Phase 135 Plan 01 Task 3 (MODEL-04 / D-04 / threat T-135-02) — DB trigger smoke.
 *
 * Operator-runnable, NOT auto-applied. It pokes the LIVE project
 * `mvqjhlxfvtqqubqgdvhz` and is meant to run ONLY inside 135-05's gated apply
 * window (after the rename + trigger + seed migration lands). It proves the
 * `enforce_handler_trigger_stage_invariant` trigger makes an illegal state
 * physically unrepresentable: it attempts an ILLEGAL UPDATE — setting a Stage-4
 * handler to "live" on a swarm whose trigger-stage is HELD (info-routing, whose
 * stage_3_routing is held per Pitfall 2) — and asserts the DB REJECTS it.
 *
 *   Exit 0  → the illegal write was rejected by the trigger (PASS), OR the
 *             migration is not yet applied (safe no-op skip — clear message).
 *   Exit 1  → the illegal write was ACCEPTED (trigger missing/broken — FAIL).
 *   Exit 2  → token missing / unexpected API or SQL error.
 *
 * Safety (threat T-135-02): the probe runs inside an anonymous DO block that
 * ALWAYS raises — either the trigger's own exception (rejected) or our sentinel
 * `PHASE135_PROBE_NOT_REJECTED` exception (not rejected). Because a DO block is
 * a single atomic statement, ANY raise rolls the whole thing back, so the probe
 * write is NEVER persisted regardless of outcome (revert/no-op by construction).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... npx tsx web/scripts/phase135-trigger-smoke.ts
 *
 * The token must have Management API access. It lives in web/.env.local as
 * SUPABASE_ACCESS_TOKEN — the same token the Supabase plugin MCP uses. NEVER a
 * hardcoded service-role key (CLAUDE.md "Credentials vs Env Vars").
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const PROJECT_REF = "mvqjhlxfvtqqubqgdvhz";
const TRIGGER_NAME = "trg_enforce_handler_trigger_stage_invariant";
const PROBE_SWARM = "info-routing"; // trigger-stage (stage_3_routing) is HELD
const SENTINEL = "PHASE135_PROBE_NOT_REJECTED";

const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error(
    "SUPABASE_ACCESS_TOKEN missing (looked in web/.env.local and environment).",
  );
  process.exit(2);
}

interface SqlResult {
  ok: boolean;
  status: number;
  rows: unknown[] | null;
  errorMessage: string | null;
}

async function runSql(query: string): Promise<SqlResult> {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query }),
    },
  );
  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = text;
  }
  if (res.ok) {
    return {
      ok: true,
      status: res.status,
      rows: Array.isArray(parsed) ? parsed : [],
      errorMessage: null,
    };
  }
  // The query endpoint returns the Postgres error message on a SQL failure.
  const msg =
    (parsed as { message?: string } | null)?.message ??
    (typeof parsed === "string" ? parsed : JSON.stringify(parsed));
  return { ok: false, status: res.status, rows: null, errorMessage: msg };
}

async function main(): Promise<void> {
  // (0) Pre-apply guards — no-op cleanly if the migration has not landed yet.
  const colCheck = await runSql(
    `SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'swarms'
       AND column_name = 'gating_config' LIMIT 1;`,
  );
  if (!colCheck.ok) {
    console.error(`Management API error checking column: ${colCheck.errorMessage}`);
    process.exit(2);
  }
  if ((colCheck.rows?.length ?? 0) === 0) {
    console.log(
      "gating_config column absent — migration not applied yet. " +
        "Run after 135-05 apply. (no-op skip)",
    );
    process.exit(0);
  }

  const trigCheck = await runSql(
    `SELECT 1 FROM pg_trigger
     WHERE tgname = '${TRIGGER_NAME}' AND NOT tgisinternal LIMIT 1;`,
  );
  if (!trigCheck.ok) {
    console.error(`Management API error checking trigger: ${trigCheck.errorMessage}`);
    process.exit(2);
  }
  if ((trigCheck.rows?.length ?? 0) === 0) {
    console.log(
      `trigger ${TRIGGER_NAME} absent — migration not applied yet. ` +
        "Run after 135-05 apply. (no-op skip)",
    );
    process.exit(0);
  }

  // (1) The illegal probe. The DO block ALWAYS raises → always rolls back →
  // nothing is ever persisted (threat T-135-02 revert/no-op by construction).
  console.log(
    `[phase135-trigger-smoke] probing illegal handler=live on held trigger-stage ` +
      `(swarm=${PROBE_SWARM}) — expecting the trigger to REJECT it…`,
  );
  const probe = await runSql(
    `DO $$
     BEGIN
       UPDATE public.swarms
       SET gating_config = jsonb_set(
         COALESCE(gating_config, '{}'::jsonb),
         '{stage_4_handlers,__phase135_probe__}',
         '"live"'::jsonb
       )
       WHERE swarm_type = '${PROBE_SWARM}';
       -- If we reach here the trigger did NOT reject — force a rollback so the
       -- probe write never persists, and signal the failure via a sentinel.
       RAISE EXCEPTION '${SENTINEL}';
     END $$;`,
  );

  if (probe.ok) {
    // A DO block that always RAISEs can never return ok. If it does, something
    // is fundamentally off (e.g. statement silently swallowed).
    console.error(
      "UNEXPECTED: probe DO block returned success — it should always raise. " +
        "Treating as FAIL (trigger did not reject).",
    );
    process.exit(1);
  }

  const msg = probe.errorMessage ?? "";
  if (msg.includes(SENTINEL)) {
    console.error(
      "FAIL: the illegal handler=live UPDATE was ACCEPTED by the DB — the " +
        "trigger-stage invariant is NOT enforced (MODEL-04 violated). " +
        "(probe rolled back; nothing persisted)",
    );
    process.exit(1);
  }
  if (msg.toLowerCase().includes("gating invariant")) {
    console.log(
      "PASS: the illegal handler=live UPDATE was REJECTED by " +
        `${TRIGGER_NAME} (MODEL-04 enforced). Trigger message: ${msg.trim()}`,
    );
    process.exit(0);
  }

  console.error(
    `UNEXPECTED SQL error (neither sentinel nor invariant message): ${msg}`,
  );
  process.exit(2);
}

main().catch((e) => {
  console.error("trigger-smoke FAILED:", e);
  process.exit(2);
});
