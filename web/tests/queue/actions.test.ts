// Phase 60-00 (D-16). Stub for the verdict server-action split. Real assertions
// arrive in 60-06 once the verdict-worker Inngest function lands.

import { describe, it } from "vitest";

describe("D-16: recordVerdict writes feedback row + agent_runs + fires Inngest event", () => {
  it.todo("UPDATE automation_runs SET status='feedback' WHERE id=...");
  it.todo("INSERT public.agent_runs with swarm_type, rule_key, human_verdict");
  it.todo("calls inngest.send('classifier/verdict.recorded', ...)");
  it.todo("does NOT call categorizeEmail / archiveEmail inline");
  it.todo("calls emitAutomationRunStale('debtor-email-review')");
});
