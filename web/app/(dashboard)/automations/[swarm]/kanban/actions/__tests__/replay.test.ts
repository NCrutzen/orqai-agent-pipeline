// Phase 76 Plan 01 — RED scaffold.
// Server Action `replayKanbanRow` does not exist yet (Plan 05 creates it under
// ../replay.ts). Tests are `it.todo` until that plan lands.

import { describe, it } from "vitest";

describe("Phase 76: replayKanbanRow Server Action", () => {
  it.todo(
    "same-intent replay: calls inngest.send with handler_event for the row's intent_key (NO debtor-email/override.submitted)",
  );
  it.todo(
    "edited-intent replay: calls inngest.send with debtor-email/override.submitted carrying axis='intent_key' + new intent_key",
  );
  it.todo(
    "rejects when target intent_key is not in swarm_intents registry (validates against registered + placeholder rows)",
  );
});
