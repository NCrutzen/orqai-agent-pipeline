// Phase 60-00 (D-15). Stub for the ?rule=X filter. Real assertions in 60-05.

import { describe, it } from "vitest";

describe("D-15: ?rule=X filter applies via JSONB path on automation_runs.result", () => {
  it.todo(
    "appends .eq('result->predicted->>rule', ruleKey) to the list query",
  );
  it.todo(
    "Pending promotion tab queries classifier_rules.status='candidate'",
  );
});
