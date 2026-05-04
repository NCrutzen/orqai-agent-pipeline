// Phase 69 (CANO-02, D-03). Wave 0 scaffold for the codegen test. Wave 2
// fills these in once `npm run codegen` is wired and entity.generated.ts is
// committed.

import { describe, it } from "vitest";

describe("scripts/gen-entity-types.ts → entity.generated.ts", () => {
  it.todo("emits a TS literal-union of brand codes from the live registry");
  it.todo("sorts codes alphabetically for deterministic diffs");
  it.todo("regenerated output equals the committed entity.generated.ts (CI guard)");
  it.todo("emits ENTITY_CODES readonly tuple matching the union");
  it.todo("emits `type Entity = never` when registry is empty (defensive)");
});
