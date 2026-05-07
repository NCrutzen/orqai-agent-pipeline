// Phase 76 Plan 01 — RED scaffold.
// Server Action `closeKanbanRow` does not exist yet (Plan 05 creates it under
// ../close.ts). Tests are `it.todo` until that plan lands; the executor will
// promote them to real `it()` blocks alongside the implementation.

import { describe, it } from "vitest";

describe("Phase 76: closeKanbanRow Server Action", () => {
  it.todo(
    "UPDATE automation_runs SET status='completed' WHERE id=$kanbanRowId",
  );
  it.todo(
    "emits supabase realtime broadcast on channel automations:${swarm_type}-kanban event 'stale'",
  );
  it.todo("rejects when kanbanRowId is not a uuid (operator-supplied input)");
});
