// Phase 69 (CANO-01, threat T-69-02). Wave 0 scaffold. Wave 3 wires real
// assertions: invoice-copy handler invokes the body agent with EXACTLY ONE
// brand_register object — never the union of brands. Locks the data-driven
// prompt-input contract against accidental cross-brand register leakage.

import { describe, it } from "vitest";

describe("classifier-invoice-copy-handler — single-brand input isolation (T-69-02)", () => {
  it.todo(
    "passes brand_register object matching ctx.entity_brand only (not the full registry)",
  );
  it.todo("never includes a list/array of brand metadata in body-agent inputs");
  it.todo(
    "fails the run (UnknownBrandError surfaces) when ctx.entity_brand is not in registry",
  );
  it.todo("language input matches brand_register.register_language");
});
