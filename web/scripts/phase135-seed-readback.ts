#!/usr/bin/env tsx
/**
 * Phase 135 Plan 01 Task 3 (MIGRATE-03 / D-09 / threat T-135-Tamper) — seed read-back.
 *
 * Operator-runnable, NOT auto-applied. It reads (SELECT-only, never writes) the
 * LIVE project `mvqjhlxfvtqqubqgdvhz` and is meant to run ONLY inside 135-05's
 * gated apply window. It asserts each of the 4 swarms' post-migration
 * `gating_config` equals the verified-live normalization seed (D-09: no
 * deliberate behavior change at cutover; the seed encodes today's effective
 * state made explicit).
 *
 *   Exit 0  → every swarm's gating_config matches the expected seed (PASS), OR
 *             the migration is not yet applied (safe no-op skip — clear message).
 *   Exit 1  → any swarm mismatches (prints expected vs actual diff).
 *   Exit 2  → token missing / unexpected API error.
 *
 * ⚠️ EXPECTED_SEED is the locked target from 135-RESEARCH "4-Swarm
 * Normalization Seed" WITH the OQ-3 Path A resolution applied (sales archive
 * seeded HELD so sales derives Dry). Per 135-VALIDATION "Manual-Only
 * Verifications", RE-QUERY + reconfirm the live seed at apply time and update
 * this constant if 135-03 finalizes any value differently. This is the single
 * source the operator reconciles against — do not silently diverge.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... npx tsx web/scripts/phase135-seed-readback.ts
 *
 * Token via SUPABASE_ACCESS_TOKEN (web/.env.local / Management API). NEVER a
 * hardcoded service-role key (CLAUDE.md "Credentials vs Env Vars").
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const PROJECT_REF = "mvqjhlxfvtqqubqgdvhz";
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!token) {
  console.error(
    "SUPABASE_ACCESS_TOKEN missing (looked in web/.env.local and environment).",
  );
  process.exit(2);
}

type Json = null | boolean | number | string | Json[] | { [k: string]: Json };

// The verified-live normalization seed (135-RESEARCH table + OQ-3 Path A).
// Polarity: stage flags TRUE=blocked/held, FALSE=live; forward buckets
// TRUE=released; handlers tri-state off|dry|live.
const EXPECTED_SEED: Record<string, Json> = {
  // Dry: archive HELD (OQ-3 Path A — no wired archive), label live, no handlers.
  "sales-email": {
    stage_1_archive: true, // HELD (OQ-3 Path A)
    stage_1_cleanup: true, // held
    stage_2_resolution: true, // held
    stage_3_labeling: true, // held
    stage_3_routing: false, // LIVE (verified-live; D-09 no behavior change)
    stage_3_intent_label: false, // LIVE (Sugar deprecated → gate removed; sales=Dry)
    stage_4_handlers: {},
  },
  // Live: archive live + cleanup live (explicit handler, D-06), invoice-copy held.
  // stage_1_cleanup stage flag is live (false) so the live cleanup handler is
  // LEGAL under the trigger-stage invariant.
  "debtor-email": {
    stage_1_archive: false, // LIVE
    stage_1_cleanup: false, // LIVE (stage live so the cleanup handler may be live)
    stage_3_labeling: true, // held
    stage_3_routing: false, // LIVE
    stage_3_intent_label: false, // LIVE
    stage_4_handlers: { "invoice-copy": "dry", stage_1_cleanup: "live" },
  },
  // Live: archive live + released forward buckets; routing HELD (Pitfall 2).
  "info-routing": {
    stage_1_archive: false, // LIVE
    stage_3_routing: true, // HELD (Pitfall 2 — keep held; liveness via buckets)
    stage_4_forward_buckets: { verkoop: true, opleidingen: true },
  },
  // Shadow: dormant, every flag absent → fail-closed.
  "support-tickets": {},
};

const SWARMS = Object.keys(EXPECTED_SEED);

interface SqlResult {
  ok: boolean;
  rows: Array<Record<string, Json>> | null;
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
      rows: Array.isArray(parsed) ? (parsed as Array<Record<string, Json>>) : [],
      errorMessage: null,
    };
  }
  const msg =
    (parsed as { message?: string } | null)?.message ??
    (typeof parsed === "string" ? parsed : JSON.stringify(parsed));
  return { ok: false, rows: null, errorMessage: msg };
}

/** Canonical stringify with recursively sorted keys for stable deep-equality. */
function canonical(value: Json): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${canonical((value as { [k: string]: Json })[k])}`)
    .join(",")}}`;
}

async function main(): Promise<void> {
  // Pre-apply guard — no-op cleanly if the rename has not landed yet.
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

  const inList = SWARMS.map((s) => `'${s}'`).join(", ");
  const sel = await runSql(
    `SELECT swarm_type, gating_config
     FROM public.swarms
     WHERE swarm_type IN (${inList})
     ORDER BY swarm_type;`,
  );
  if (!sel.ok) {
    console.error(`Management API error reading swarms: ${sel.errorMessage}`);
    process.exit(2);
  }

  const actualByType = new Map<string, Json>();
  for (const row of sel.rows ?? []) {
    actualByType.set(row.swarm_type as string, (row.gating_config ?? {}) as Json);
  }

  let mismatches = 0;
  for (const swarm of SWARMS) {
    const expected = EXPECTED_SEED[swarm];
    if (!actualByType.has(swarm)) {
      console.error(`MISMATCH ${swarm}: row not found in public.swarms`);
      mismatches++;
      continue;
    }
    const actual = actualByType.get(swarm) as Json;
    if (canonical(actual) === canonical(expected)) {
      console.log(`OK       ${swarm}: gating_config matches seed`);
    } else {
      mismatches++;
      console.error(`MISMATCH ${swarm}:`);
      console.error(`  expected: ${canonical(expected)}`);
      console.error(`  actual:   ${canonical(actual)}`);
    }
  }

  if (mismatches > 0) {
    console.error(
      `\nseed-readback FAILED: ${mismatches}/${SWARMS.length} swarm(s) mismatch ` +
        "the verified seed (re-query + reconcile EXPECTED_SEED at apply time).",
    );
    process.exit(1);
  }
  console.log(`\nPASS: all ${SWARMS.length} swarms match the verified seed (D-09).`);
  process.exit(0);
}

main().catch((e) => {
  console.error("seed-readback FAILED:", e);
  process.exit(2);
});
