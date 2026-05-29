// Phase 1 (milestone bulk-review-flow-ux) — Plan 01-02 Task 2.
// STATIC GUARD: writeOverride + hydrateBulkReviewRow must NEVER pull in
// anything from the Phase 72 promotion recommender or the legacy learning
// inbox, and writeOverride must NEVER import from @/lib/inngest/* (it is
// the operator-side synchronous DB writer; the Inngest fan-out handler is
// a separate file).
//
// Locks CON-promotion-recommender-out-of-band / P1-D-04 / LERN-02.
//
// Why this is a static text scan rather than a runtime check:
//   - The recommender path may not even exist on disk in Phase 1 (Phase 72
//     ships later in the milestone). A "no module loaded" runtime assertion
//     would pass vacuously today and fail months later when 72 lands.
//   - A grep on the source file (plus its directly imported relative paths)
//     fails immediately on the first PR that introduces the coupling.
//
// vitest cwd is web/ (see vitest.config.ts) so process.cwd() resolves into
// the package root.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

describe("writeOverride out-of-band guard (CON-promotion-recommender-out-of-band / P1-D-04)", () => {
  const FORBIDDEN: RegExp[] = [
    /\brecommender\b/,
    /promotion[_-]?candidates/,
    /learning[_-]?inbox/,
  ];

  const FILES = ["lib/bulk-review/write-override.ts", "lib/bulk-review/hydrate.ts"];

  for (const rel of FILES) {
    it(`${rel} contains no forbidden recommender symbols`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), "utf8");
      for (const pat of FORBIDDEN) {
        expect(src, `forbidden pattern ${pat} found in ${rel}`).not.toMatch(pat);
      }
    });
  }

  it("writeOverride does not import @/lib/inngest/*", () => {
    const src = readFileSync(
      resolve(process.cwd(), "lib/bulk-review/write-override.ts"),
      "utf8",
    );
    expect(src).not.toMatch(/from\s+["']@\/lib\/inngest/);
  });
});
