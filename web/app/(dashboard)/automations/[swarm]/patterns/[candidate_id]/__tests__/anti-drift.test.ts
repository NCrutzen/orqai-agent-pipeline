// Phase 4 Plan 03 Task 3 — Plan-03 anti-drift gates (UI-SPEC §13).
//
// Mirrors the Plan 02 Task 3 forbidden-token grep over the Plan 03 file set.
// Forbidden in operator-facing strings: internal jargon (regex, eval_type,
// Wilson, LLM tiebreaker, coordinator_runs, swarm_intents, swarm_noise_categories,
// confirm_rate, pipeline_events) AND no raw hex colors (use CSS tokens).

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..");

function walkFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (entry === "__tests__" || entry === "node_modules") continue;
    const s = statSync(full);
    if (s.isDirectory()) walkFiles(full, out);
    else if (/\.(tsx?|ts)$/.test(entry)) out.push(full);
  }
  return out;
}

const FILES = walkFiles(ROOT);
const ALL_SRC = FILES.map((f) => readFileSync(f, "utf8")).join("\n");

describe("Plan 03 anti-drift gates", () => {
  it("#1 no raw hex colors in component files (use CSS tokens)", () => {
    // Operator-facing components only — Plan 02 status-color map uses tokens.
    // Plan 03 falls back to a hex only inside `var(--patterns, var(..., #...))`
    // which the regex below tolerates (var() wraps with a comma).
    const matches: string[] = [];
    for (const file of FILES) {
      const src = readFileSync(file, "utf8");
      // Match #fff / #abcdef / #abcdef99 NOT preceded by a comma-space (which
      // signals a var() default fallback).
      const re = /(?<![,]\s)#[0-9a-fA-F]{3,8}\b/g;
      const m = src.match(re);
      if (m) matches.push(`${file}: ${m.join(", ")}`);
    }
    expect(matches).toEqual([]);
  });

  it("#3 no internal jargon in operator-facing JSX strings", () => {
    const FORBIDDEN = [
      /\beval_type\b/,
      /\bWilson\b/i,
      /\bLLM tiebreaker\b/i,
      /\bcoordinator_runs\b/,
      /\bswarm_intents\b/,
      /\bswarm_noise_categories\b/,
      /\bconfirm_rate\b/,
      /\bpipeline_events\b/,
    ];
    for (const f of FORBIDDEN) {
      // The internal terms appear in TS code (types, comments) — exclude
      // single-line `//` comments + multi-line `/* */` blocks by stripping
      // them first.
      const stripped = ALL_SRC
        .replace(/\/\*[\s\S]*?\*\//g, "")
        .replace(/^\s*\/\/.*$/gm, "");
      const hit = f.test(stripped);
      if (hit) {
        // If the only occurrence is inside a quoted type-discriminator string
        // (e.g. eval_type_seed: 'intent-correction') tolerate it.
        const matches = stripped.match(new RegExp(f.source, "g"));
        const operatorFacing = matches?.filter(
          (m) => !m.includes("_seed") && !m.includes("eval_type_seed"),
        );
        if (operatorFacing && operatorFacing.length > 0) {
          throw new Error(`Anti-drift #3 violation: ${f} matched in operator-facing code`);
        }
      }
    }
  });

  it("#6 no EvalTypeRadio imports", () => {
    expect(ALL_SRC).not.toMatch(/EvalTypeRadio/);
  });

  it("#10 reversibility footer copy present verbatim", () => {
    expect(ALL_SRC).toContain(
      "all actions are logged · an engineer can reverse Apply if it misbehaves",
    );
  });

  it("no dangerouslySetInnerHTML (T-04-03-07 — dismiss reason XSS)", () => {
    expect(ALL_SRC).not.toMatch(/dangerouslySetInnerHTML/);
  });
});
