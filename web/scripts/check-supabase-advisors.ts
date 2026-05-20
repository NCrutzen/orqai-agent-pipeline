#!/usr/bin/env tsx
/**
 * Hits the Supabase Management API security advisor for the Agent-Workforce
 * project and exits non-zero on any ERROR-level lint. Designed to be a fast
 * pre-push / CI gate so RLS-disabled tables don't sneak in.
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... npm run check:supabase
 *
 * The token must have Management API access. It lives in web/.env.local as
 * SUPABASE_ACCESS_TOKEN — same token used by the Supabase plugin MCP.
 */

import { config as loadEnv } from "dotenv";
import { resolve } from "node:path";

loadEnv({ path: resolve(__dirname, "..", ".env.local") });

const PROJECT_REF = "mvqjhlxfvtqqubqgdvhz";
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) {
  console.error("SUPABASE_ACCESS_TOKEN missing (looked in web/.env.local and environment).");
  process.exit(2);
}

type Lint = {
  name: string;
  title: string;
  level: "ERROR" | "WARN" | "INFO";
  detail: string;
  metadata: { schema?: string; name?: string; type?: string };
  remediation?: string;
};

async function main() {
  const res = await fetch(
    `https://api.supabase.com/v1/projects/${PROJECT_REF}/advisors/security`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    console.error(`Advisor API returned ${res.status}: ${await res.text()}`);
    process.exit(2);
  }

  const payload = (await res.json()) as { lints: Lint[] };
  const errors = payload.lints.filter((l) => l.level === "ERROR");
  const warns = payload.lints.filter((l) => l.level === "WARN");

  if (errors.length === 0) {
    console.log(`Supabase advisor: 0 ERROR, ${warns.length} WARN, ${payload.lints.length - errors.length - warns.length} INFO. OK.`);
    process.exit(0);
  }

  console.error(`\nSupabase advisor flagged ${errors.length} ERROR-level issue(s):\n`);
  for (const lint of errors) {
    const target = `${lint.metadata.schema ?? "?"}.${lint.metadata.name ?? "?"}`;
    console.error(`  [${lint.name}] ${target}`);
    console.error(`    ${lint.detail}`);
    if (lint.remediation) console.error(`    fix: ${lint.remediation}`);
  }
  console.error("\nFix these before pushing. See supabase/migrations/_template.sql for the RLS pattern.");
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
