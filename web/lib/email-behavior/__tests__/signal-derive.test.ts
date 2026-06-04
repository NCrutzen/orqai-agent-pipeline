/**
 * Phase 112.5 Plan 03 Task 2 — RED tests voor de swarm-agnostische PURE
 * signal-deriver (SC-2).
 *
 * Mapt Transition[] + ledger-hit-set + per-swarm weights -> ReviewSignal[]. De
 * ledger-join is load-bearing (Pitfall 5): een restore op een door-ONS-systeem
 * gearchiveerde mail = correctie_false_positive (sterkste signaal); een restore
 * zonder ledger-hit = restore_other. DEFAULT_WEIGHTS levert de operator-weging
 * uit 112.5-01; een afwijkend weights-argument bewijst per-swarm override.
 */

import { describe, it, expect } from "vitest";
import {
  deriveSignals,
  DEFAULT_WEIGHTS,
  type ReviewSignal,
  type SignalWeights,
  type DeriveInput,
} from "../signal-derive";
import type { Transition } from "../transition-extract";

const TICK = "2026-06-04T10:00:00.000Z";
const SWARM = "sales-email";

function t(over: Partial<Transition> & Pick<Transition, "kind" | "immutable_id">): Transition {
  return {
    from_bucket: null,
    to_bucket: null,
    observed_at: TICK,
    ...over,
  };
}

function baseInput(
  transitions: Transition[],
  over: Partial<DeriveInput> = {},
): DeriveInput {
  return {
    transitions,
    ledgerHits: new Set<string>(),
    swarmType: SWARM,
    emailIdOf: (im) => im, // in tests is immutable_id == email_id tenzij anders
    observedTickIso: TICK,
    ...over,
  };
}

describe("deriveSignals — restore ledger-join (Pitfall 5)", () => {
  it("Test 1: restored_from_archive met ledger-hit -> correctie_false_positive", () => {
    const out = deriveSignals(
      baseInput([t({ kind: "restored_from_archive", immutable_id: "e1" })], {
        ledgerHits: new Set(["e1"]),
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].verdict).toBe("correctie_false_positive");
    expect(out[0].email_id).toBe("e1");
  });

  it("Test 2: restored_from_archive ZONDER ledger-hit -> restore_other", () => {
    const out = deriveSignals(
      baseInput([t({ kind: "restored_from_archive", immutable_id: "e2" })], {
        ledgerHits: new Set(["other-id"]),
      }),
    );
    expect(out).toHaveLength(1);
    expect(out[0].verdict).toBe("restore_other");
  });
});

describe("deriveSignals — category & approve-achtige verdicts", () => {
  it("Test 3: category_edited -> reclassify met category_key uit de transitie", () => {
    const out = deriveSignals(
      baseInput([
        t({ kind: "category_edited", immutable_id: "e3", categories: ["Klacht"] }),
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].verdict).toBe("reclassify");
    expect(out[0].category_key).toBe("Klacht");
  });

  it("Test 4: moved_to_afgehandeld -> approve_handled", () => {
    const out = deriveSignals(
      baseInput([t({ kind: "moved_to_afgehandeld", immutable_id: "e4" })]),
    );
    expect(out[0].verdict).toBe("approve_handled");
  });

  it("Test 5: replied -> approve_replied (gekoppeld aan matched inbound email)", () => {
    const out = deriveSignals(
      baseInput([
        t({ kind: "replied", immutable_id: "s5", matched_email_id: "inbound-5" }),
      ]),
    );
    expect(out).toHaveLength(1);
    expect(out[0].verdict).toBe("approve_replied");
    expect(out[0].email_id).toBe("inbound-5");
  });
});

describe("deriveSignals — per-swarm overridable weights", () => {
  it("Test 6: self_archived gebruikt DEFAULT_WEIGHTS, maar een afwijkend weights-argument geeft een ander verdict", () => {
    const defaultOut = deriveSignals(
      baseInput([t({ kind: "self_archived", immutable_id: "e6" })]),
    );
    const defaultVerdict = defaultOut[0]?.verdict;

    // Override: maak self_archived sterk genoeg om een ander verdict te geven.
    const override: SignalWeights = { self_archived: "strong_noise" } as SignalWeights;
    const overriddenOut = deriveSignals(
      baseInput([t({ kind: "self_archived", immutable_id: "e6" })], {
        weights: override,
      }),
    );
    const overriddenVerdict = overriddenOut[0]?.verdict;

    expect(overriddenVerdict).not.toBe(defaultVerdict);
    // DEFAULT_WEIGHTS markeert self_archived als zwak noise-signaal (operator-besluit 112.5-01).
    expect(DEFAULT_WEIGHTS.self_archived).toBe("weak_noise");
  });

  it("Test 7: read_aged -> weak_seen, puur (geen clock)", () => {
    const out = deriveSignals(
      baseInput([t({ kind: "read_aged", immutable_id: "e7" })]),
    );
    expect(out[0].verdict).toBe("weak_seen");
    // deterministisch
    const out2 = deriveSignals(
      baseInput([t({ kind: "read_aged", immutable_id: "e7" })]),
    );
    expect(out).toEqual(out2);
  });
});

describe("deriveSignals — dedupe_key", () => {
  it("Test 8: deterministische dedupe_key = swarm_type|email_id|verdict|observed_tick", () => {
    const out = deriveSignals(
      baseInput([t({ kind: "moved_to_afgehandeld", immutable_id: "e8" })]),
    );
    expect(out[0].dedupe_key).toBe(`${SWARM}|e8|approve_handled|${TICK}`);
    // swarm_type isoleert: een andere swarm met dezelfde email_id+verdict dedup't niet samen.
    const other = deriveSignals(
      baseInput([t({ kind: "moved_to_afgehandeld", immutable_id: "e8" })], {
        swarmType: "debtor-email",
      }),
    );
    expect(other[0].dedupe_key).not.toBe(out[0].dedupe_key);
    expect(out[0]).toMatchObject<Partial<ReviewSignal>>({
      swarm_type: SWARM,
      transition_kind: "moved_to_afgehandeld",
      observed_at: TICK,
    });
  });
});
