#!/usr/bin/env tsx
/**
 * Phase 131 Plan 02 Task 2 (ROUTE-03) — manage the Orq `info-routing-coordinator`.
 *
 * One-off management script following the CANONICAL CLAUDE.md Orq workflow
 * (learnings cba7352b / f980a2a1 / 3970bad9 — see CLAUDE.md § Orq.ai), mirroring
 * web/scripts/orq/manage-sales-intent-agent.ts exactly:
 *
 *   1. list_models FIRST — validate the primary model + EVERY fallback id against
 *      the live catalog, throwing if any is absent (a bad id is accepted silently
 *      by PATCH and renders the Studio Model dropdown empty — f980a2a1). Match by
 *      the BARE model_id since /v2/models drops the provider prefix.
 *   2. create_agent with the BARE primary model id (create silently DROPS
 *      model.parameters.response_format — cba7352b).
 *   3. update_agent (PATCH) the FULL model.parameters: temperature 0, bounded
 *      max_tokens, the fallback chain under `model`, and the strict json_schema
 *      response_format — imported VERBATIM from coordinator-schema.ts so the
 *      agent's bucket enum and the Zod bucket enum read the SAME codegen'd
 *      DESTINATION_KEYS source (no drift). Nullable brand uses `anyOf` (3970bad9).
 *   4. get_agent to VERIFY persistence; print the agent id + the json_schema.
 *
 * The script does NOT create the json_schema TOOL RESOURCE — tool CRUD is
 * Studio-only (Pitfall 6). It PRINTS the json_schema for the operator to paste
 * into Studio → Tools → Add → JSON Schema, then set Model parameters → Response
 * Format = that schema.
 *
 * The bucket enum is NEVER hand-written here — it flows from
 * coordinator-schema.ts → routing-destinations.generated.ts (Plan 01 codegen).
 *
 * Run locally: `cd web && npx tsx scripts/orq/manage-info-routing-coordinator.ts`
 *   --finalize   also run create→PATCH→verify. Without it the script prints the
 *                json_schema + validates models, then stops (dry run).
 *
 * Env required (web/.env.local): ORQ_API_KEY (quotes stripped automatically).
 */

import { config as loadDotenv } from "dotenv";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  INFO_ROUTING_BUCKET_KEYS,
  INFO_ROUTING_RESPONSE_FORMAT,
} from "../../lib/automations/info-routing/coordinator-schema";

loadDotenv({ path: resolve(__dirname, "..", "..", ".env.local") });

const ORQ_API = "https://api.orq.ai/v2";
const ORQ_API_KEY = process.env.ORQ_API_KEY?.replace(/^"|"$/g, "");

const AGENT_KEY = "info-routing-coordinator";
const AGENT_ROLE = "Info Routing Stage 3 Destination Router";
// Project path where the agent is stored. The v2 /agents endpoint REQUIRES a
// `path` string (omitting it throws a ZodError: path expected string). The agent
// works identically regardless of folder; movable in Studio later.
const AGENT_PATH = "Default/Agents";

// Studio instructions (system layer). Versioned next to this script; the leading
// HTML-comment maintainer note is stripped before upload.
function loadInstructions(): string {
  const raw = readFileSync(
    resolve(__dirname, "info-routing-coordinator.instructions.md"),
    "utf8",
  );
  return raw.replace(/^<!--[\s\S]*?-->\s*/, "").trim();
}

// CLAUDE.md catalog (list_models-validated below). Haiku 4.5 EU high-volume
// classifier default + the standard fallback chain. MUST match the migration's
// model_config (20260617d) and the Discretion-3 model choice (A3).
const PRIMARY_MODEL = "aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0";
const FALLBACK_MODELS = [
  "openai/gpt-4o-mini",
  "google-ai/gemini-2.5-flash",
  "mistral/mistral-large-2411",
];

const MAX_TOKENS = 600;

function fail(msg: string): never {
  console.error(`✗ ${msg}`);
  process.exit(1);
}

async function orqFetch(
  path: string,
  init?: RequestInit,
): Promise<{ status: number; json: unknown; text: string }> {
  const res = await fetch(`${ORQ_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${ORQ_API_KEY}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const text = await res.text();
  let json: unknown = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    /* non-JSON body */
  }
  return { status: res.status, json, text };
}

// list_models FIRST — validate primary + every fallback (f980a2a1). The /v2/models
// catalog `model_id` is the BARE id WITHOUT the provider prefix, so we match by
// the segment after the last "/".
async function validateModels(): Promise<void> {
  console.log("→ list_models (validating primary + fallbacks)…");
  const { status, json, text } = await orqFetch("/models");
  if (status !== 200) {
    fail(
      `list_models failed: ${status} ${text.slice(0, 200)}. ` +
        `Cannot validate model ids — refusing to create/PATCH (f980a2a1).`,
    );
  }
  const rows = (
    Array.isArray(json) ? json : ((json as { data?: unknown[] })?.data ?? [])
  ) as Array<{ model_id?: string; id?: string; model?: string }>;
  const catalog = new Set(
    rows
      .map((r) => r.model_id ?? r.id ?? r.model)
      .filter(Boolean) as string[],
  );
  const bare = (m: string): string => {
    const slash = m.lastIndexOf("/");
    return slash >= 0 ? m.slice(slash + 1) : m;
  };
  const wanted = [PRIMARY_MODEL, ...FALLBACK_MODELS];
  const missing = wanted.filter((m) => !catalog.has(bare(m)));
  if (missing.length > 0) {
    fail(
      `model id(s) NOT in the Orq catalog: ${missing.join(", ")}. ` +
        `A bad id is accepted silently by PATCH and breaks the Studio Model ` +
        `dropdown (f980a2a1). Fix the ids against list_models before proceeding.`,
    );
  }
  console.log(`✓ all ${wanted.length} model ids present in the catalog.`);
}

async function createPatchVerify(): Promise<void> {
  // 2. create_agent with the BARE primary model id (create drops
  //    response_format — cba7352b). The v2 /agents endpoint REQUIRES
  //    key+role+instructions+settings; omitting any throws a ZodError.
  console.log(`→ create_agent ${AGENT_KEY} (bare model id)…`);
  const created = await orqFetch("/agents", {
    method: "POST",
    body: JSON.stringify({
      key: AGENT_KEY,
      model: PRIMARY_MODEL,
      role: AGENT_ROLE,
      path: AGENT_PATH,
      instructions: loadInstructions(),
      description:
        "Phase 131 — info-routing Stage 3 destination router (info@smeba.nl).",
      settings: { max_iterations: 1, max_execution_time: 15, max_cost: 0 },
    }),
  });
  if (created.status >= 300 && created.status !== 409) {
    fail(`create_agent failed: ${created.status} ${created.text.slice(0, 300)}`);
  }
  if (created.status === 409) {
    console.log("• agent already exists — proceeding to PATCH (idempotent).");
  }

  // 3. update_agent PATCH the FULL model.parameters + fallbacks + strict
  //    json_schema response_format (imported from coordinator-schema.ts).
  console.log("→ update_agent PATCH (full model.parameters + response_format)…");
  const patched = await orqFetch(`/agents/${AGENT_KEY}`, {
    method: "PATCH",
    body: JSON.stringify({
      model: {
        id: PRIMARY_MODEL,
        parameters: {
          temperature: 0,
          max_tokens: MAX_TOKENS,
          response_format: INFO_ROUTING_RESPONSE_FORMAT,
        },
        // Fallback chain + retry live under `model` (verified against the live
        // debtor-intent-agent). A ROOT-level fallback_models is silently dropped.
        fallback_models: FALLBACK_MODELS,
        retry: { count: 1, on_codes: [500, 502, 503, 504] },
      },
    }),
  });
  if (patched.status >= 300) {
    fail(`update_agent failed: ${patched.status} ${patched.text.slice(0, 300)}`);
  }

  // 4. get_agent to VERIFY persistence.
  console.log("→ get_agent (verify persistence)…");
  const got = await orqFetch(`/agents/${AGENT_KEY}`);
  if (got.status !== 200) {
    fail(`get_agent failed: ${got.status} ${got.text.slice(0, 300)}`);
  }
  const agent = got.json as {
    id?: string;
    key?: string;
    model?: { id?: string; parameters?: { response_format?: unknown } };
  };
  console.log(`✓ agent persisted: id=${agent.id ?? "?"} key=${agent.key ?? AGENT_KEY}`);
  console.log(`  model.id = ${agent.model?.id ?? "(missing!)"}`);
  console.log(
    `  response_format persisted = ${
      agent.model?.parameters?.response_format ? "YES" : "NO (re-check PATCH)"
    }`,
  );
  console.log(
    `\n→ Fill this id into supabase/migrations/20260617d_phase131_info_routing_coordinator_agent.sql\n` +
      `  (replace PLACEHOLDER_INFO_ROUTING_COORDINATOR_ID with: ${agent.id ?? "<id>"})`,
  );
}

async function main(): Promise<void> {
  if (!ORQ_API_KEY) fail("ORQ_API_KEY not set (web/.env.local).");

  const finalize = process.argv.includes("--finalize");

  // The bucket enum is the codegen'd single source (never hand-written). The
  // generated file always emits the 8-key info-routing array (Plan 01), so the
  // enum is guaranteed non-empty at the type level — assert it at runtime too in
  // case the generated file is ever hand-broken.
  const bucketCount: number = INFO_ROUTING_BUCKET_KEYS.length;
  if (bucketCount === 0) {
    fail(
      "info-routing bucket enum empty — routing_destinations not yet codegen'd. " +
        "Run `npm run codegen` after applying the Plan-01 registry migration.",
    );
  }

  // Always validate models first (cheap, catches typos early).
  await validateModels();

  // Print the planned json_schema so the operator can paste it into Studio.
  console.log(
    "\n--- json_schema (Studio → Tools → Add → JSON Schema; then Model " +
      "parameters → Response Format = this schema) ---",
  );
  console.log(JSON.stringify(INFO_ROUTING_RESPONSE_FORMAT, null, 2));
  console.log("--- end json_schema ---\n");
  console.log(`bucket enum (codegen, ${INFO_ROUTING_BUCKET_KEYS.length} keys): ${INFO_ROUTING_BUCKET_KEYS.join(", ")}`);

  if (!finalize) {
    console.log(
      "\n• Dry run complete (models validated, json_schema printed). " +
        "Re-run with --finalize to create→PATCH→verify the agent.",
    );
    return;
  }

  await createPatchVerify();
  console.log(`\n✓ ${AGENT_KEY} created/updated. Set the Studio json_schema Response Format next.`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
