// Phase 69 (CANO-02). Wave 0 scaffold for the entity_brand expansion
// migration test. Implementation lights up in Wave 2 once we have a pgtap
// harness or ephemeral-DB pattern. Until then, test cases are `it.todo` so the
// scaffold is discoverable but does not fail the offline suite.

import { describe, it } from "vitest";

describe("migration 20260505a_entity_brand_expansion", () => {
  it.todo("rewrites flat string-array seed to jsonb-of-objects");
  it.todo("is idempotent (re-running on already-expanded shape is a no-op)");
  it.todo("populates all 7 brand metadata fields per row");
  it.todo("covers all 7 expected brand codes");
  it.todo("raises if any element ends up missing a `code` field (assertion DO block)");
});
