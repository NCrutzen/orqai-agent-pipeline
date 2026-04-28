// Phase 60-00 (D-21). Stub for the race-cohort bulk-clear banner. Real
// assertions arrive in 60-05.

import { describe, it } from "vitest";

describe("D-21: race-cohort banner shows for promoted-today rules with remaining predicted rows", () => {
  it.todo(
    "renders banner when selection.rule.promoted_at >= today AND count > 0",
  );
  it.todo("hides banner when count === 0");
  it.todo("hides banner when promoted_at < today");
  it.todo(
    'CTA copy matches UI-SPEC: \'Bulk-clear remaining {N} predicted rows for promoted rule "{rule_key}"\'',
  );
});
