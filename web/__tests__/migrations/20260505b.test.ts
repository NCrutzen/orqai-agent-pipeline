// Phase 69 (CANO-03). Wave 0 scaffold for the orq_agents cross-cutting flip
// migration test. Lights up in Wave 2.

import { describe, it } from "vitest";

describe("migration 20260505b_orq_agents_cross_cutting", () => {
  it.todo("flips swarm_type to 'cross-cutting' for debtor-copy-document-body-agent");
  it.todo("does not touch any other orq_agents row");
  it.todo("is idempotent");
});
