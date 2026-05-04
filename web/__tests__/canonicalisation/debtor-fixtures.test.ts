// Phase 69 (CANO-01, CANO-04). Wave 0 scaffold for debtor-brand fixture tests.
// Wave 5 fills these in: 6 fixtures (one per existing brand) drive the
// invoice-copy handler end-to-end through a mocked Orq.ai response, asserting
// the body-agent inputs contain the right brand_register and the rendered
// output matches expectation per fixture.

import { describe, it } from "vitest";

const EXPECTED_BRAND_FIXTURES = [
  "smeba",
  "smeba-fire",
  "sicli-noord",
  "sicli-sud",
  "berki",
  "iccafe",
] as const;

describe("canonicalisation — debtor-brand fixtures", () => {
  for (const brand of EXPECTED_BRAND_FIXTURES) {
    it.todo(`${brand}: end-to-end fixture passes with correct register/signoff`);
  }
  it.todo("body agent receives no cross-brand register data");
  it.todo("output adapter (Phase 65 fan-in) keeps working unchanged");
});
