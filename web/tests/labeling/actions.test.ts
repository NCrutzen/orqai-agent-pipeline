// Phase 56-00 (D-21). Approve/Reject server actions sync-write tests.
// Wave 0 scaffold — actions.ts lands in Wave 3 (56-08). RED until then.

import { describe, it } from "vitest";

describe("Debtor email labeling — server actions", () => {
  it.todo("approveLabel writes human_verdict=approve to agent_runs + reviewed_by/at to email_labels");
  it.todo("rejectLabel writes corrected_category to agent_runs + reviewed_by/at to email_labels");
});
