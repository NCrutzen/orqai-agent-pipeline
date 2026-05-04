// Phase 69 Wave 6 (CANO-01, CANO-04, D-17). LIVE_SMOKE-gated suite that hits
// production Orq.ai. Phase 65 commit dae6276 proved that mock-only tests can
// hide a TypeError breaking every live invocation; Phase 69's risk surface
// (new input shape, new prompt template, JSON schema validation) is exactly
// the class of change where live smoke catches what mocks miss.
//
// Coverage (4 live invocations):
//   - debtor smeba (NL):           "Met vriendelijke groet" / "u"
//   - debtor sicli-sud (FR):       "Cordialement"           / "vous"
//   - sales-stub acme-corp (EN):   "Kind regards"           / "you"  (CANO-04 cross-swarm)
//   - uk smeba-uk (EN-GB):         "Kind regards"           / "you"  (CANO-04 zero-prompt-edit)
//
// Run:
//   cd web && LIVE_SMOKE=1 npm test -- --run __tests__/canonicalisation/live-smoke.test.ts

import { describe, it, expect } from "vitest";
import { runLiveFixture } from "./shared/harness";
import { fixture as smebaFx } from "./debtor-fixtures/smeba.fixture";
import { fixture as sicliSudFx } from "./debtor-fixtures/sicli-sud.fixture";
import { fixture as smebaUkFx } from "./uk-ie-fixture/smeba-uk.fixture";
import { fixture as salesEn1Fx } from "./sales-fixtures/sales-en-1.fixture";

const LIVE_SMOKE = process.env.LIVE_SMOKE === "1";

describe.skipIf(!LIVE_SMOKE)(
  "canonicalisation — live Orq.ai smoke (LIVE_SMOKE=1)",
  () => {
    it(
      "debtor smeba — NL register, 'Met vriendelijke groet' signoff",
      { timeout: 45_000 },
      async () => {
        const out = await runLiveFixture(smebaFx);
        expect(out.body_html).toContain("Met vriendelijke groet");
        expect(out.body_version).toBe("2026-05-04.v2");
      },
    );

    it(
      "debtor sicli-sud — FR register, 'Cordialement' signoff",
      { timeout: 45_000 },
      async () => {
        const out = await runLiveFixture(sicliSudFx);
        expect(out.body_html).toContain("Cordialement");
        expect(out.body_version).toBe("2026-05-04.v2");
      },
    );

    it(
      "sales-stub acme-corp — EN register, cross-swarm reuse (CANO-04)",
      { timeout: 45_000 },
      async () => {
        const out = await runLiveFixture(salesEn1Fx);
        expect(out.body_html).toContain("Kind regards");
        expect(out.body_version).toBe("2026-05-04.v2");
      },
    );

    it(
      "uk smeba-uk — EN-GB register, zero-prompt-edit onboarding (CANO-04)",
      { timeout: 45_000 },
      async () => {
        const out = await runLiveFixture(smebaUkFx);
        expect(out.body_html).toContain("Kind regards");
        expect(out.body_version).toBe("2026-05-04.v2");
      },
    );
  },
);

// Sentinel: when LIVE_SMOKE != "1" the suite above is skipped. This block
// keeps vitest from reporting "no tests" for the file in offline runs.
describe.skipIf(LIVE_SMOKE)("canonicalisation — live smoke gate (offline)", () => {
  it("is skipped without LIVE_SMOKE=1", () => {
    expect(LIVE_SMOKE).toBe(false);
  });
});
