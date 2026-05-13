// Unit tests for _lib/get-swarm-mailboxes.ts.
//
// Labels are now derived at runtime via loadMailboxLabels (DB-driven); the
// helper itself takes a labels Record and merges with ids found in rows.

import { describe, it, expect } from "vitest";

import { getSwarmMailboxes } from "../_lib/get-swarm-mailboxes";

describe("getSwarmMailboxes", () => {
  it("empty rows + empty labels → empty list", () => {
    expect(getSwarmMailboxes([], {})).toEqual([]);
  });

  it("uses label from map when row id is present in labels", () => {
    const out = getSwarmMailboxes(
      [{ mailbox_id: 4 }, { mailbox_id: 4 }],
      { 4: "Smeba" },
    );
    expect(out).toEqual([{ id: 4, label: "Smeba" }]);
  });

  it("falls back to 'mailbox N' for ids missing from labels", () => {
    const out = getSwarmMailboxes([{ mailbox_id: 99 }], {});
    expect(out).toEqual([{ id: 99, label: "mailbox 99" }]);
  });

  it("ignores null mailbox_ids in rows", () => {
    const out = getSwarmMailboxes(
      [{ mailbox_id: null }, { mailbox_id: 7 }, { mailbox_id: null }],
      {},
    );
    expect(out).toEqual([{ id: 7, label: "mailbox 7" }]);
  });

  it("unions row ids with label-map ids and sorts ascending", () => {
    const out = getSwarmMailboxes(
      [{ mailbox_id: 100 }],
      { 4: "Smeba", 12: "Fire Control" },
    );
    expect(out).toEqual([
      { id: 4, label: "Smeba" },
      { id: 12, label: "Fire Control" },
      { id: 100, label: "mailbox 100" },
    ]);
  });
});
