// Phase 111 Plan 02 (STAGE1-01 / D-06). Registry-assertion regression guard for
// the sales-email Stage 1 noise calibration flip.
//
// This is a STATIC guard: it parses the calibration-flip migration SQL and
// asserts the migration encodes EXACTLY the D-06 disposition — 3 categories
// flipped to categorize_archive, 2 held at manual_review. It does NOT hit the
// live DB / network (the live assertion happens in Plan 05 after the migration
// is applied via MCP). Pure unit test (vitest), no fixtures, no Supabase client.
//
// D-06 disposition:
//   categorize_archive : auto_reply, ooo_temporary, ooo_permanent
//   manual_review      : payment_admittance, unknown
//
// If a future edit widens the flip set (e.g. accidentally archiving
// payment_admittance or unknown) or narrows it, this test fails.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const MIGRATION_PATH = resolve(
  __dirname,
  "../../../../supabase/migrations/20260603_sales_noise_calibration_flip.sql",
);

// The 5 core sales noise keys and their expected post-flip action (D-06).
const EXPECTED_DISPOSITION: Record<string, "categorize_archive" | "manual_review"> = {
  auto_reply: "categorize_archive",
  ooo_temporary: "categorize_archive",
  ooo_permanent: "categorize_archive",
  payment_admittance: "manual_review",
  unknown: "manual_review",
};

/**
 * Extract the set of category_keys the migration flips to
 * action='categorize_archive'. We look for the UPDATE ... SET action =
 * 'categorize_archive' statement and parse the category_key IN (...) list.
 * Comments (lines starting with --) are stripped so example/rationale text in
 * the header can't pollute the parse.
 */
function parseFlippedKeys(sql: string): Set<string> {
  const code = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");

  // Find the UPDATE statement that sets action = 'categorize_archive'.
  const stmtMatch = code.match(
    /update\s+public\.swarm_noise_categories[\s\S]*?;/i,
  );
  expect(stmtMatch, "migration must contain an UPDATE on swarm_noise_categories").not.toBeNull();
  const stmt = stmtMatch![0];

  // The flip statement must target categorize_archive and sales-email.
  expect(/action\s*=\s*'categorize_archive'/i.test(stmt)).toBe(true);
  expect(/swarm_type\s*=\s*'sales-email'/i.test(stmt)).toBe(true);

  const inMatch = stmt.match(/category_key\s+in\s*\(([^)]*)\)/i);
  expect(inMatch, "flip statement must scope via category_key IN (...)").not.toBeNull();

  const keys = inMatch![1]
    .split(",")
    .map((k) => k.trim().replace(/^'|'$/g, ""))
    .filter((k) => k.length > 0);

  return new Set(keys);
}

describe("Phase 111 D-06: sales noise calibration flip", () => {
  const sql = readFileSync(MIGRATION_PATH, "utf8");

  it("wraps the flip in a BEGIN; / COMMIT; transaction", () => {
    expect(/\bBEGIN\s*;/i.test(sql)).toBe(true);
    expect(/\bCOMMIT\s*;/i.test(sql)).toBe(true);
  });

  it("flips EXACTLY the 3 safe core sales keys to categorize_archive", () => {
    const flipped = parseFlippedKeys(sql);
    const expectedArchive = Object.entries(EXPECTED_DISPOSITION)
      .filter(([, action]) => action === "categorize_archive")
      .map(([key]) => key)
      .sort();

    expect([...flipped].sort()).toEqual(expectedArchive);
    expect(flipped.size).toBe(3);
  });

  it("never flips payment_admittance or unknown to categorize_archive", () => {
    const flipped = parseFlippedKeys(sql);
    for (const [key, action] of Object.entries(EXPECTED_DISPOSITION)) {
      if (action === "manual_review") {
        expect(flipped.has(key)).toBe(false);
      }
    }
  });

  it("encodes the full D-06 disposition: 3 archive / 2 review", () => {
    const flipped = parseFlippedKeys(sql);
    const archiveCount = Object.values(EXPECTED_DISPOSITION).filter(
      (a) => a === "categorize_archive",
    ).length;
    const reviewCount = Object.values(EXPECTED_DISPOSITION).filter(
      (a) => a === "manual_review",
    ).length;

    expect(archiveCount).toBe(3);
    expect(reviewCount).toBe(2);

    // Each core key that should archive IS in the flip set; each that should
    // stay in review is NOT.
    for (const [key, action] of Object.entries(EXPECTED_DISPOSITION)) {
      expect(flipped.has(key)).toBe(action === "categorize_archive");
    }
  });

  it("records the held-back rationale for payment_admittance and unknown", () => {
    // Audit-trail guard: the migration must document WHY the two keys are held.
    expect(sql).toMatch(/payment_admittance/);
    expect(sql).toMatch(/unknown/);
    expect(sql.toLowerCase()).toMatch(/manual_review/);
  });
});
