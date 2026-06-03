// Phase 4 Plan 02 Task 3 — anti-drift compliance gate.
//
// Plan 04 owns the cross-Phase-4-surface audit; Plan 02 owns the local gate
// over /patterns/. UI-SPEC §13 anti-drift checklist enforcement:
//   #1 no raw hex outside themes/tokens (CSS modules use tokens only).
//   #3 no internal jargon in operator-facing strings.
//   #5 no thumb-up/thumb-down widgets.
//   #6 no EvalTypeRadio imports.
//
// Scope: every file under web/app/(dashboard)/automations/[swarm]/patterns/.

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

const PATTERNS_DIR = join(
  __dirname,
  "..",
);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...walk(full));
    } else {
      out.push(full);
    }
  }
  return out;
}

const ALL_FILES = walk(PATTERNS_DIR);
const SOURCE_EXTS = new Set([".tsx", ".ts", ".css"]);
const SOURCE_FILES = ALL_FILES.filter((f) => SOURCE_EXTS.has(extname(f)));

// Files where rule-key STRINGS (e.g. 'eval_type', 'confirm_rate') legitimately
// appear as TypeScript type-guard / translation-map KEYS — those are not
// operator-facing surfaces. Tests + this anti-drift gate itself reference the
// forbidden words by construction.
const NON_TEST_FILES = SOURCE_FILES.filter((f) => !f.includes("/__tests__/"));

// ── §13 #3: forbidden jargon tokens (operator-facing strings) ──────────────
const FORBIDDEN_JARGON = [
  "eval_type",
  "Wilson",
  "LLM tiebreaker",
  "coordinator_runs",
  "swarm_intents",
  "swarm_noise_categories",
  "confirm_rate",
];
// 'regex' is too generic — we check it as a word-boundary token in operator
// COPY (JSX text nodes), not in code comments. We use a softer assertion for
// it (no JSX text node containing the exact word).

describe("Plan 02 anti-drift gate — §13 #3 (no internal jargon in operator strings)", () => {
  it.each(FORBIDDEN_JARGON)(
    "no source file under /patterns/ contains the forbidden token '%s' as operator copy",
    (token) => {
      for (const file of NON_TEST_FILES) {
        const src = readFileSync(file, "utf8");
        // Strip block + line comments — engineering documentation may
        // mention these strings to explain anti-drift intent (e.g. the
        // patterns-listing-shell explanatory comment).
        const stripped = src
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "");
        const lower = stripped.toLowerCase();
        if (lower.includes(token.toLowerCase())) {
          throw new Error(
            `Forbidden jargon '${token}' appears in operator-facing surface ${file}`,
          );
        }
      }
    },
  );

  it("the word 'regex' never appears inside a JSX text node in operator copy", () => {
    // Conservative check: no JSX literal of the form >regex< or > regex < in
    // non-test sources. Allows the token in identifiers (regex_rule kind) +
    // imports + comments.
    for (const file of NON_TEST_FILES) {
      const src = readFileSync(file, "utf8");
      // Strip strings / template literals / comments first (rough but safe).
      const stripped = src
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "")
        .replace(/"[^"\n]*"/g, '""')
        .replace(/'[^'\n]*'/g, "''")
        .replace(/`[^`]*`/g, "``");
      // Match >regex<, > regex<, >regex < as a JSX text-node substring.
      expect(stripped, `regex appeared as JSX text in ${file}`).not.toMatch(
        />\s*regex[\s.,]/i,
      );
    }
  });
});

// ── §13 #3 raw status names appearing as operator copy ────────────────────
describe("Plan 02 anti-drift gate — raw status names never surface as operator copy", () => {
  const RAW_STATUSES = ["open", "in_review", "approved", "rejected", "rolled_back"];
  it.each(RAW_STATUSES)(
    "raw status name '%s' is never written as a JSX text node",
    (status) => {
      for (const file of NON_TEST_FILES) {
        const src = readFileSync(file, "utf8");
        // Match >open<, > open <, etc. as JSX text. Backend names appear
        // freely as map keys + type literals (those stay inside quotes and
        // are stripped first).
        const stripped = src
          .replace(/\/\*[\s\S]*?\*\//g, "")
          .replace(/^\s*\/\/.*$/gm, "")
          .replace(/"[^"\n]*"/g, '""')
          .replace(/'[^'\n]*'/g, "''")
          .replace(/`[^`]*`/g, "``");
        const re = new RegExp(`>\\s*${status}\\s*<`, "i");
        expect(stripped, `${status} appeared as JSX text in ${file}`).not.toMatch(re);
      }
    },
  );
});

// ── §13 #1: no raw hex outside tokens ─────────────────────────────────────
describe("Plan 02 anti-drift gate — §13 #1 (no raw hex; tokens only)", () => {
  const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
  it.each(NON_TEST_FILES)("file %s contains no raw hex outside comments", (file) => {
    const src = readFileSync(file, "utf8");
    const stripped = src
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/^\s*\/\/.*$/gm, "");
    expect(stripped, `raw hex literal in ${file}`).not.toMatch(HEX_RE);
  });
});

// ── §13 #6: no EvalTypeRadio imports ──────────────────────────────────────
describe("Plan 02 anti-drift gate — §13 #6 (no EvalTypeRadio anywhere in /patterns/)", () => {
  it("no source file imports or renders EvalTypeRadio", () => {
    for (const file of NON_TEST_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, `EvalTypeRadio referenced in ${file}`).not.toMatch(/EvalTypeRadio/);
    }
  });
});

// ── §13 #5: no thumb widgets ──────────────────────────────────────────────
describe("Plan 02 anti-drift gate — §13 #5 (no thumb-up/thumb-down widgets)", () => {
  it("no source file references thumbs glyphs or thumb-prefixed component names", () => {
    for (const file of NON_TEST_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, `👍 glyph in ${file}`).not.toMatch(/\u{1F44D}/u);
      expect(src, `👎 glyph in ${file}`).not.toMatch(/\u{1F44E}/u);
      expect(src, `Thumb component name in ${file}`).not.toMatch(/ThumbUp|ThumbDown|thumbs-up|thumbs-down/);
    }
  });
});

describe("Plan 02 anti-drift gate — file inventory sanity", () => {
  it("/patterns/ tree contains the expected component + lib files", () => {
    const present = (s: string) => NON_TEST_FILES.some((f) => f.endsWith(s));
    expect(present("page.tsx")).toBe(true);
    expect(present("hydrate-candidates.ts")).toBe(true);
    expect(present("patterns-listing-shell.tsx")).toBe(true);
    expect(present("cluster-card.tsx")).toBe(true);
    expect(present("cluster-card.module.css")).toBe(true);
    expect(present("aggregate-header.tsx")).toBe(true);
    expect(present("status-filter-chip-strip.tsx")).toBe(true);
  });
});
