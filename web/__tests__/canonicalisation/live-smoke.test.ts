// Phase 69 (CANO-01, D-17). LIVE_SMOKE-gated test that hits production Orq.ai.
// Phase 65 commit dae6276 proved that mock-only tests can hide a TypeError
// breaking every live invocation; Phase 69 risk surface (new input shape, new
// prompt template, JSON schema validation) is exactly the class of change
// where live smoke catches things mocks miss.
//
// Run only when LIVE_SMOKE=1 is set (Wave 5 close, operator-driven).
//
// Wave 0 ships the scaffold; Wave 5 wires real Orq invocations.

import { describe, it } from "vitest";

const LIVE_SMOKE = process.env.LIVE_SMOKE === "1";

describe.skipIf(!LIVE_SMOKE)(
  "canonicalisation — live Orq.ai smoke (LIVE_SMOKE=1)",
  () => {
    it.todo(
      "1 debtor-brand fixture: body agent returns valid JSON, register=nl",
    );
    it.todo(
      "1 sales-email-stub fixture: body agent returns valid JSON, register=en",
    );
    it.todo(
      "1 UK fixture (smeba-uk): body agent returns valid JSON, register=en + GB signoff",
    );
    it.todo("no `400 Invalid JSON detected` errors across the 3 invocations");
    it.todo(
      "model.parameters.response_format.json_schema is honoured (strict mode)",
    );
  },
);

// When LIVE_SMOKE is not set, expose at least one assertion so the suite
// reports the file as "passed (skipped)" cleanly rather than "no tests found".
describe.skipIf(LIVE_SMOKE)("canonicalisation — live smoke gate", () => {
  it("is skipped without LIVE_SMOKE=1", () => {
    // Sentinel — exists so the file always parses to at least one test entry.
  });
});
