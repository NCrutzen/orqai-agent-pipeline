// Phase 131 Plan 01 Task 1 (ROUTE-01 / D-01). Static migration-parse guard for
// the routing_destinations table + frozen seed.
//
// This is a STATIC guard (mirrors sales-noise-calibration.test.ts): it parses
// the CREATE+seed migration SQL and asserts the migration encodes EXACTLY the
// frozen destination_key set for swarm_type='info-routing' — the 7 actionable
// buckets + the `unrouted` sentinel = 8 keys — plus the RLS triad, the UNIQUE
// constraint, valid brands, and the NULL-mailbox unrouted sentinel. It does NOT
// hit the live DB (that happens at the Task 3 operator checkpoint after apply).
//
// Frozen bucket set (RESEARCH §Discretion 3, OQ1 default):
//   order_entry, verkoop, inspecties, storingen, opleidingen, sollicitaties,
//   algemeen  (7 actionable)  +  unrouted (sentinel)  =  8 destination_key values.
//
// Only verified (bucket×brand) rows are seeded (OQ2): unverified pairs are
// omitted so the agent's pick with no active row falls through to `unrouted`.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260617_phase131_routing_destinations.sql",
);

// The frozen destination_key set for info-routing (7 actionable + unrouted).
const EXPECTED_DESTINATION_KEYS = [
  "algemeen",
  "inspecties",
  "opleidingen",
  "order_entry",
  "sollicitaties",
  "storingen",
  "unrouted",
  "verkoop",
].sort();

const VALID_BRANDS = new Set(["smeba", "fire-control", "berki"]);

interface SeedRow {
  swarm_type: string;
  destination_key: string;
  brand: string;
  target_mailbox: string | null;
}

/**
 * Strip `--` comment lines, then parse every VALUES tuple of the form
 *   ('info-routing','<bucket>','<brand>',<mailbox-or-NULL>, ...)
 * The first four positional columns are swarm_type, destination_key, brand,
 * target_mailbox (per the INSERT column list). target_mailbox is NULL for the
 * unrouted sentinel.
 */
function parseSeedRows(sql: string): SeedRow[] {
  const code = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  const rows: SeedRow[] = [];
  // Match tuples that begin with the 'info-routing' swarm_type literal.
  const tupleRe =
    /\(\s*'info-routing'\s*,\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*(NULL|'[^']*')/gi;
  let m: RegExpExecArray | null;
  while ((m = tupleRe.exec(code)) !== null) {
    const mailboxRaw = m[3];
    rows.push({
      swarm_type: "info-routing",
      destination_key: m[1],
      brand: m[2],
      target_mailbox:
        mailboxRaw.toUpperCase() === "NULL"
          ? null
          : mailboxRaw.replace(/^'|'$/g, ""),
    });
  }
  return rows;
}

describe("Phase 131 ROUTE-01: routing_destinations table + frozen seed", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");
  const rows = parseSeedRows(sql);

  it("wraps the migration in a single BEGIN; / COMMIT; transaction", () => {
    expect(/\bBEGIN\s*;/i.test(sql)).toBe(true);
    expect(/\bCOMMIT\s*;/i.test(sql)).toBe(true);
  });

  it("creates the routing_destinations table with the UNIQUE (swarm_type, destination_key, brand) constraint", () => {
    expect(/CREATE TABLE IF NOT EXISTS public\.routing_destinations/i.test(sql)).toBe(true);
    expect(/UNIQUE\s*\(\s*swarm_type\s*,\s*destination_key\s*,\s*brand\s*\)/i.test(sql)).toBe(true);
    expect(/ON CONFLICT\s*\(\s*swarm_type\s*,\s*destination_key\s*,\s*brand\s*\)\s*DO UPDATE/i.test(sql)).toBe(true);
  });

  it("enables RLS with service_all + authenticated SELECT policies and NO anon/public USING(true)", () => {
    expect((sql.match(/ENABLE ROW LEVEL SECURITY/gi) ?? []).length).toBeGreaterThanOrEqual(1);
    expect(/routing_destinations_service_all/i.test(sql)).toBe(true);
    expect(/routing_destinations_auth_select/i.test(sql)).toBe(true);
    expect(/FOR ALL\s+TO service_role/i.test(sql)).toBe(true);
    expect(/FOR SELECT\s+TO authenticated/i.test(sql)).toBe(true);
    // No anon/public USING(true) grant.
    expect(/TO\s+anon/i.test(sql)).toBe(false);
    expect(/TO\s+public\b[\s\S]*?USING\s*\(\s*true\s*\)/i.test(sql)).toBe(false);
  });

  it("seeds EXACTLY the 8 frozen destination_key values for info-routing", () => {
    const keys = [...new Set(rows.map((r) => r.destination_key))].sort();
    expect(keys).toEqual(EXPECTED_DESTINATION_KEYS);
  });

  it("includes the unrouted sentinel row with a NULL target_mailbox", () => {
    const unrouted = rows.filter((r) => r.destination_key === "unrouted");
    expect(unrouted.length).toBeGreaterThanOrEqual(1);
    for (const r of unrouted) {
      expect(r.target_mailbox).toBeNull();
    }
  });

  it("gives every seeded row a valid non-empty brand ∈ {smeba, fire-control, berki}", () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) {
      expect(r.brand.length).toBeGreaterThan(0);
      expect(VALID_BRANDS.has(r.brand)).toBe(true);
    }
  });

  it("gives every actionable (non-unrouted) row a non-empty target_mailbox (only verified pairs seeded)", () => {
    const actionable = rows.filter((r) => r.destination_key !== "unrouted");
    expect(actionable.length).toBeGreaterThan(0);
    for (const r of actionable) {
      expect(r.target_mailbox, `${r.destination_key}×${r.brand} must map to a verified mailbox`).toBeTruthy();
    }
  });
});
