// Phase 1 (milestone bulk-review-flow-ux) — Plan 01-03 Task 2.
// One-shot guard tests + hot-path-isolation check.

import { describe, it, expect } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { assertOverridePartialIndexExists } from "@/lib/bulk-review/partial-index-guard";

// Minimal Supabase-builder mock. Each call to admin.from("pg_indexes")
// returns the same chainable that .select().eq().eq() lands on, and finally
// resolves (await) to { data, error }. The result is parameterised per test.
function mockAdmin(result: {
  data: Array<{ indexname: string; indexdef: string }> | null;
  error: { message: string } | null;
}): SupabaseClient {
  const builder = {
    select() {
      return builder;
    },
    eq() {
      return builder;
    },
    then(resolve: (v: typeof result) => void) {
      resolve(result);
    },
  };
  return {
    from() {
      return builder;
    },
  } as unknown as SupabaseClient;
}

describe("Test 1: resolves when index present with correct predicate", () => {
  it("does not throw on a valid pg_indexes row", async () => {
    const admin = mockAdmin({
      data: [
        {
          indexname: "pipeline_events_override_partial_idx",
          indexdef:
            "CREATE INDEX pipeline_events_override_partial_idx ON public.pipeline_events USING btree (created_at DESC) WHERE override IS NOT NULL",
        },
      ],
      error: null,
    });
    await expect(assertOverridePartialIndexExists(admin)).resolves.toBeUndefined();
  });
});

describe("Test 2: throws when index missing", () => {
  it("error message contains index name AND 'Phase 70'", async () => {
    const admin = mockAdmin({ data: [], error: null });
    await expect(assertOverridePartialIndexExists(admin)).rejects.toThrow(
      /pipeline_events_override_partial_idx/,
    );
    await expect(assertOverridePartialIndexExists(admin)).rejects.toThrow(
      /Phase 70/,
    );
  });

  it("also throws on null data", async () => {
    const admin = mockAdmin({ data: null, error: null });
    await expect(assertOverridePartialIndexExists(admin)).rejects.toThrow(
      /pipeline_events_override_partial_idx/,
    );
  });
});

describe("Test 3: throws when predicate is wrong", () => {
  it("error message mentions the expected predicate", async () => {
    const admin = mockAdmin({
      data: [
        {
          indexname: "pipeline_events_override_partial_idx",
          // Predicate is missing — accidental ALTER dropped the WHERE clause.
          indexdef:
            "CREATE INDEX pipeline_events_override_partial_idx ON public.pipeline_events USING btree (created_at DESC)",
        },
      ],
      error: null,
    });
    await expect(assertOverridePartialIndexExists(admin)).rejects.toThrow(
      /override IS NOT NULL/,
    );
  });

  it("surfaces a Supabase error verbatim with the contract context", async () => {
    const admin = mockAdmin({
      data: null,
      error: { message: "permission denied for view pg_indexes" },
    });
    await expect(assertOverridePartialIndexExists(admin)).rejects.toThrow(
      /permission denied/,
    );
    await expect(assertOverridePartialIndexExists(admin)).rejects.toThrow(
      /Phase 70/,
    );
  });
});

describe("Test 4: guard is one-shot — not invoked from any other file in lib/bulk-review/", () => {
  it("zero callers outside the guard file + its own test", () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { execSync } = require("node:child_process");
    const out: string = execSync(
      `grep -rln "assertOverridePartialIndexExists" lib/bulk-review/ || true`,
      { cwd: process.cwd(), encoding: "utf8" },
    );
    const lines = out
      .split("\n")
      .filter(Boolean)
      .filter(
        (p: string) =>
          !p.endsWith("partial-index-guard.ts") &&
          !p.endsWith("partial-index-guard.test.ts"),
      );
    expect(lines, `unexpected callers: ${lines.join(", ")}`).toEqual([]);
  });
});
