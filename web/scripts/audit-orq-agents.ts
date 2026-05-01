#!/usr/bin/env tsx
/**
 * Orq.ai agent ↔ catalog audit
 *
 * Cross-checks every model ID stored in `public.orq_agents` (primary +
 * every fallback in `model_config.fallbacks`) against the live Orq.ai
 * model catalog (`GET /v2/models`). Catches the catalog-mismatch bug
 * documented in CLAUDE.md § Orq.ai (learning d96d8225-5be4-44aa-8125-67a706848ff9):
 * Orq's API stores arbitrary model strings without validation, so a typo
 * or stale CLAUDE.md default propagates silently until Studio renders an
 * empty Model dropdown OR Bedrock-only routing breaks at runtime.
 *
 * Run locally: `npx tsx scripts/audit-orq-agents.ts`
 * CI gate:    `npm run audit:orq-agents` (exits non-zero on any mismatch)
 *
 * Env required (web/.env.local):
 *   - SUPABASE_URL
 *   - SUPABASE_SERVICE_ROLE_KEY
 *   - ORQ_API_KEY (workspace key — quotes around the value are stripped)
 */

import { createClient } from "@supabase/supabase-js";
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";

loadDotenv({ path: resolve(__dirname, "..", ".env.local") });

// Project uses Next.js conventions; env exposes NEXT_PUBLIC_SUPABASE_URL
// to the browser bundle. Server-side scripts can read either name.
const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
// Catalog endpoints (/v2/models, /v2/tools) require a Personal Access Token
// — workspace keys (sk-orq-...) are scoped to the proxy /invoke surface only
// and return 403 on management endpoints. Mint a PAT in Orq Studio →
// Settings → API Keys and set as ORQ_PAT.
const ORQ_PAT = process.env.ORQ_PAT?.replace(/^"|"$/g, "");
const ORQ_API_KEY = process.env.ORQ_API_KEY?.replace(/^"|"$/g, "");
const ORQ_AUTH = ORQ_PAT ?? ORQ_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error(
    "✗ NEXT_PUBLIC_SUPABASE_URL (or SUPABASE_URL) and SUPABASE_SERVICE_ROLE_KEY must be set",
  );
  process.exit(2);
}
if (!ORQ_AUTH) {
  console.error("✗ ORQ_PAT (preferred) or ORQ_API_KEY must be set");
  process.exit(2);
}

interface OrqAgentRow {
  agent_key: string;
  orqai_id: string;
  model_config: {
    primary?: string;
    fallbacks?: string[];
  };
  enabled: boolean;
}

interface CatalogModel {
  id: string;
  type: string;
  owned_by: string;
}

async function fetchOrqCatalog(): Promise<Set<string>> {
  const res = await fetch("https://api.orq.ai/v2/models?modelType=chat", {
    headers: { Authorization: `Bearer ${ORQ_AUTH}` },
  });
  if (res.status === 403) {
    throw new Error(
      "Orq.ai /v2/models returned 403 — workspace API keys (sk-orq-...) " +
      "cannot access management endpoints. Mint a Personal Access Token " +
      "in Orq Studio → Settings → API Keys and set it as ORQ_PAT in .env.local.",
    );
  }
  if (!res.ok) {
    throw new Error(
      `Orq.ai catalog fetch failed: ${res.status} ${res.statusText} — ${await res.text()}`,
    );
  }
  const json = (await res.json()) as { models?: CatalogModel[] };
  const models = json.models ?? [];
  if (models.length === 0) {
    throw new Error(
      "Orq.ai /v2/models returned 0 models — likely auth scope issue. " +
      "Verify ORQ_PAT has 'models:read' scope.",
    );
  }
  return new Set(models.map((m) => m.id));
}

async function fetchAgents(): Promise<OrqAgentRow[]> {
  const sb = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!);
  const { data, error } = await sb
    .from("orq_agents")
    .select("agent_key, orqai_id, model_config, enabled")
    .order("agent_key");
  if (error) throw new Error(`Supabase fetch failed: ${error.message}`);
  return (data ?? []) as OrqAgentRow[];
}

interface AuditResult {
  agent_key: string;
  enabled: boolean;
  total_ids: number;
  broken_ids: { id: string; role: "primary" | "fallback" }[];
}

function audit(rows: OrqAgentRow[], catalog: Set<string>): AuditResult[] {
  return rows.map((r) => {
    const broken: AuditResult["broken_ids"] = [];
    const ids: { id: string | undefined; role: "primary" | "fallback" }[] = [
      { id: r.model_config?.primary, role: "primary" },
      ...(r.model_config?.fallbacks ?? []).map(
        (id) => ({ id, role: "fallback" as const }),
      ),
    ];
    let total = 0;
    for (const { id, role } of ids) {
      if (!id) continue;
      total += 1;
      if (!catalog.has(id)) broken.push({ id, role });
    }
    return {
      agent_key: r.agent_key,
      enabled: r.enabled,
      total_ids: total,
      broken_ids: broken,
    };
  });
}

function format(results: AuditResult[], catalogSize: number): number {
  const ok = results.filter((r) => r.broken_ids.length === 0);
  const bad = results.filter((r) => r.broken_ids.length > 0);

  console.log(
    `Catalog: ${catalogSize} chat models. Audited ${results.length} agents.\n`,
  );

  for (const r of results) {
    const status = r.broken_ids.length === 0 ? "✓" : "✗";
    const enabledNote = r.enabled ? "" : " (disabled)";
    console.log(`${status} ${r.agent_key}${enabledNote}`);
    for (const b of r.broken_ids) {
      console.log(`    ${b.role}: ${b.id}`);
    }
  }

  console.log(`\n${ok.length} ok, ${bad.length} broken.`);

  if (bad.length === 0) return 0;
  console.log(
    "\nFix:",
    "Either update the agent via Orq.ai MCP / Studio with a real catalog ID,",
    "then sync public.orq_agents.model_config to match.",
    "See CLAUDE.md § Orq.ai for canonical model IDs.",
  );
  return 1;
}

async function main(): Promise<void> {
  const [catalog, rows] = await Promise.all([fetchOrqCatalog(), fetchAgents()]);
  const results = audit(rows, catalog);
  const exit = format(results, catalog.size);
  process.exit(exit);
}

main().catch((e) => {
  console.error("✗ Audit failed:", e instanceof Error ? e.message : e);
  process.exit(2);
});
