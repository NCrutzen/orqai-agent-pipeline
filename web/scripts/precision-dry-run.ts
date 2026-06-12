#!/usr/bin/env tsx
/**
 * Phase 91 precision dry-run harness (D-07 — the CARDINAL precision gate).
 *
 * READ-ONLY. This harness NEVER writes to any table (no .insert/.update/.delete/
 * .upsert; persistSession:false). It is the build-time, full-population instrument
 * that authorizes (a FUTURE) go-live: it runs the NEW SQL-backed AUTO tier
 * (self_auth + number back-search) over the WHOLE currently-UNRESOLVED debtor
 * population, reports the AUTO/SUGGEST distribution + safe-auto %, and computes a
 * Wilson-CI one-sided 99% LOWER BOUND over a hand-graded, identifier_kind-stratified
 * AUTO sample. The gate passes ONLY when that lower bound clears 0.99.
 *
 * WHY THE LOWER BOUND, NOT A POINT ESTIMATE (T-91-14, A3):
 *   A point estimate of precision can be falsely high on a small AUTO slice. The
 *   BINDING measurement is the Wilson one-sided 99% lower bound (z=2.326). If the
 *   AUTO slice is too small to clear 0.99, the gate correctly FAILS CLOSED
 *   ("not enough evidence — do not go live"). The normal-approx (Wald) interval is
 *   explicitly rejected (it under-covers near p=1); Wilson is used verbatim.
 *
 * SELF-AUTH vs NUMBER-SEARCH (the binding slice):
 *   self_auth decisions are correct-by-construction (the id is stamped by US — the
 *   exact id IS the direct customer) and are reported SEPARATELY at 100%. The
 *   BINDING gate is the number-search AUTO slice (method=identifier_match on the
 *   high-precision pre-pass) — that is where a wrong rollup could inject a confident
 *   wrong customer, so that is what the Wilson lower bound gates.
 *
 * DRY-RUN PRESERVED (D-05): this harness emits NO live labels / iController
 * side-effects. It only READS + GRADES. Going live (flipping debtor off
 * dry_run=true) is a SEPARATE phase. A passing gate here does NOT flip anything.
 *
 * FIRST REAL CALLER (T-91-15 / Pitfall 2): this is the FIRST full replay that calls
 * resolve_candidates. Until the operator builds the resolver-read Zap and lands its
 * catch-hook URL, the zapier_tools row's target_url is the PENDING_OPERATOR_ZAP_URL
 * placeholder (fails closed by design). This harness HARD-ABORTS up front on the
 * placeholder — grading against a dead endpoint would silently misreport precision.
 *
 * THE HAND-GRADED FIXTURE (the precision ground truth):
 *   The unresolved long-tail has NO operator label, so precision ground-truth
 *   requires human adjudication. The operator runs this harness once WITHOUT a
 *   fixture to emit the stratified AUTO sample (--emit-sample), hand-grades each
 *   decision correct/incorrect, then re-runs WITH the graded fixture
 *   (--sample <path>) so the harness computes the Wilson lower bound + gate result.
 *   Stratify by identifier_kind so each kind's precision is visible.
 *
 *   Fixture JSON shape (array; one entry per graded AUTO decision):
 *     [
 *       { "email_id": "…", "identifier_kind": "invoice_no",
 *         "customer_account_id": "100000", "correct": true },
 *       …
 *     ]
 *   `correct` is the operator's verdict (the resolved customer_account_id is the
 *   TRUE paying customer for that email). `identifier_kind` is the kind that drove
 *   the AUTO decision (carried in the harness's emitted sample so grading is keyed).
 *
 * Usage:
 *   # 1) emit the stratified AUTO sample for hand-grading (writes to stdout):
 *   cd web && npx tsx scripts/precision-dry-run.ts --emit-sample
 *   # 2) hand-grade → fixture.json, then run the gate:
 *   cd web && npx tsx scripts/precision-dry-run.ts --sample ./fixture.json
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
// Copied verbatim from scripts/equality-dry-run.ts:75-99. Loaded BEFORE the
// engine modules are imported (those modules read NEXT_PUBLIC_APP_URL /
// auth-secret envs at call time via nxt-zap-client).
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
// path (path alias `@/` configured in web/tsconfig.json; tsx honours it).
import { loadStage2Resolver } from "@/lib/swarms/dynamic";
import { selectBodyText } from "@/lib/agentic-pipeline/resolve/body-source";
import { extractSelfAuthCandidates } from "@/lib/automations/debtor-email/extract-self-auth";
import type {
  ResolveArgs,
  ResolveResult,
  EngineConfig,
} from "@/lib/agentic-pipeline/resolve/engine";
import type { ResolutionConfig } from "@/lib/agentic-pipeline/resolve/config";

// The placeholder the operator must replace with the real catch-hook URL before
// the substrate is readable (db/zapier-resolver/README.md step 5; T-90-06/T-90-21).
// UNLIKE the P0 equality harness (which only warned), THIS harness HARD-ABORTS:
// it is the first real caller of resolve_candidates, so a dead endpoint would
// silently misreport precision (the P1 TODO at equality-dry-run.ts:222-224).
const RESOLVE_CANDIDATES_TOOL_ID = "nxt.resolve_candidates";
const PENDING_PLACEHOLDER_URL = "PENDING_OPERATOR_ZAP_URL";

// ---------------------------------------------------------------------------
// Wilson score interval — one-sided 99% LOWER bound.
//
// z = 2.326 is the one-sided 99% standard-normal quantile (P(Z <= z) = 0.99).
// PINNED here as the gate constant: the cardinal constraint is a 99% lower bound,
// so we use the one-sided z, NOT the two-sided 2.576. Document + do not change
// without re-deriving the gate (T-91-14).
//
// Verbatim formula (91-RESEARCH §404-411 / 91-PATTERNS §216-220):
//   center      = (p̂ + z²/(2n)) / (1 + z²/n)
//   half_width  = (z / (1 + z²/n)) · sqrt( p̂(1−p̂)/n + z²/(4n²) )
//   lower_bound = center − half_width
//   GATE: lower_bound ≥ 0.99
// ---------------------------------------------------------------------------
const WILSON_Z = 2.326; // one-sided 99% (P(Z<=z)=0.99). PINNED — see header.
const PRECISION_GATE = 0.99;

function wilsonLowerBound(
  successes: number,
  n: number,
  z: number = WILSON_Z,
): number {
  if (n <= 0) return 0; // no evidence → fail closed (A3).
  const pHat = successes / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (pHat + z2 / (2 * n)) / denom;
  const halfWidth =
    (z / denom) * Math.sqrt((pHat * (1 - pHat)) / n + z2 / (4 * n * n));
  return center - halfWidth;
}

// ---------------------------------------------------------------------------
// AUTO classification.
//
// The high-precision AUTO tier emits exactly two methods (see self-auth-match.ts
// + identifier-match.ts runNumberBackSearchAuto):
//   - method = "self_auth"        → self-auth AUTO (correct-by-construction; 100%)
//   - method = "identifier_match" → number back-search AUTO (the BINDING slice)
// with a non-null customer_account_id AND confidence "high". Everything else
// (sender_match, thread_inheritance, llm_tiebreaker, unresolved, or a null id) is
// SUGGEST / unresolved — NOT an AUTO decision. The legacy single-hit
// identifier_match path also stamps confidence "high"; we restrict AUTO to results
// carrying environment_id (set ONLY on the new AUTO tier — engine.ts:142-148 /
// self-auth-match.ts:153 / identifier-match.ts:259) so the legacy invoice path is
// NOT miscounted as AUTO.
// ---------------------------------------------------------------------------
type AutoKind = "self_auth" | "number_search";

function classifyAuto(result: ResolveResult): AutoKind | null {
  if (result.customer_account_id == null) return null;
  if (result.confidence !== "high") return null;
  // environment_id is set ONLY on the new high-precision AUTO tier (D-02). The
  // legacy identifier_match single-hit path leaves it undefined.
  if (result.environment_id == null) return null;
  if (result.method === "self_auth") return "self_auth";
  if (result.method === "identifier_match") return "number_search";
  return null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface UnresolvedRow {
  email_id: string;
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

// One graded AUTO decision from the operator fixture.
interface GradedSample {
  email_id: string;
  identifier_kind: string; // the kind that drove the AUTO decision (for strata)
  customer_account_id: string | null;
  correct: boolean;
}

// One AUTO decision the harness produced (the row written to --emit-sample).
interface EmittedSample {
  email_id: string;
  auto_kind: AutoKind;
  method: ResolveMethodLite;
  identifier_kind: string; // first matched identifier kind label for stratification
  customer_account_id: string | null;
  customer_name: string | null;
  matched_identifiers: string[];
}

type ResolveMethodLite = ResolveResult["method"];

/**
 * Run the NEW SQL-backed AUTO-tier engine for one unresolved email and return the
 * result it would produce. FAITHFUL REPLAY of the Stage 2 worker's resolve step
 * (same loadStage2Resolver dispatch, same per-source body selection, same
 * per-mailbox brand_scope derivation, same resolveEntity(args, resolution_config)
 * call). The ONLY difference vs the worker: we classify + grade instead of
 * INSERTing an email_labels row — this harness writes NOTHING.
 *
 * Copied from equality-dry-run.ts:149-187; identical replay shape.
 */
async function runNewEngine(
  row: UnresolvedRow,
  settings: MailboxSettings,
  resolverPath: string,
  resolutionConfig: ResolutionConfig,
): Promise<ResolveResult> {
  const resolver = await loadStage2Resolver(resolverPath);
  if (!resolver) {
    throw new Error(
      `loadStage2Resolver("${resolverPath}") returned null — Router shape, cannot run the precision gate`,
    );
  }

  // Per-mailbox brand_scope (D-05 / RESL-06): widen the mailbox brand via
  // resolution_config.scope.brand_scope_by_mailbox, falling back to the mailbox's
  // own brand. Keyed by source_mailbox — IDENTICAL to the worker.
  const brandId = settings.brand_id;
  const mailboxKey = row.source_mailbox ?? "";
  const brandScope =
    resolutionConfig.scope.brand_scope_by_mailbox?.[mailboxKey] ??
    (brandId ? [brandId] : []);

  const args: ResolveArgs & { brand_scope?: string[] } = {
    nxt_database: settings.nxt_database ?? "",
    brand_id: brandId,
    conversation_id: row.conversation_id,
    from_email: row.sender_email,
    subject: row.subject ?? "",
    body_text: selectBodyText(row.source, row.body_full_text, row.body_text),
    brand_scope: brandScope,
  };

  // ResolutionConfig is the live registry shape; EngineConfig is what the engine
  // consumes (a structural subset — ResolutionScope is a superset of
  // EngineConfig.scope, which carries an index signature for forward-compat). The
  // runtime object IS a valid EngineConfig; the cast bridges the structural-typing
  // gap (same value, no narrowing). Mirrors the worker call-site.
  return resolver.resolveEntity(args, resolutionConfig as unknown as EngineConfig);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const argv = process.argv.slice(2);
  const emitSampleMode = argv.includes("--emit-sample");
  const sampleFlagIdx = argv.indexOf("--sample");
  const samplePath =
    sampleFlagIdx >= 0 ? argv[sampleFlagIdx + 1] : undefined;
  // --limit N: probe-only cap on the unresolved population (NOT for the binding
  // gate run — only to gauge the AUTO/resolve rate over a small slice cheaply).
  const limitFlagIdx = argv.indexOf("--limit");
  const limit =
    limitFlagIdx >= 0 ? parseInt(argv[limitFlagIdx + 1] ?? "", 10) : undefined;
  // --p1-probe: in-memory override of the live config to the P1 AUTO shape so the
  // probe can gauge the AUTO tier's recall WITHOUT mutating the live swarms row
  // (the live precedence-flip is the separate post-verdict step). Read-only.
  const p1Probe = argv.includes("--p1-probe");
  // --self-auth-only: process ONLY emails that yield a self-auth candidate, so
  // every Zap call exercises the self_auth tier (focused confirmation of self-auth
  // recall without re-running the whole population).
  const selfAuthOnly = argv.includes("--self-auth-only");

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

  console.log("# Phase 91 Precision Dry-Run (D-07 — CARDINAL precision gate)");
  console.log(`**Generated:** ${new Date().toISOString()}`);
  console.log("**Mode:** READ-ONLY — no writes to any table; dry_run preserved.");
  console.log(
    `**Gate:** Wilson-CI one-sided 99% lower bound (z=${WILSON_Z}) >= ${PRECISION_GATE} on the number-search AUTO slice.\n`,
  );

  // -------------------------------------------------------------------------
  // HARD-ABORT on the placeholder Zap URL (T-90-21 restored for P1). This is the
  // FIRST real caller of resolve_candidates — grading against a dead endpoint
  // would silently misreport precision. Fail LOUD, not closed-with-zeros.
  // -------------------------------------------------------------------------
  const { data: toolRow, error: toolErr } = await admin
    .from("zapier_tools")
    .select("tool_id, target_url, enabled")
    .eq("tool_id", RESOLVE_CANDIDATES_TOOL_ID)
    .maybeSingle();
  if (toolErr) {
    throw new Error(`zapier_tools load failed: ${toolErr.message}`);
  }
  const targetUrl = (toolRow as { target_url: string } | null)?.target_url;
  if (!targetUrl || targetUrl === PENDING_PLACEHOLDER_URL) {
    console.error(
      `\n**GATE: ABORT** — nxt.resolve_candidates.target_url is ` +
        `"${targetUrl ?? "<missing>"}" (the PENDING_OPERATOR_ZAP_URL placeholder).\n` +
        `This harness is the FIRST real caller of resolve_candidates. Build the ` +
        `resolver-read Zap and land its catch-hook URL in the zapier_tools row ` +
        `BEFORE running the precision gate (db/zapier-resolver/README.md steps 4-5). ` +
        `Refusing to grade against a dead endpoint.`,
    );
    process.exit(3);
  }
  if ((toolRow as { enabled?: boolean } | null)?.enabled === false) {
    console.error(
      `\n**GATE: ABORT** — nxt.resolve_candidates is disabled in zapier_tools. ` +
        `Enable it before running the precision gate.`,
    );
    process.exit(3);
  }
  console.log(`**resolve_candidates URL:** set (live caller). ✓\n`);

  // -------------------------------------------------------------------------
  // Load the debtor swarm row: the dispatch pointer (stage2_entity_resolver) +
  // the resolution_config the engine reads (incl. the D-10 precedence + the
  // populated auto_safe_kinds that enable the AUTO tier).
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
      "swarms.resolution_config is NULL for debtor-email — the engine needs config.precedence",
    );
  }
  // --p1-probe: override the live (P0) config to the P1 AUTO shape IN MEMORY ONLY
  // (no DB write — the live swarms row is untouched). Lets the probe exercise the
  // self_auth + number back-search AUTO tiers to gauge recall before the live flip.
  if (p1Probe) {
    resolutionConfig.precedence = [
      "self_auth",
      "identifier_match",
      "sender_match",
      "thread_inheritance",
    ];
    resolutionConfig.auto_safe_kinds = [
      "customer_no",
      "site_no",
      "invoice_no",
      "po_no",
      "order_no",
      "job_no",
      "quote_no",
      "previous_customer_id",
    ];
    console.log(
      "**⚠️ --p1-probe ACTIVE:** in-memory P1 config override (precedence + " +
        "auto_safe_kinds). The live swarms.resolution_config row is UNCHANGED " +
        "(read-only). Measures the AUTO tier's recall before the live flip.\n",
    );
  }

  console.log(`**Dispatch pointer (under test):** ${resolverPath}`);
  console.log(
    `**resolution_config precedence:** ${JSON.stringify(resolutionConfig.precedence)}`,
  );
  console.log(
    `**auto_safe_kinds:** ${JSON.stringify(resolutionConfig.auto_safe_kinds ?? [])}\n`,
  );
  if ((resolutionConfig.auto_safe_kinds ?? []).length === 0) {
    console.log(
      "**Note:** auto_safe_kinds is empty — the AUTO tier will emit ZERO AUTO " +
        "decisions (RESL-03 no-op). The gate will report not-enough-evidence " +
        "until the live row populates the self-auth/number kinds.\n",
    );
  }

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
  // Load the currently-UNRESOLVED population (customer_account_id IS NULL).
  // CHANGE vs equality-dry-run.ts:305-310 — that grades the labeled set; THIS
  // harness measures NEW recall + precision over the unresolved long-tail.
  // -------------------------------------------------------------------------
  const { data: labels, error: labelErr } = await admin
    .schema("debtor")
    .from("email_labels")
    .select("email_id, customer_account_id, source_mailbox, conversation_id")
    .is("customer_account_id", null);
  if (labelErr) {
    throw new Error(`email_labels load failed: ${labelErr.message}`);
  }

  const labelRows = (labels ?? []) as Array<{
    email_id: string;
    customer_account_id: string | null;
    source_mailbox: string | null;
    conversation_id: string | null;
  }>;
  console.log(`**Currently-unresolved population:** ${labelRows.length}\n`);

  // --limit probe cap: process only the first N of the unresolved population.
  const workRows =
    limit && limit > 0 ? labelRows.slice(0, limit) : labelRows;
  if (limit && limit > 0) {
    console.log(
      `**⚠️ --limit ACTIVE (probe, NOT the binding gate):** processing first ` +
        `${workRows.length} of ${labelRows.length} unresolved rows.\n`,
    );
  }

  // Counters — overall + per AUTO kind + per identifier_kind strata.
  let processed = 0;
  let skippedNoEmail = 0;
  let skippedNoSettings = 0;
  let autoSelfAuth = 0;
  let autoNumberSearch = 0;
  let suggestOrUnresolved = 0;
  // strata: identifier_kind → count of number-search AUTO decisions
  const numberSearchByKind = new Map<string, number>();
  // the emitted AUTO sample (for --emit-sample → hand-grading).
  const emitted: EmittedSample[] = [];

  for (const label of workRows) {
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

    if (selfAuthOnly) {
      const sa = extractSelfAuthCandidates(
        e.subject,
        selectBodyText(
          e.source ?? null,
          e.body_full_text ?? null,
          e.body_text ?? null,
        ),
      );
      if (sa.candidates.length === 0) continue; // not a self-auth email — skip
    }

    const mailboxKey = label.source_mailbox ?? "";
    const settings = settingsByMailbox.get(mailboxKey);
    if (!settings || !settings.nxt_database) {
      // No NXT context → the worker would only reach thread-inheritance, never
      // the NXT engine. Not part of the AUTO-tier population.
      skippedNoSettings++;
      continue;
    }

    const row: UnresolvedRow = {
      email_id: label.email_id,
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
    processed++;

    const autoKind = classifyAuto(result);
    if (autoKind === "self_auth") {
      autoSelfAuth++;
    } else if (autoKind === "number_search") {
      autoNumberSearch++;
    } else {
      suggestOrUnresolved++;
      continue;
    }

    // AUTO decision — record for stratification + the emitted sample.
    const matched =
      "matched_identifiers" in result.inputs
        ? result.inputs.matched_identifiers
        : [];
    // identifier_kind label for strata: number-search is the binding slice; we
    // surface the result method as the strata key when a finer kind is absent.
    // (The operator's hand-graded fixture carries the authoritative kind per row;
    // here we tag with the AUTO kind + first matched identifier for traceability.)
    const kindLabel =
      autoKind === "number_search" ? "number_search" : "self_auth";
    if (autoKind === "number_search") {
      numberSearchByKind.set(
        kindLabel,
        (numberSearchByKind.get(kindLabel) ?? 0) + 1,
      );
    }
    emitted.push({
      email_id: row.email_id,
      auto_kind: autoKind,
      method: result.method,
      identifier_kind: kindLabel,
      customer_account_id: result.customer_account_id,
      customer_name: result.customer_name,
      matched_identifiers: matched,
    });
  }

  const autoTotal = autoSelfAuth + autoNumberSearch;
  const safeAutoPct =
    processed > 0 ? ((autoTotal / processed) * 100).toFixed(1) : "0.0";

  console.log("## Distribution (full unresolved population)\n");
  console.log(`**Processed (NXT-eligible):** ${processed}`);
  console.log(
    `**Skipped (no email row):** ${skippedNoEmail}  ` +
      `**Skipped (no NXT settings):** ${skippedNoSettings}`,
  );
  console.log(`**AUTO total:** ${autoTotal}  (safe-auto ${safeAutoPct}% of processed)`);
  console.log(`  - self_auth AUTO:      ${autoSelfAuth}  (reported separately at 100%, correct-by-construction)`);
  console.log(`  - number-search AUTO:  ${autoNumberSearch}  (the BINDING gate slice)`);
  console.log(`**SUGGEST / unresolved:** ${suggestOrUnresolved}\n`);

  // -------------------------------------------------------------------------
  // --emit-sample: print the stratified AUTO sample for hand-grading and STOP
  // (no gate yet — the gate needs the graded fixture). Self-auth rows are emitted
  // too (they're audited at 100%); the operator grades the number-search slice.
  // -------------------------------------------------------------------------
  if (emitSampleMode) {
    console.log("## AUTO sample for hand-grading (stratify by identifier_kind)\n");
    console.log(
      "Copy the JSON below to a fixture file, hand-grade each `correct` (the " +
        "resolved customer_account_id is the TRUE paying customer for that email), " +
        "then re-run with `--sample <path>`. The number-search slice is the gate.\n",
    );
    const fixtureSkeleton: GradedSample[] = emitted.map((s) => ({
      email_id: s.email_id,
      identifier_kind: s.identifier_kind,
      customer_account_id: s.customer_account_id,
      correct: false, // operator flips to true/false per row
    }));
    console.log("```json");
    console.log(JSON.stringify(fixtureSkeleton, null, 2));
    console.log("```\n");
    console.log("### Per-AUTO-decision detail (for the grader)\n");
    for (const s of emitted) {
      console.log(
        `- email_id=${s.email_id} kind=${s.identifier_kind} method=${s.method} ` +
          `customer=${s.customer_account_id} (${s.customer_name ?? ""}) ` +
          `ids=${JSON.stringify(s.matched_identifiers)}`,
      );
    }
    console.log(
      "\n**No gate computed** (—emit-sample). Hand-grade, then re-run with --sample.",
    );
    process.exit(0);
  }

  // -------------------------------------------------------------------------
  // Gate: load the hand-graded fixture, compute the Wilson lower bound on the
  // number-search AUTO slice (the BINDING measurement). Self-auth reported at
  // 100% separately (correct-by-construction).
  // -------------------------------------------------------------------------
  if (!samplePath) {
    console.error(
      "\n**GATE: NOT RUN** — no --sample <fixture> provided. Run with " +
        "`--emit-sample` first to produce the stratified AUTO sample, hand-grade it, " +
        "then re-run with `--sample <path>` to compute the Wilson lower bound.",
    );
    process.exit(4);
  }

  let graded: GradedSample[];
  try {
    const raw = readFileSync(resolve(process.cwd(), samplePath), "utf8");
    graded = JSON.parse(raw) as GradedSample[];
  } catch (err) {
    throw new Error(
      `failed to read/parse --sample fixture "${samplePath}": ${err instanceof Error ? err.message : err}`,
    );
  }
  if (!Array.isArray(graded)) {
    throw new Error(`--sample fixture must be a JSON array of graded decisions`);
  }

  // The BINDING slice = number-search AUTO decisions. Self-auth rows in the
  // fixture are reported separately. We key the fixture by email_id and only
  // count rows the harness actually classified as number-search AUTO this run, so
  // a stale fixture cannot inflate the denominator.
  const numberSearchEmailIds = new Set(
    emitted.filter((s) => s.auto_kind === "number_search").map((s) => s.email_id),
  );
  const selfAuthEmailIds = new Set(
    emitted.filter((s) => s.auto_kind === "self_auth").map((s) => s.email_id),
  );

  // Stratify the graded number-search slice by identifier_kind.
  const byKind = new Map<string, { n: number; correct: number }>();
  let nsN = 0;
  let nsCorrect = 0;
  let selfAuthGradedN = 0;
  let selfAuthGradedCorrect = 0;
  for (const g of graded) {
    if (numberSearchEmailIds.has(g.email_id)) {
      nsN++;
      if (g.correct) nsCorrect++;
      const k = g.identifier_kind || "(unknown)";
      const cur = byKind.get(k) ?? { n: 0, correct: 0 };
      cur.n++;
      if (g.correct) cur.correct++;
      byKind.set(k, cur);
    } else if (selfAuthEmailIds.has(g.email_id)) {
      selfAuthGradedN++;
      if (g.correct) selfAuthGradedCorrect++;
    }
    // graded rows for emails NOT classified AUTO this run are ignored (stale).
  }

  console.log("## Wilson-CI gate (number-search AUTO slice — BINDING)\n");
  console.log(
    `**z:** ${WILSON_Z} (one-sided 99%, P(Z<=z)=0.99) — PINNED. ` +
      `Two-sided 2.576 NOT used; Wald NOT used (under-covers near p=1).\n`,
  );

  // Per-kind strata report (visibility — the gate is on the aggregate slice).
  if (byKind.size > 0) {
    console.log("### Per-identifier_kind (graded number-search AUTO)\n");
    for (const [k, v] of Array.from(byKind.entries()).sort()) {
      const lb = wilsonLowerBound(v.correct, v.n);
      console.log(
        `- ${k}: ${v.correct}/${v.n} correct — Wilson lower bound ${lb.toFixed(4)}`,
      );
    }
    console.log("");
  }

  if (selfAuthGradedN > 0) {
    const pct = ((selfAuthGradedCorrect / selfAuthGradedN) * 100).toFixed(1);
    console.log(
      `**self_auth slice (separate, correct-by-construction):** ` +
        `${selfAuthGradedCorrect}/${selfAuthGradedN} graded correct (${pct}%).\n`,
    );
  }

  const lowerBound = wilsonLowerBound(nsCorrect, nsN);
  const pointEstimate = nsN > 0 ? nsCorrect / nsN : 0;
  console.log(
    `**Number-search AUTO slice:** ${nsCorrect}/${nsN} graded correct ` +
      `(point estimate ${(pointEstimate * 100).toFixed(2)}%).`,
  );
  console.log(
    `**Wilson one-sided 99% lower bound:** ${lowerBound.toFixed(4)}  ` +
      `(gate threshold ${PRECISION_GATE}).\n`,
  );

  if (nsN === 0) {
    console.error(
      `**GATE: FAIL (not enough evidence)** — zero graded number-search AUTO ` +
        `decisions. The AUTO slice is empty or the fixture grades no number-search ` +
        `rows. Do NOT go live (A3 — fail closed). dry_run stays true.`,
    );
    process.exit(1);
  }
  if (lowerBound < PRECISION_GATE) {
    console.error(
      `**GATE: FAIL** — Wilson lower bound ${lowerBound.toFixed(4)} < ${PRECISION_GATE}. ` +
        `Either precision is below 99% OR the sample (n=${nsN}) is too small to ` +
        `clear the bound. Either way: NOT enough evidence to authorize go-live ` +
        `(A3 — fail closed). dry_run stays true.`,
    );
    process.exit(1);
  }

  console.log(
    `**GATE: PASS** — Wilson lower bound ${lowerBound.toFixed(4)} >= ${PRECISION_GATE} ` +
      `over n=${nsN} hand-graded number-search AUTO decisions. The cardinal ` +
      `precision constraint is cleared. NOTE: this AUTHORIZES a future go-live but ` +
      `does NOT flip anything — debtor stays dry_run=true (D-05); the flip is a ` +
      `separate phase.`,
  );
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
