// Phase 76 Plan 01 — RED scaffold.
// Loader `loadKanbanRows` does not exist yet (Plan 05 creates it under
// ../kanban-loader.ts). Tests are `it.todo` until that plan lands.

import { describe, it } from "vitest";

describe("Phase 76: loadKanbanRows", () => {
  it.todo(
    "SELECT shape: status='pending' AND result->>'kanban_reason' IS NOT NULL filtered by swarm_type",
  );
  it.todo(
    "groups rows by kanban_reason ('no_handler' | 'low_confidence' | 'handler_error') for column rendering",
  );
});
