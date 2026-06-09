#!/usr/bin/env tsx
/**
 * Phase 90 equality dry-run harness (D-06 cutover gate). Ported to main in 90-07.
 *
 * READ-ONLY. This harness NEVER writes to any table (no .insert/.update/.delete/
 * .upsert; persistSession:false). It is the gate that protects the cardinal
 * ≥99%-precision bar: before debtor's resolution_config is re-applied (the
 * re-cutover that moves debtor onto the SQL-backed engine), it proves the new
 * engine returns the SAME `customer_account_id` for the set we ALREADY resolve
 * correctly.
 *
 * What it gates — BEHAVIOUR-NEUTRALITY (old == new), NOT new recall.
 *   This is an old-vs-new equality check over the currently-correct resolves.
 *   It is DISTINCT from P1's full-population Wilson-CI ≥99% precision dry-run —
 *   that is a different harness, owned by a later phase. A 0-regression result
 *   here does NOT claim improved recall; it claims the cutover does not regress
 *   the resolves we already get right (the cardinal-constraint gate, T-90-18).
 *
 * Contract (D-06):
 *   - Sample = the currently-correct resolves:
 *       debtor.email_labels WHERE customer_account_id IS NOT NULL
 *       AND status IN ('labeled','dry_run'), joined to email_pipeline.emails
 *       for the resolver inputs (conversation_id, subject, body_text /
 *       body_full_text, sender_email, source, mailbox), plus each row's
 *       source_mailbox → debtor.labeling_settings (nxt_database, brand_id).
 *   - For each row: build the SAME ResolveArgs the Stage 2 worker builds
 *     (per-source body via selectBodyText, brand_id via the 90-07 derivation:
 *     config.scope.brand_scope[0] ?? per-mailbox labeling_settings brand), then
 *     dispatch through loadStage2Resolver(swarm.stage2_entity_resolver) →
 *     resolveEntity(args, resolution_config). That runs the NEW engine. Compare
 *     result.customer_account_id to the stored one.
 *   - Threshold: EXACT equality on EVERY row → 0 regressions. Any mismatch prints
 *       REGRESSION email_id=… stored=… new=… method=…
 *     and the script exits non-zero (blocks the re-cutover).
 *
 * PREREQUISITE — debtor.resolution_config must be STAGED (non-null) for this run.
 *   It was reverted to NULL on 2026-06-09 (the prod mitigation that put debtor
 *   back on the legacy path). To run the gate, stage the full debtor config
 *   (precedence + scope) on the swarms row WITHOUT yet relying on it for live
 *   dispatch, run this harness, and only on GATE: PASS apply the re-cutover.
 *   See .planning/phases/90-p0-resolver-substrate-bugfixes/90-07-PLAN.md (Tasks 3–4).
 *
 * P0 note (was the T-90-21 hard guard): the P0 engine resolves via the EXISTING
 * sender / identifier / candidate-details tools — it does NOT call
 * nxt.resolve_candidates (that materialized-index tool is forward-compat config,
 * exercised only in P1/P2). So the resolver-read Zap's catch-hook URL is NOT a
 * prerequisite for this P0 behaviour-neutrality gate; we log its status for
 * visibility but do NOT abort on the placeholder.
 *
 * Usage:
 *   cd web && npm run dry-run:equality
 *
 * Env (loaded from web/.env.local):
 *   - NEXT_PUBLIC_SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - NEXT_PUBLIC_APP_URL          (callback_url base for the async Zap path)
 *   - DEBTOR_FETCH_WEBHOOK_SECRET  (or the tool's configured auth secret env)
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
// This script lives at web/scripts/ → web root is one level up.
const WEB_ROOT = resolve(__dirname, "..");

// ---------------------------------------------------------------------------
// Env loader (web/.env.local, no dotenv dep — minimal parser).
// Mirrors scripts/phase-89-shadow-eval.ts. Loaded BEFORE the engine modules
// are imported (those modules read NEXT_PUBLIC_APP_URL / auth-secret envs at
// call time via nxt-zap-client).
// ---------------------------------------------------------------------------
function loadEnvLocal(): void {
  const envPath = resolve(WEB_ROOT, ".env.local");
  let raw: string;
  try {
    raw = readFileSync(envPath, "utf8");
  } catch {
    return;
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

// Engine + dispatch + per-source body helper — imported via the same module
// graph the Stage 2 worker uses, so the dry-run runs the IDENTICAL resolution
// path. (Path alias `@/` is configured in web/tsconfig.json; tsx honours it.)
import { loadStage2Resolver } from "@/lib/swarms/dynamic";
import { selectBodyText } from "@/lib/agentic-pipeline/resolve/body-source";
import type {
  ResolveArgs,
  ResolveResult,
} from "@/lib/agentic-pipeline/resolve/engine";
import type { ResolutionConfig } from "@/lib/agentic-pipeline/resolve/config";

// The placeholder the operator must replace with the real catch-hook URL before
// the substrate is readable (db/zapier-resolver/README.md step 5; T-90-06/T-90-21).
const RESOLVE_CANDIDATES_TOOL_ID = "nxt.resolve_candidates";
const PENDING_PLACEHOLDER_URL = "PENDING_OPERATOR_ZAP_URL";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface CurrentlyCorrectResolve {
  email_id: string;
  stored_customer_account_id: string;
  source_mailbox: string | null;
  conversation_id: string | null;
  subject: string | null;
  body_text: string | null;
  body_full_text: string | null;
  sender_email: string | null;
  source: string | null;
  mailbox: string | null;
}

interface MailboxSettings {
  nxt_database: string | null;
  brand_id: string | null;
}

/**
 * Run the NEW SQL-backed engine for one currently-correct resolve and return the
 * customer_account_id it would produce.
 *
 * This is a FAITHFUL REPLAY of the Stage 2 worker's resolve step
 * (lib/inngest/functions/stage-2-customer-resolver.ts): same loadStage2Resolver
 * dispatch, same per-source body selection, same 90-07 brand_id derivation
 * (config.scope.brand_scope[0] ?? per-mailbox labeling_settings brand), same
 * resolveEntity(args, resolution_config) call. The only difference is we COMPARE
 * the result to the stored value instead of INSERTing an email_labels row — this
 * harness writes nothing.
 */
async function runNewEngine(
  row: CurrentlyCorrectResolve,
  settings: MailboxSettings,
  resolverPath: string,
  resolutionConfig: ResolutionConfig,
): Promise<ResolveResult> {
  const resolver = await loadStage2Resolver(resolverPath);
  if (!resolver) {
    // A null resolver only happens for a NULL pointer (Router shape). The debtor
    // swarm always has a non-null pointer, so this is a hard misconfiguration.
    throw new Error(
      `loadStage2Resolver("${resolverPath}") returned null — Router shape, cannot run the equality gate`,
    );
  }

  // 90-07 brand_id derivation — MUST match the worker exactly
  // (stage-2-customer-resolver.ts): the generic path prefers config-sourced
  // brand_scope[0], falling back to the per-mailbox labeling_settings brand. For
  // debtor brand_scope is null so this reduces to the labeling_settings brand —
  // but mirror the worker precisely so the gate never drifts from production.
  const brandId = settings.brand_id;
  const mailboxKey = row.source_mailbox ?? "";
  const genericBrandId = resolutionConfig.scope.brand_scope?.[0] ?? null;
  const effectiveBrandId = genericBrandId ?? brandId;

  // Per-mailbox brand_scope ARRAY (D-05 / RESL-06): forward-compat for the
  // resolve_candidates @brand_scope tiebreaker (P1); the P0 ported steps ignore
  // it. Keyed by source_mailbox, falling back to the effective brand.
  const brandScope =
    resolutionConfig.scope.brand_scope_by_mailbox?.[mailboxKey] ??
    (effectiveBrandId ? [effectiveBrandId] : []);

  const args: ResolveArgs & { brand_scope?: string[] } = {
    nxt_database: settings.nxt_database ?? "",
    brand_id: effectiveBrandId,
    conversation_id: row.conversation_id,
    from_email: row.sender_email,
    subject: row.subject ?? "",
    // RESL-16 item 3 — per-source body. zapier-debtor-ingest carries the quoted
    // thread in body_full_text; outlook/sugarcrm use body_text.
    body_text: selectBodyText(row.source, row.body_full_text, row.body_text),
    brand_scope: brandScope,
  };

  return resolver.resolveEntity(args, resolutionConfig);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (loaded from web/.env.local)",
    );
  }

  // READ-ONLY client. persistSession:false — no auth state is written anywhere.
  const admin: SupabaseClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  console.log("# Phase 90 Equality Dry-Run (D-06 cutover gate)");
  console.log(`**Generated:** ${new Date().toISOString()}`);
  console.log("**Mode:** READ-ONLY — no writes to any table.");
  console.log(
    "**Gates:** BEHAVIOUR-NEUTRALITY (old == new). NOT P1's recall/precision dry-run.\n",
  );

  // -------------------------------------------------------------------------
  // P0 NOTE (was the T-90-21 hard guard): the P0 engine resolves via the EXISTING
  // sender / identifier / candidate-details tools (engine.ts + steps/*). It does
  // NOT call nxt.resolve_candidates — that materialized-index tool is wired as
  // forward-compat config and is only EXERCISED in P1/P2. So the resolver-read
  // Zap's catch-hook URL is NOT a prerequisite for this P0 behaviour-neutrality
  // gate; we log its status for visibility but do NOT abort on the placeholder.
  // -------------------------------------------------------------------------
  const { data: toolRow } = await admin
    .from("zapier_tools")
    .select("tool_id, target_url, enabled")
    .eq("tool_id", RESOLVE_CANDIDATES_TOOL_ID)
    .maybeSingle();
  const targetUrl = (toolRow as { target_url: string } | null)?.target_url;
  if (!targetUrl || targetUrl === PENDING_PLACEHOLDER_URL) {
    console.log(
      `**Note:** nxt.resolve_candidates.target_url is "${targetUrl ?? "<missing>"}" — ` +
        `not used by the P0 engine (it resolves via sender/identifier/candidate-details). ` +
        `Build the resolver-read Zap before P1.\n`,
    );
  } else {
    console.log(`**resolve_candidates URL:** set (P1-ready).\n`);
  }

  // -------------------------------------------------------------------------
  // Load the swarm row: the dispatch pointer (stage2_entity_resolver) + the
  // resolution_config the engine reads. We read it directly (not via loadSwarm,
  // which needs createAdminClient env wiring) — same column source.
  // -------------------------------------------------------------------------
  const { data: swarmRow, error: swarmErr } = await admin
    .from("swarms")
    .select("swarm_type, stage2_entity_resolver, resolution_config, enabled")
    .eq("swarm_type", "debtor-email")
    .maybeSingle();
  if (swarmErr) {
    throw new Error(`swarms load failed: ${swarmErr.message}`);
  }
  const swarm = swarmRow as {
    stage2_entity_resolver: string | null;
    resolution_config: ResolutionConfig | null;
  } | null;
  if (!swarm) {
    throw new Error("debtor-email swarm row not found");
  }
  const resolverPath = swarm.stage2_entity_resolver;
  const resolutionConfig = swarm.resolution_config;
  if (!resolverPath) {
    throw new Error(
      "swarms.stage2_entity_resolver is NULL for debtor-email (Router shape) — nothing to grade",
    );
  }
  if (!resolutionConfig) {
    throw new Error(
      "swarms.resolution_config is NULL for debtor-email — STAGE the debtor config " +
        "(precedence + scope) before running the gate. It was reverted to NULL on " +
        "2026-06-09 (prod mitigation). See 90-07-PLAN.md Task 3.",
    );
  }
  console.log(`**Dispatch pointer (under test):** ${resolverPath}`);
  console.log(
    `**resolution_config precedence:** ${JSON.stringify(resolutionConfig.precedence)}\n`,
  );

  // -------------------------------------------------------------------------
  // Per-mailbox labeling_settings (nxt_database, brand_id), keyed by
  // source_mailbox — the exact lookup the worker does per email.
  // -------------------------------------------------------------------------
  const { data: settingsRows, error: settingsErr } = await admin
    .schema("debtor")
    .from("labeling_settings")
    .select("source_mailbox, nxt_database, brand_id");
  if (settingsErr) {
    throw new Error(`labeling_settings load failed: ${settingsErr.message}`);
  }
  const settingsByMailbox = new Map<string, MailboxSettings>();
  for (const s of (settingsRows ?? []) as Array<{
    source_mailbox: string;
    nxt_database: string | null;
    brand_id: string | null;
  }>) {
    settingsByMailbox.set(s.source_mailbox, {
      nxt_database: s.nxt_database,
      brand_id: s.brand_id,
    });
  }

  // -------------------------------------------------------------------------
  // Load the currently-correct resolves (the population we must not regress).
  // -------------------------------------------------------------------------
  const { data: labels, error: labelErr } = await admin
    .schema("debtor")
    .from("email_labels")
    .select("email_id, customer_account_id, source_mailbox, conversation_id")
    .not("customer_account_id", "is", null)
    .in("status", ["labeled", "dry_run"]);
  if (labelErr) {
    throw new Error(`email_labels load failed: ${labelErr.message}`);
  }

  const labelRows = (labels ?? []) as Array<{
    email_id: string;
    customer_account_id: string;
    source_mailbox: string | null;
    conversation_id: string | null;
  }>;
  console.log(`**Currently-correct resolves:** ${labelRows.length}\n`);

  // Join to email_pipeline.emails for the resolver inputs, run the new engine,
  // and compare. Per-row fetch keeps the harness simple + auditable; the set is
  // small (low correctly-resolved volume — see runbook step 8).
  let regressions = 0;
  let compared = 0;
  let skippedNoEmail = 0;
  let skippedNoSettings = 0;
  for (const label of labelRows) {
    const { data: email, error: emailErr } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select(
        "id, conversation_id, subject, body_text, body_full_text, sender_email, source, mailbox",
      )
      .eq("id", label.email_id)
      .maybeSingle();
    if (emailErr) {
      throw new Error(
        `emails load failed for ${label.email_id}: ${emailErr.message}`,
      );
    }
    const e = email as {
      id: string;
      conversation_id: string | null;
      subject: string | null;
      body_text: string | null;
      body_full_text: string | null;
      sender_email: string | null;
      source: string | null;
      mailbox: string | null;
    } | null;
    if (!e) {
      skippedNoEmail++;
      continue;
    }

    const mailboxKey = label.source_mailbox ?? "";
    const settings = settingsByMailbox.get(mailboxKey);
    if (!settings || !settings.nxt_database) {
      // No NXT context for this mailbox → the worker would only reach
      // thread-inheritance, never the NXT engine. These rows are not part of the
      // NXT-resolved population the cutover affects; record + skip so the gate
      // grades only the resolves the new substrate actually drives.
      skippedNoSettings++;
      continue;
    }

    const row: CurrentlyCorrectResolve = {
      email_id: label.email_id,
      stored_customer_account_id: label.customer_account_id,
      source_mailbox: label.source_mailbox,
      conversation_id: e.conversation_id ?? label.conversation_id,
      subject: e.subject,
      body_text: e.body_text,
      body_full_text: e.body_full_text,
      sender_email: e.sender_email,
      source: e.source,
      mailbox: e.mailbox,
    };

    const result = await runNewEngine(
      row,
      settings,
      resolverPath,
      resolutionConfig,
    );
    compared++;
    if (result.customer_account_id !== row.stored_customer_account_id) {
      regressions++;
      console.log(
        `REGRESSION email_id=${row.email_id} stored=${row.stored_customer_account_id} ` +
          `new=${result.customer_account_id} method=${result.method}`,
      );
    }
  }

  console.log(`\n**Compared:** ${compared}`);
  console.log(
    `**Skipped (no email row):** ${skippedNoEmail}  ` +
      `**Skipped (no NXT settings — thread-inheritance-only mailbox):** ${skippedNoSettings}`,
  );
  console.log(`**Regressions:** ${regressions}`);
  if (regressions > 0) {
    console.log(
      `\n**GATE: FAIL** — ${regressions} regression(s). Do NOT re-cutover. ` +
        `Triage each REGRESSION line (likely a seed/scope mismatch or an unported behaviour).`,
    );
    process.exit(1);
  }
  console.log(
    `\n**GATE: PASS** — ${compared} rows, 0 regressions. Safe to re-cutover (re-apply debtor resolution_config).`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
