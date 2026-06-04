// Phase 90 Wave 0 RED — RED until Plan 03 exports selectResolverBody (RESL-16 item 3).
//
// RESL-16 body fix: the live resolver reads `body_text` only
// (stage-2-customer-resolver.ts:65), missing quoted-thread identifiers on the
// `zapier-debtor-ingest` source (99.9% populated `body_full_text`). But a BLANKET
// switch to body_full_text craters the outlook path (outlook: 9.9% full /
// 99.8% text). The fix is a PER-SOURCE selection helper:
//   - source = 'zapier-debtor-ingest' → prefer body_full_text (fall back to body_text)
//   - source = 'outlook' / 'sugarcrm' → body_text (body_full_text mostly empty)
//   - empty string ('') is treated as a fall-back trigger, not a value.
//
// RED today: the helper `selectResolverBody` does not exist yet. Plan 03 adds it
// (exported from the resolver home) and wires it into the Stage 2 email SELECT.
// Import of `../body-source` fails → RED for the right reason.

import { describe, it, expect } from "vitest";

// Plan 03 built body-source.ts and exports
// selectResolverBody({ source, body_full_text, body_text }) → string.
import { selectResolverBody } from "../body-source";

describe("Phase 90 RESL-16: per-source body selection", () => {
  it("zapier-debtor-ingest → body_full_text (quoted-thread populated)", () => {
    expect(
      selectResolverBody({
        source: "zapier-debtor-ingest",
        body_full_text: "X",
        body_text: "Y",
      }),
    ).toBe("X");
  });

  it("outlook → body_text (body_full_text typically empty)", () => {
    expect(
      selectResolverBody({
        source: "outlook",
        body_full_text: null,
        body_text: "Y",
      }),
    ).toBe("Y");
  });

  it("outlook empty-string body_full_text → falls back to body_text", () => {
    // Empty string must be treated as a fall-back trigger, not a value.
    expect(
      selectResolverBody({
        source: "outlook",
        body_full_text: "",
        body_text: "Y",
      }),
    ).toBe("Y");
  });

  it("sugarcrm → body_text", () => {
    expect(
      selectResolverBody({
        source: "sugarcrm",
        body_full_text: null,
        body_text: "Y",
      }),
    ).toBe("Y");
  });
});
