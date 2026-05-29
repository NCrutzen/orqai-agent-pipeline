// Phase 4 Plan 04 Task 2 — cross-surface anti-drift compliance.
//
// Plans 02 + 03 each ship their own local anti-drift gate. Plan 04 owns the
// cross-surface scan: scans every Phase 4 user-facing surface in one pass and
// proves the UI-SPEC §13 anti-drift checklist holds globally:
//
//   #1 no raw hex outside themes/tokens
//   #3 no internal jargon in operator-facing strings
//   #5 no thumb-up / thumb-down widgets
//   #6 no EvalTypeRadio import / usage
//   #10 reversibility footer copy present on both Plan 02 + Plan 03 surfaces
//
// Scope: every file under web/app/(dashboard)/automations/[swarm]/patterns/
// PLUS every file under web/lib/promotion-recommender/ (the planner-locked
// "single source of truth for anti-drift compliance" per 04-04-PLAN.md).

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname, resolve } from "node:path";

// ---------- File enumeration ----------

const REPO_WEB = resolve(__dirname, "..", "..", "..");
// __dirname here is web/lib/promotion-recommender/__tests__ → ../../.. is web/

const PATTERNS_DIR = join(
  REPO_WEB,
  "app",
  "(dashboard)",
  "automations",
  "[swarm]",
  "patterns",
);
const RECOMMENDER_LIB_DIR = join(REPO_WEB, "lib", "promotion-recommender");

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

const SOURCE_EXTS = new Set([".tsx", ".ts", ".css"]);

const ALL_PATTERNS_FILES = walk(PATTERNS_DIR).filter((f) =>
  SOURCE_EXTS.has(extname(f)),
);
const ALL_LIB_FILES = walk(RECOMMENDER_LIB_DIR).filter((f) =>
  SOURCE_EXTS.has(extname(f)),
);

const ALL_SCANNED = [...ALL_PATTERNS_FILES, ...ALL_LIB_FILES];

// Tests + the gate itself reference forbidden words by construction; same for
// types.ts where operator-facing translation table headers are documented as
// JSDoc operator-vocabulary mapping.
const NON_TEST_FILES = ALL_SCANNED.filter((f) => !f.includes("/__tests__/"));

// Operator-facing files (where forbidden-jargon strings are user-visible).
// /lib/promotion-recommender/ is engineering-only (cron + pure functions) —
// tokens like `confirm_rate` legitimately appear as TS identifiers / JSDoc
// property descriptions. The user-facing fence is the /patterns/ tree.
const OPERATOR_FACING_FILES = NON_TEST_FILES.filter((f) =>
  f.includes(`/patterns/`),
);

// Strip JS/TS/CSS block + line comments + single/double/template-quoted strings
// so we look at OPERATOR-FACING text only (JSX text nodes + identifiers).
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/"[^"\n]*"/g, '""')
    .replace(/'[^'\n]*'/g, "''")
    .replace(/`[^`]*`/g, "``");
}

function stripCommentsOnly(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
}

// ============================================================================
// §13 #3 — forbidden jargon never appears as operator copy
// ============================================================================

// `regex` and `pipeline_events` get their own JSX-text-node check below
// because they legitimately appear in identifiers (regex_rule kind name,
// pipeline_events table name in TS string literals + cluster.ts comments).
const FORBIDDEN_JARGON_STRICT = [
  "eval_type",
  "Wilson",
  "LLM tiebreaker",
  "coordinator_runs",
  "swarm_intents",
  "swarm_noise_categories",
  "confirm_rate",
];

describe("cross-surface anti-drift — §13 #3 forbidden jargon (strict tokens)", () => {
  it.each(FORBIDDEN_JARGON_STRICT)(
    "no operator-facing source contains '%s' (comments + strings + identifiers stripped)",
    (token) => {
      const offenders: string[] = [];
      for (const file of OPERATOR_FACING_FILES) {
        const src = readFileSync(file, "utf8");
        // Strip comments + strings — these tokens may appear in:
        //   - module path comments (// see swarm_intents codegen)
        //   - identifier strings ('confirm_rate' as a TS object key)
        //   - JSDoc explaining what an OPERATOR-FACING surface deliberately
        //     hides ("never expose `eval_type` to the operator")
        // We assert no naked occurrence in JSX text / identifier position.
        const stripped = stripCommentsAndStrings(src);
        if (stripped.toLowerCase().includes(token.toLowerCase())) {
          offenders.push(file);
        }
      }
      expect(offenders, `forbidden jargon '${token}' leaked into: ${offenders.join(", ")}`).toEqual([]);
    },
  );
});

// ----- `regex` JSX-text-node check (allows the regex_rule identifier) -----

describe("cross-surface anti-drift — 'regex' never appears as JSX text", () => {
  it("no JSX text node contains the bare word 'regex'", () => {
    for (const file of NON_TEST_FILES) {
      const src = readFileSync(file, "utf8");
      const stripped = stripCommentsAndStrings(src);
      // Match >regex<, > regex<, >regex,< — JSX text node form.
      // Allowed: regex_rule (no trailing word boundary), `Regex` inside
      // identifiers that strings already stripped.
      expect(
        stripped,
        `'regex' appeared as JSX text in ${file}`,
      ).not.toMatch(/>\s*regex\s*[,<.]/i);
    }
  });
});

// ----- `pipeline_events` never as JSX text (table-name, can stay in strings) ----

describe("cross-surface anti-drift — 'pipeline_events' never as operator text", () => {
  it("no JSX text node contains the table name 'pipeline_events'", () => {
    for (const file of NON_TEST_FILES) {
      const src = readFileSync(file, "utf8");
      const stripped = stripCommentsAndStrings(src);
      expect(
        stripped,
        `'pipeline_events' appeared as JSX text in ${file}`,
      ).not.toMatch(/>\s*pipeline_events\s*</i);
    }
  });
});

// ============================================================================
// §13 #3 — raw status names never surface as JSX text
// ============================================================================

const RAW_STATUSES = ["open", "in_review", "approved", "rejected", "rolled_back"];

describe("cross-surface anti-drift — raw status names never as operator copy", () => {
  it.each(RAW_STATUSES)(
    "raw status '%s' never written as a JSX text node",
    (status) => {
      for (const file of NON_TEST_FILES) {
        const src = readFileSync(file, "utf8");
        const stripped = stripCommentsAndStrings(src);
        const re = new RegExp(`>\\s*${status}\\s*<`, "i");
        expect(stripped, `${status} appeared as JSX text in ${file}`).not.toMatch(re);
      }
    },
  );
});

// ============================================================================
// §13 #1 — no raw hex outside themes/tokens
// ============================================================================

describe("cross-surface anti-drift — §13 #1 (no raw hex literals)", () => {
  const HEX_RE = /#[0-9a-fA-F]{3,8}\b/;
  it.each(NON_TEST_FILES)("file %s contains no raw hex outside comments", (file) => {
    const src = readFileSync(file, "utf8");
    const stripped = stripCommentsOnly(src);
    expect(stripped, `raw hex literal in ${file}`).not.toMatch(HEX_RE);
  });
});

// ============================================================================
// §13 #6 — no EvalTypeRadio anywhere in Phase 4 surfaces
// ============================================================================

describe("cross-surface anti-drift — §13 #6 (no EvalTypeRadio import / usage)", () => {
  it("no source file imports or renders EvalTypeRadio", () => {
    for (const file of NON_TEST_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, `EvalTypeRadio referenced in ${file}`).not.toMatch(/EvalTypeRadio/);
    }
  });
});

// ============================================================================
// §13 #5 — no thumb widgets
// ============================================================================

describe("cross-surface anti-drift — §13 #5 (no thumb-up/down widgets)", () => {
  it("no source file references thumb glyphs or thumb-prefixed component names", () => {
    for (const file of NON_TEST_FILES) {
      const src = readFileSync(file, "utf8");
      expect(src, `👍 glyph in ${file}`).not.toMatch(/\u{1F44D}/u);
      expect(src, `👎 glyph in ${file}`).not.toMatch(/\u{1F44E}/u);
      expect(
        src,
        `thumb-prefixed component name in ${file}`,
      ).not.toMatch(/ThumbUp|ThumbDown|thumbs-up|thumbs-down/);
    }
  });
});

// ============================================================================
// §13 #10 — reversibility footer copy present on Plan 02 listing + Plan 03 detail
// ============================================================================

describe("cross-surface anti-drift — §13 #10 (reversibility footer copy)", () => {
  // The exact copy varies slightly between Plan 02 listing ("All actions on
  // suggestions are logged · an engineer can reverse Apply if it misbehaves")
  // and Plan 03 detail ("all actions are logged · an engineer can reverse
  // Apply if it misbehaves"). Both honor anti-drift #10 by carrying the
  // unique "engineer can reverse Apply" core phrase. Whitespace-normalize
  // before matching so JSX line wraps don't break the gate.
  const REVERSIBILITY_CORE = "engineer can reverse apply";
  it("at least 2 Phase 4 files contain the reversibility footer core phrase", () => {
    const hits: string[] = [];
    for (const file of OPERATOR_FACING_FILES) {
      const src = readFileSync(file, "utf8");
      const normalized = src.replace(/\s+/g, " ").toLowerCase();
      if (normalized.includes(REVERSIBILITY_CORE)) hits.push(file);
    }
    expect(
      hits.length,
      `reversibility footer copy must appear on Plan 02 listing + Plan 03 detail surfaces (found in: ${hits.join(", ")})`,
    ).toBeGreaterThanOrEqual(2);
  });
});

// ============================================================================
// File-inventory sanity — both surface roots must contain expected anchors.
// ============================================================================

describe("cross-surface anti-drift — file inventory sanity", () => {
  it("/patterns/ + /lib/promotion-recommender/ each surface their expected anchors", () => {
    const present = (suffix: string, list: string[]) =>
      list.some((f) => f.endsWith(suffix));
    expect(present("page.tsx", ALL_PATTERNS_FILES)).toBe(true);
    expect(present("cluster-card.tsx", ALL_PATTERNS_FILES)).toBe(true);
    expect(present("candidate-detail-shell.tsx", ALL_PATTERNS_FILES)).toBe(true);
    expect(present("action-card.tsx", ALL_PATTERNS_FILES)).toBe(true);
    expect(present("cluster.ts", ALL_LIB_FILES)).toBe(true);
    expect(present("signature.ts", ALL_LIB_FILES)).toBe(true);
    expect(present("savings.ts", ALL_LIB_FILES)).toBe(true);
    expect(present("types.ts", ALL_LIB_FILES)).toBe(true);
  });
});

// ============================================================================
// Phase 71 candidate-rule-list audit — keep-or-delete decision artifact.
// ============================================================================

describe("Phase 71 candidate-rule-list disposition", () => {
  it("file exists and carries the Phase 4 coexistence note in its JSDoc", () => {
    // Audit decision: kept on disk because stage-1/page.tsx (line 61) +
    // stage-1/__tests__/page-shell.test.tsx still import it. Phase 4 Patterns
    // mode coexists rather than supersedes — different data sources (Phase
    // 71 lists classifier_rules.status='candidate' for Stage 1 only; Phase 4
    // lists promotion_candidates across all 4 stages).
    const file = join(
      REPO_WEB,
      "app",
      "(dashboard)",
      "automations",
      "[swarm]",
      "stage-1",
      "candidate-rule-list.tsx",
    );
    const src = readFileSync(file, "utf8");
    expect(src).toMatch(/Phase 4 Plan 04 audit/);
    expect(src).toMatch(/Do NOT delete without first unwiring both call sites/);
  });
});
