/**
 * Phase 87 Plan 04 Task 1 — RED guard: cache bypass.
 *
 * Pitfall 3 from 87-RESEARCH.md: routing the retro pass through
 * `findCachedOutput` would render the comparison a tautology. The retro
 * function MUST call `invokeIntentAgent` DIRECTLY.
 *
 * Static source-grep test — no runtime needed. Stays RED until the function
 * file lands in Plan 04 Task 2.
 */

import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const FN_PATH = resolve(
  __dirname,
  "../../../inngest/functions/debtor-email-stage-3-retro-classify.ts",
);

describe("Phase 87 retro-classify — cache bypass (Pitfall 3)", () => {
  it("function file must NOT import findCachedOutput", () => {
    expect(existsSync(FN_PATH)).toBe(true);
    const src = readFileSync(FN_PATH, "utf8");
    expect(src).not.toMatch(/findCachedOutput/);
  });

  it("function file must NOT import from debtor-email-coordinator.ts (cache wrapper)", () => {
    const src = readFileSync(FN_PATH, "utf8");
    // The live coordinator is the cache-poisoning surface. Retro path
    // composes invoke-intent + retro/* helpers only.
    expect(src).not.toMatch(/debtor-email-coordinator/);
  });

  it("function file imports invokeIntentAgent from coordinator/invoke-intent", () => {
    const src = readFileSync(FN_PATH, "utf8");
    expect(src).toMatch(/invokeIntentAgent/);
    expect(src).toMatch(/coordinator\/invoke-intent/);
  });
});
