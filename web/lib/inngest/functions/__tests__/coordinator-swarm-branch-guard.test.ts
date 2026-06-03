// Phase 110 Plan 01 (SWARM-02) — static architecture gate for the shared
// Stage 3 workers.
//
// Mirrors the classifier-screen-worker.test.ts:667 readFileSync grep-guard
// model. A shared cross-swarm worker MUST NOT contain a per-swarm conditional
// branch (`swarm_type === '<literal>'` or `swarm === 'sales-email'` /
// 'debtor-email'). Such a branch is the architecture bug SWARM-02 forbids:
// new swarms onboard via registry INSERTs (Phase 68), never by adding an
// `if (swarm_type === ...)` arm to a shared worker.
//
// This gate extends the existing classifier-screen-worker guard to the two
// remaining shared Stage 3 workers:
//   - debtor-email-coordinator.ts (the Stage 3 classifier — Plan 03 of this
//     phase replaces its module-level `const SWARM_TYPE = "debtor-email"`
//     with `event.data.swarm_type`; the const ASSIGNMENT is NOT a `===`
//     comparison so it does not trip this guard today, and Plan 03 keeps the
//     gate GREEN after the swap).
//   - stage-3-dispatcher.ts (already branch-free — derives swarm_type from the
//     event payload / event-name prefix).
//
// SCOPE (RESEARCH OQ-4 / RFC SC-3): this gate scopes ONLY to the
// classify/classifier/coordinator/dispatcher surface. The bucket-loader
// surface-layer branch (load-bucket-label-ids.ts) is INTENTIONALLY OUT of this
// guard's scope — surface-layer label resolution is allowed swarm-specific
// presentation, not pipeline-routing logic.
//
// THREAT REGISTER T-110-01 (grep hygiene): comment lines are stripped BEFORE
// matching so this header's own citation of the forbidden pattern does not
// self-invalidate the gate. Never assert `=== 0` against unfiltered source.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// The shared Stage 3 workers this gate covers. Surface-layer files
// (e.g. load-bucket-label-ids.ts) are deliberately absent — see OQ-4.
const SHARED_WORKERS = [
  "../debtor-email-coordinator.ts",
  "../stage-3-dispatcher.ts",
] as const;

// A conditional per-swarm branch — the forbidden pattern. Matches:
//   swarm_type === "debtor-email"   /   swarm_type === 'sales-email'
//   swarm === "sales-email"         /   swarm === 'debtor-email'
// Does NOT match a top-level assignment (`const SWARM_TYPE = "debtor-email"`)
// because that uses `=` not `===`.
const SWARM_TYPE_BRANCH = /swarm_type\s*===\s*['"]/;
const SWARM_LITERAL_BRANCH = /swarm\s*===\s*['"](sales-email|debtor-email)['"]/;

/**
 * Strip comment lines (// … and block-comment body lines) so prose that cites
 * the forbidden pattern in a header doc-string cannot self-trip the guard.
 * This is the THREAT REGISTER T-110-01 grep-hygiene mitigation.
 */
function stripComments(src: string): string {
  let inBlock = false;
  const out: string[] = [];
  for (const rawLine of src.split("\n")) {
    const line = rawLine;
    const trimmed = line.trim();
    if (inBlock) {
      // Inside a /* … */ block; the line ends the block if it contains `*/`.
      if (trimmed.includes("*/")) inBlock = false;
      continue;
    }
    if (trimmed.startsWith("/*")) {
      // Single-line /* … */ closes on the same line; multi-line opens a block.
      if (!trimmed.includes("*/")) inBlock = true;
      continue;
    }
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) {
      // Line comment, or a continuation line of a block comment.
      continue;
    }
    out.push(line);
  }
  return out.join("\n");
}

describe("SWARM-02 static gate — shared Stage 3 workers carry no per-swarm branch", () => {
  for (const rel of SHARED_WORKERS) {
    it(`${rel} contains zero \`swarm_type === '<literal>'\` branches`, () => {
      const raw = readFileSync(resolve(__dirname, rel), "utf8");
      const code = stripComments(raw);
      // Sanity: stripping must not empty the file (would make the gate vacuous).
      expect(code.length).toBeGreaterThan(0);
      expect(code).not.toMatch(SWARM_TYPE_BRANCH);
      expect(code).not.toMatch(SWARM_LITERAL_BRANCH);
    });
  }

  it("grep-hygiene self-test: stripComments removes a commented forbidden pattern", () => {
    // A comment line that cites the forbidden pattern must be stripped, so the
    // guard does not false-positive on documentation. (T-110-01.)
    const sample = [
      '// swarm_type === "debtor-email" mentioned in a comment',
      'const x = 1;',
    ].join("\n");
    const stripped = stripComments(sample);
    expect(stripped).not.toMatch(SWARM_TYPE_BRANCH);
    expect(stripped).toContain("const x = 1;");
  });

  it("grep-hygiene self-test: a real branch in code IS caught", () => {
    // Negative control — proves the gate is not vacuous: an actual code-line
    // branch survives stripComments and trips the matcher.
    const sample = [
      'const y = 2;',
      'if (swarm_type === "sales-email") doThing();',
    ].join("\n");
    const stripped = stripComments(sample);
    expect(stripped).toMatch(SWARM_TYPE_BRANCH);
  });
});
