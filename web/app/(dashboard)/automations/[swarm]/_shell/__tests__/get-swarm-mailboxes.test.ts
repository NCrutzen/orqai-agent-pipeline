// Phase 82 Plan 01 Task 2 — unit tests for _lib/get-swarm-mailboxes.ts
//
// Covers:
//   T7: debtor-email + rows=[] → 6 hardcoded entries (Sicli Noord, Sicli Sud,
//       Berki, Smeba, Smeba Fire, FireControl).
//   T8: debtor-email + rows containing mailbox_id=4 → at minimum {id:4, label:'Smeba'}.
//   T9: unknown swarmType + rows with mailbox_id=99 → [{id:99, label:'mailbox 99'}].

import { describe, it, expect } from "vitest";

import {
  getSwarmMailboxes,
  MAILBOX_LABELS,
} from "../_lib/get-swarm-mailboxes";

describe("getSwarmMailboxes (Phase 82 Plan 01)", () => {
  it("T7: debtor-email + empty rows → 6 hardcoded entries", () => {
    const out = getSwarmMailboxes("debtor-email", []);
    expect(out).toHaveLength(6);
    const labels = out.map((m) => m.label).sort();
    expect(labels.sort()).toEqual(
      ["Berki", "FireControl", "Sicli Noord", "Sicli Sud", "Smeba", "Smeba Fire"].sort(),
    );
    // IDs are 1..6, sorted asc.
    expect(out.map((m) => m.id)).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("T8: debtor-email + rows with mailbox_id=4 → contains {id:4, label:'Smeba'}", () => {
    const out = getSwarmMailboxes("debtor-email", [
      { mailbox_id: 4 },
      { mailbox_id: 4 },
    ]);
    const smeba = out.find((m) => m.id === 4);
    expect(smeba).toEqual({ id: 4, label: "Smeba" });
    // Still includes all 6 entries because the static map seeds them.
    expect(out).toHaveLength(6);
  });

  it("T9: unknown swarmType + rows with mailbox_id=99 → fallback label 'mailbox 99'", () => {
    const out = getSwarmMailboxes("sales-email", [
      { mailbox_id: 99 },
    ]);
    expect(out).toEqual([{ id: 99, label: "mailbox 99" }]);
  });

  it("ignores null mailbox_ids in rows", () => {
    const out = getSwarmMailboxes("sales-email", [
      { mailbox_id: null },
      { mailbox_id: 7 },
      { mailbox_id: null },
    ]);
    expect(out).toEqual([{ id: 7, label: "mailbox 7" }]);
  });

  it("unions row ids with static map for known swarm", () => {
    const out = getSwarmMailboxes("debtor-email", [
      { mailbox_id: 100 }, // not in static map
    ]);
    // Static 6 + row-derived 100 = 7 entries.
    expect(out).toHaveLength(7);
    expect(out.at(-1)).toEqual({ id: 100, label: "mailbox 100" });
  });

  it("MAILBOX_LABELS exports the canonical debtor-email map (6 entries)", () => {
    expect(Object.keys(MAILBOX_LABELS["debtor-email"] ?? {})).toHaveLength(6);
    expect(MAILBOX_LABELS["debtor-email"]?.[4]).toBe("Smeba");
    expect(MAILBOX_LABELS["debtor-email"]?.[6]).toBe("FireControl");
  });
});
