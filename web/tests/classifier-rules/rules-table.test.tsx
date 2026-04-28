// Phase 60-00 (D-26). Stub for /automations/classifier-rules dashboard. Real
// assertions arrive in 60-04.

import { describe, it } from "vitest";

describe("D-26: /classifier-rules dashboard renders status + 14d sparkline rows", () => {
  it.todo(
    "groups rows by status: Promoted / Candidates / Demoted / Manually blocked",
  );
  it.todo("shows shadow-mode banner when CLASSIFIER_CRON_MUTATE !== 'true'");
  it.todo("renders ci_lo as % with tabular-nums");
  it.todo("Block button opens confirmation modal; Unblock has no confirmation");
});
