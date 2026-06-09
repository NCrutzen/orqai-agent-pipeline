#!/usr/bin/env tsx
/**
 * Phase 113 Plan 03 Task 2 (D-13) — manage the Orq `sales-intent-agent`.
 *
 * One-off management script following the CANONICAL CLAUDE.md Orq workflow
 * (learnings cba7352b / f980a2a1 / 3970bad9 — see CLAUDE.md § Orq.ai):
 *
 *   1. list_models FIRST — validate the primary model + EVERY fallback id
 *      against the live catalog, throwing if any is absent (a bad id is
 *      accepted silently by PATCH and renders the Studio Model dropdown empty).
 *   2. create_agent with the BARE primary model id (create silently DROPS
 *      model.parameters.response_format — cba7352b).
 *   3. update_agent (PATCH) the FULL model.parameters: temperature 0, bounded
 *      max_tokens (~1000), the fallback chain at agent ROOT level, and the
 *      strict json_schema response_format mirroring salesIntentOutputSchema
 *      with `anyOf` for EVERY nullable (NEVER the ["string","null"] shorthand —
 *      3970bad9).
 *   4. get_agent to VERIFY persistence; print the agent id + the json_schema.
 *
 * The intent enum is sourced from SWARM_INTENTS_BY_SWARM["sales-email"] (the ONE
 * codegen map). It is EMPTY until Plan 04 seeds swarm_intents + reruns codegen,
 * so this script REFUSES to finalize a real agent json_schema with an empty
 * enum: it prints a clear message and exits non-zero. In this plan the agent is
 * created as a SHELL so the bootstrap retro can run a discovery-grade pass; the
 * FULL agent (real non-empty enum) is finalized in Plan 04 post-seed+codegen.
 *
 * The script does NOT create the json_schema TOOL RESOURCE — tool CRUD is
 * Studio-only (D-13 / Pitfall 6). It PRINTS the json_schema for the operator to
 * paste into Studio → Tools → Add → JSON Schema, then set Model parameters →
 * Response Format = that schema.
 *
 * Run locally: `cd web && npx tsx scripts/orq/manage-sales-intent-agent.ts`
 *   --finalize   also run create→PATCH→verify (only succeeds once the enum is
 *                non-empty, i.e. post Plan 04). Without it the script prints the
 *                planned json_schema + validates models, then stops (dry).
 *
 * Env required (web/.env.local): ORQ_API_KEY (quotes stripped automatically).
 */

import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
import {
  SALES_CONFIDENCE,
  SALES_LANGUAGE,
  SALES_URGENCY,
  SALES_INTENT_VERSION,
} from "../../lib/automations/sales-email/coordinator/types";
import { SWARM_INTENTS_BY_SWARM } from "../../lib/automations/debtor-email/coordinator/intent.generated";
import { ENTITY_RELATIONSHIP } from "../../lib/automations/debtor-email/coordinator/intent-output-shared";

loadDotenv({ path: resolve(__dirname, "..", "..", ".env.local") });

const ORQ_API = "https://api.orq.ai/v2";
const ORQ_API_KEY = process.env.ORQ_API_KEY?.replace(/^"|"$/g, "");

const AGENT_KEY = "sales-intent-agent";

// CLAUDE.md catalog (list_models-validated below). Haiku 4.5 high-volume
// classifier default + the standard fallback chain.
const PRIMARY_MODEL = "aws/eu.anthropic.claude-haiku-4-5-20251001-v1:0";
const FALLBACK_MODELS = [
  "openai/gpt-4o-mini",
  "google-ai/gemini-2.5-flash",
  "mistral/mistral-large-2411",
];

const MAX_TOKENS = 1000;

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

// ---------------------------------------------------------------------------
// The strict json_schema that mirrors salesIntentOutputSchema. Nullable fields
// use `anyOf` (3970bad9) — NEVER ["string","null"]. The `intent` enum is the
// codegen'd sales vocabulary (injected so the Orq json_schema enum cannot drift
// from the Zod z.enum / swarm_intents registry — the 3-way agreement).
// ---------------------------------------------------------------------------
function buildResponseFormat(intentEnum: readonly string[]) {
  const rankedEntry = {
    type: "object",
    additionalProperties: false,
    required: ["intent", "confidence", "reasoning"],
    properties: {
      intent: { type: "string", enum: [...intentEnum] },
      confidence: { type: "string", enum: [...SALES_CONFIDENCE] },
      reasoning: { type: "string", maxLength: 300 },
    },
  };

  const schema = {
    type: "object",
    additionalProperties: false,
    required: [
      "ranked",
      "language",
      "urgency",
      "intent_version",
      "intent_proposal",
      "proposal_reason",
      "entity_relationship",
    ],
    properties: {
      ranked: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: rankedEntry,
      },
      language: { type: "string", enum: [...SALES_LANGUAGE] },
      urgency: { type: "string", enum: [...SALES_URGENCY] },
      intent_version: { type: "string", const: SALES_INTENT_VERSION },
      // Nullable → anyOf, never ["string","null"] (3970bad9).
      intent_proposal: {
        anyOf: [
          { type: "string", maxLength: 64, pattern: "^[a-z][a-z0-9_]*$" },
          { type: "null" },
        ],
      },
      proposal_reason: {
        anyOf: [{ type: "string", maxLength: 280 }, { type: "null" }],
      },
      entity_relationship: {
        anyOf: [
          { type: "string", enum: [...ENTITY_RELATIONSHIP] },
          { type: "null" },
        ],
      },
    },
  };

  return {
    type: "json_schema",
    json_schema: {
      name: "sales_intent_output",
      strict: true,
      schema,
    },
  };
}

async function validateModels(): Promise<void> {
  console.log("→ list_models (validating primary + fallbacks)…");
  const { status, json, text } = await orqFetch("/models");
  if (status !== 200) {
    fail(
      `list_models failed: ${status} ${text.slice(0, 200)}. ` +
        `Cannot validate model ids — refusing to create/PATCH (f980a2a1).`,
    );
  }
  // Catalog response shape (Orq /v2/models): an array of rows whose `model_id`
  // is the BARE model id WITHOUT the provider prefix (e.g.
  // "eu.anthropic.claude-haiku-4-5-20251001-v1:0", "gpt-4o-mini"). The provider
  // prefix used in the agent config ("aws/", "openai/", …) lives in separate
  // fields. We therefore validate by the bare id (the segment after the last
  // "/" in the wanted id) against the catalog `model_id` set. Defensive on the
  // envelope shape — accept [{model_id}] or {data:[{model_id}]}.
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

async function createPatchVerify(intentEnum: readonly string[]): Promise<void> {
  const responseFormat = buildResponseFormat(intentEnum);

  // 2. create_agent with the BARE primary model id (create drops
  //    response_format — cba7352b).
  console.log(`→ create_agent ${AGENT_KEY} (bare model id)…`);
  const created = await orqFetch("/agents", {
    method: "POST",
    body: JSON.stringify({
      key: AGENT_KEY,
      model: PRIMARY_MODEL,
      description:
        "Phase 113 — sales Stage 3 ranked-intent classifier (verkoop@smeba.nl).",
    }),
  });
  if (created.status >= 300 && created.status !== 409) {
    fail(`create_agent failed: ${created.status} ${created.text.slice(0, 300)}`);
  }
  if (created.status === 409) {
    console.log("• agent already exists — proceeding to PATCH (idempotent).");
  }

  // 3. update_agent PATCH the FULL model.parameters + root-level fallbacks +
  //    strict json_schema response_format.
  console.log("→ update_agent PATCH (full model.parameters + response_format)…");
  const patched = await orqFetch(`/agents/${AGENT_KEY}`, {
    method: "PATCH",
    body: JSON.stringify({
      model: {
        id: PRIMARY_MODEL,
        parameters: {
          temperature: 0,
          max_tokens: MAX_TOKENS,
          response_format: responseFormat,
        },
      },
      // Fallback chain lives at agent ROOT level (Phase 65-02 — nested no-ops).
      fallback_models: FALLBACK_MODELS,
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
}

async function main(): Promise<void> {
  if (!ORQ_API_KEY) fail("ORQ_API_KEY not set (web/.env.local).");

  const finalize = process.argv.includes("--finalize");

  const salesIntents = (SWARM_INTENTS_BY_SWARM as Record<string, readonly string[]>)[
    "sales-email"
  ];
  const intentEnum = salesIntents ?? [];

  // Always validate models first (cheap, catches typos early).
  await validateModels();

  // Print the planned json_schema so the operator can paste it into Studio.
  const responseFormat = buildResponseFormat(intentEnum.length ? intentEnum : ["other"]);
  console.log(
    "\n--- json_schema (Studio → Tools → Add → JSON Schema; then Model " +
      "parameters → Response Format = this schema) ---",
  );
  console.log(JSON.stringify(responseFormat, null, 2));
  console.log("--- end json_schema ---\n");

  if (intentEnum.length === 0) {
    console.error(
      "✗ intent enum empty — sales-email is not yet in swarm_intents/codegen.\n" +
        "  Run this with --finalize AFTER Plan 04 seeds swarm_intents + `npm run codegen`.\n" +
        "  In Plan 03 the agent is a SHELL: create it in Studio with a placeholder\n" +
        "  schema so the bootstrap retro can run; finalize the real enum in Plan 04.",
    );
    process.exit(2);
  }

  if (!finalize) {
    console.log(
      "• Dry run complete (models validated, json_schema printed). " +
        "Re-run with --finalize to create→PATCH→verify the agent.",
    );
    return;
  }

  await createPatchVerify(intentEnum);
  console.log(`\n✓ ${AGENT_KEY} created/updated. Verify the Studio json_schema next.`);
}

main().catch((err) => fail(err instanceof Error ? err.message : String(err)));
