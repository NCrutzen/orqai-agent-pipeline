// Phase 69 (CANO-04). Wave 0 scaffold for sales-email-stub fixtures. Validates
// the body agent works for a non-debtor swarm without any prompt edit
// (cross-swarm reuse). Wave 5 fills these in: synthetic `sales-email-stub`
// swarm row + 3 fixtures with English register, sales-tone subject lines.

import { describe, it } from "vitest";

describe("canonicalisation — sales-email-stub fixtures (cross-swarm reuse)", () => {
  it.todo("setup creates synthetic sales-email-stub swarm row + brand register");
  it.todo("fixture 1: english sales inquiry — body agent renders correctly");
  it.todo("fixture 2: french sales inquiry — body agent uses 'Cordialement'");
  it.todo("fixture 3: dutch sales inquiry — body agent uses formal 'u'");
  it.todo("teardown removes synthetic swarm row");
  it.todo("body agent prompt is unchanged from debtor-email runs (cross-swarm reuse)");
});
