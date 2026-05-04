// Phase 69 (CANO-04). Wave 0 scaffold for the UK/IE zero-prompt-edit
// onboarding fixture. Wave 5 fills these in:
//   1. Test setup INSERTs a synthetic `smeba-uk` row into swarms.entity_brand
//      (English register, GB dialect, "Kind regards" signoff, "you" formal).
//   2. Run a fixture email through the body agent.
//   3. Assert the rendered output uses English register + GB signoff WITHOUT
//      ANY prompt edit applied.
//   4. Teardown deletes the synthetic row so the production seed is clean.

import { describe, it } from "vitest";

describe("canonicalisation — UK/IE fixture (CANO-04 zero-prompt-edit)", () => {
  it.todo("setup inserts synthetic smeba-uk row into swarms.entity_brand");
  it.todo("body agent renders English register + 'Kind regards' signoff");
  it.todo("body agent uses 'you' as formal_address (English)");
  it.todo("teardown removes the synthetic row from swarms.entity_brand");
  it.todo("teardown runs even when assertions fail (afterEach hook)");
});
