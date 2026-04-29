// Phase 56-00 (D-15, D-16). Browserless label module idempotency tests.
// Wave 0 scaffold — module skeleton from Task 3 throws on apply (selectors
// pending probe artifact). Idempotency branches WILL pass once Wave 2 wires
// readCurrentLabel from the probe.

import { describe, it } from "vitest";

describe("labelEmailInIcontroller", () => {
  it.todo("no-op when already labeled correctly — returns status='already_labeled' (D-16)");
  it.todo("skipped_conflict when labeled different — returns status='skipped_conflict' with reason");
  it.todo("captures screenshots before and after — both URLs in result on success");
});
