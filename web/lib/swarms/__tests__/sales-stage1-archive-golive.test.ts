// Phase 112 Plan 02 (CLEANUP-01 / D-02). Migration-assertion regression guard
// for the sales-email Stage 1 Outlook-archive GO-LIVE flip.
//
// This is a STATIC guard: it parses the go-live flip migration SQL and asserts
// the migration encodes EXACTLY the D-02 flip — dry_run_config.stage_1_archive
// set to false via jsonb_set, scoped to swarm_type='sales-email', with NO
// sibling-flag clobber and NO whole-column replacement. It does NOT hit the
// live DB / network (the apply happens at the Plan 112-03 [BLOCKING] checkpoint
// via MCP). Pure unit test (vitest), no fixtures, no Supabase client.
//
// Mirrors web/lib/swarms/__tests__/sales-noise-calibration.test.ts (the 111
// flip analog). The threats this guards (RESEARCH threat register):
//   T-112-08 — flip clobbering sibling dry_run_config flags (jsonb_set only).
//   T-112-10 — flip accidentally scoped to debtor (WHERE sales-email only).
//   T-112-09 — premature go-live (APPLY NOTE marks it human-gated/unapplied).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260603x_sales_stage1_archive_golive.sql",
);

const SIBLING_KEYS = ["stage_1_cleanup", "stage_3_labeling", "stage_4_handlers"];

/**
 * Strip SQL line-comments so example/rationale text in the header (which
 * legitimately MENTIONS siblings, debtor, and whole-column shapes for
 * explanation) cannot pollute the assertions on the executable statement.
 */
function stripComments(sql: string): string {
  return sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
}

/** Extract the single UPDATE ... ; statement targeting public.swarms. */
function extractUpdateStmt(code: string): string {
  const stmtMatch = code.match(/update\s+public\.swarms[\s\S]*?;/i);
  expect(
    stmtMatch,
    "migration must contain an UPDATE on public.swarms",
  ).not.toBeNull();
  return stmtMatch![0];
}

describe("Phase 112 D-02: sales Stage-1 archive go-live flip", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const code = stripComments(sql);
  const stmt = extractUpdateStmt(code);

  it("wraps the flip in a BEGIN; / COMMIT; transaction", () => {
    expect(/\bBEGIN\s*;/i.test(code)).toBe(true);
    expect(/\bCOMMIT\s*;/i.test(code)).toBe(true);
  });

  it("flips stage_1_archive to false via jsonb_set (NOT a whole-column replace)", () => {
    // jsonb_set on the '{stage_1_archive}' path set to 'false'.
    expect(
      /jsonb_set\(\s*dry_run_config\s*,\s*'\{stage_1_archive\}'\s*,\s*'false'/i.test(
        stmt,
      ),
      "flip must use jsonb_set(dry_run_config, '{stage_1_archive}', 'false')",
    ).toBe(true);

    // NO whole-column replacement: `SET dry_run_config = '{' (an object literal)
    // would clobber the siblings.
    expect(
      /set\s+dry_run_config\s*=\s*'\{/i.test(stmt),
      "flip must NOT replace the whole dry_run_config column with an object literal",
    ).toBe(false);
  });

  it("is scoped to swarm_type = 'sales-email' (no debtor, no unscoped UPDATE)", () => {
    expect(/where\s+swarm_type\s*=\s*'sales-email'/i.test(stmt)).toBe(true);
    // The executable statement must not target debtor.
    expect(/swarm_type\s*=\s*'debtor/i.test(stmt)).toBe(false);
    // The UPDATE must carry a WHERE clause (no unscoped table-wide flip).
    expect(/\bwhere\b/i.test(stmt)).toBe(true);
  });

  it("does NOT mutate any sibling dry_run_config flag", () => {
    for (const key of SIBLING_KEYS) {
      expect(
        stmt.includes(key),
        `sibling flag ${key} must not appear in the executable flip statement`,
      ).toBe(false);
    }
  });

  it("touches only the stage_1_archive jsonb path", () => {
    const pathMatches = stmt.match(/'\{[^}]*\}'/g) ?? [];
    expect(pathMatches).toEqual(["'{stage_1_archive}'"]);
  });

  it("carries the human-gated APPLY NOTE marker (written-but-unapplied)", () => {
    // Stable substring proving the migration documents it is not applied here.
    expect(sql).toMatch(/NOT applied by the plan/i);
    expect(sql).toMatch(/\[BLOCKING\]/);
  });
});
