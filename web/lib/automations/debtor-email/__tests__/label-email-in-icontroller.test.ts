// Phase 67 Plan 01 Wave 0 — failing scaffold for the filled-in (Plan 03)
// labelEmailInIcontroller module. Each it.todo maps to one of the four
// DOM-dance steps captured in SELECTORS.md (production-verified 2026-04-29,
// re-verified 2026-05-04 against fresh production probe at commit 7df759a).
import { describe, it } from "vitest";

describe("labelEmailInIcontroller (filled-in selectors)", () => {
  it.todo(
    "clicks .select2-container.clients then types customer_account_id into .select2-input.select2-focused",
  );
  it.todo(
    "waits for ul.select2-results .select2-result-selectable before clicking highlighted",
  );
  it.todo("returns 'already_labeled' when readCurrentLabel matches");
  it.todo(
    "returns 'brand_mismatch' when highlighted result's brand suffix doesn't match MAILBOX_BRAND_PATTERNS[entity]",
  );
  it.todo(
    "returns 'failed' with reason='SELECTION_DID_NOT_STICK' when after-text still says 'None selected'",
  );
});
