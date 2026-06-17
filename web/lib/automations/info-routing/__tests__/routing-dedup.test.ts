/**
 * Phase 131 Plan 04 Task 1 (ROUTE-05) — the two-layer duplicate-delivery guard.
 *
 * Layer (a) ALWAYS: the resolved target mailbox appearing in the email's To/CC
 * (read from raw_json.toRecipients/ccRecipients — the flat `recipients` column
 * is NULL for info-routing ingest rows — tolerant of all 3 live ingest shapes)
 * → already_addressed / matched_layer='to_cc'.
 *
 * Layer (b) OPPORTUNISTIC: the same normalized internet_message_id (or
 * conversation_id) already present where mailbox≈target_mailbox (matched BY
 * ADDRESS, not the display-name `mailbox`) for an INGESTED target (order@) →
 * already_addressed / matched_layer='message_id'|'conversation'. A non-ingested
 * target → graceful skip + coverage-gap log (no throw, no block); layer (a)
 * still decides.
 *
 * A non-duplicate email → routable / matched_layer=null. Message-ids are
 * normalized (strip <>, trim, lowercase) on BOTH sides before matching.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  extractRecipientAddresses,
  normalizeMessageId,
  checkDuplicateDelivery,
} from "../dedup";

describe("extractRecipientAddresses — 3 live ingest shapes", () => {
  it("Graph (info-routing source rows): reads raw_json.toRecipients/ccRecipients, NOT the NULL recipients column", () => {
    const row = {
      recipients: null, // NULL for zapier-info-routing-ingest rows
      raw_json: {
        toRecipients: [{ emailAddress: { address: "Order@Smeba.nl" } }],
        ccRecipients: [{ emailAddress: { address: "extra@smeba.nl" } }],
      },
    };
    const out = extractRecipientAddresses(row);
    expect(out).toContain("order@smeba.nl"); // lowercased
    expect(out).toContain("extra@smeba.nl");
  });

  it("outlook rows: recipients {to,cc} with {address}", () => {
    const row = {
      recipients: {
        to: [{ address: "order@smeba.nl" }],
        cc: [{ address: "CC@smeba.nl" }],
      },
      raw_json: {},
    };
    const out = extractRecipientAddresses(row);
    expect(out).toContain("order@smeba.nl");
    expect(out).toContain("cc@smeba.nl");
  });

  it("sugarcrm rows: recipients [{email}]", () => {
    const row = {
      recipients: [{ email: "Order@smeba.nl" }, { email: "other@smeba.nl" }],
      raw_json: {},
    };
    const out = extractRecipientAddresses(row);
    expect(out).toContain("order@smeba.nl");
    expect(out).toContain("other@smeba.nl");
  });

  it("dedupes + lowercases across raw_json and recipients", () => {
    const row = {
      recipients: { to: [{ address: "ORDER@smeba.nl" }] },
      raw_json: { toRecipients: [{ emailAddress: { address: "order@smeba.nl" } }] },
    };
    const out = extractRecipientAddresses(row);
    expect(out.filter((a) => a === "order@smeba.nl")).toHaveLength(1);
  });

  it("tolerates missing/empty shapes without throwing", () => {
    expect(extractRecipientAddresses({ recipients: null, raw_json: null })).toEqual([]);
    expect(extractRecipientAddresses({ recipients: undefined, raw_json: undefined })).toEqual([]);
  });
});

describe("normalizeMessageId", () => {
  it("strips leading/trailing <>, trims, lowercases", () => {
    expect(normalizeMessageId("<ID@HOST>")).toBe("id@host");
    expect(normalizeMessageId("  <ID@host> ")).toBe("id@host");
    expect(normalizeMessageId("id@host")).toBe("id@host");
  });

  it("makes <ID@host> and <id@HOST> match", () => {
    expect(normalizeMessageId("<ID@host>")).toBe(normalizeMessageId("<id@HOST>"));
  });
});

// ---- checkDuplicateDelivery (layer a + layer b) ---------------------------
// admin is a minimal structural mock — layer (b) issues a single select against
// email_pipeline.emails. We record the query and return canned rows.

function makeAdminMock(rows: Array<Record<string, unknown>>) {
  const calls: Array<Record<string, unknown>> = [];
  const builder: Record<string, unknown> = {};
  const filters: Record<string, unknown> = {};
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn((col: string, val: unknown) => {
    filters[col] = val;
    return builder;
  });
  builder.in = vi.fn(() => builder);
  builder.ilike = vi.fn((col: string, val: unknown) => {
    filters[`ilike:${col}`] = val;
    return builder;
  });
  builder.limit = vi.fn(async () => {
    calls.push({ ...filters });
    return { data: rows, error: null };
  });
  // allow await without .limit (in case impl ends on .ilike/.eq) — make builder thenable
  builder.then = (res: (v: { data: unknown; error: null }) => unknown) => {
    calls.push({ ...filters });
    return Promise.resolve({ data: rows, error: null }).then(res);
  };
  const admin = {
    from: vi.fn((table: string) => {
      filters.__table = table;
      return builder;
    }),
    __calls: calls,
  };
  return admin;
}

describe("checkDuplicateDelivery — layer (a) To/CC", () => {
  it("resolved target mailbox in raw_json.ccRecipients → already_addressed / to_cc (proves raw_json read, not NULL recipients)", async () => {
    const emailRow = {
      recipients: null,
      raw_json: {
        ccRecipients: [{ emailAddress: { address: "order@smeba.nl" } }],
        internetMessageId: "<src@host>",
      },
    };
    const res = await checkDuplicateDelivery({
      emailRow,
      targetMailbox: "order@smeba.nl",
      admin: makeAdminMock([]),
      ingestedTargetMailboxes: ["order@smeba.nl"],
    });
    expect(res).toEqual({ status: "already_addressed", matched_layer: "to_cc" });
  });

  it("case-insensitive target match", async () => {
    const emailRow = {
      recipients: null,
      raw_json: { toRecipients: [{ emailAddress: { address: "ORDER@smeba.nl" } }] },
    };
    const res = await checkDuplicateDelivery({
      emailRow,
      targetMailbox: "Order@Smeba.nl",
      admin: makeAdminMock([]),
      ingestedTargetMailboxes: ["order@smeba.nl"],
    });
    expect(res.status).toBe("already_addressed");
    expect(res.matched_layer).toBe("to_cc");
  });
});

describe("checkDuplicateDelivery — layer (b) message-id / conversation", () => {
  it("normalized internet_message_id already present at the (ingested) target mailbox → already_addressed / message_id", async () => {
    const emailRow = {
      recipients: null,
      raw_json: { internetMessageId: "<ID@host>" }, // NOT a recipient → layer (a) misses
    };
    // target mailbox row carries a mixed-case bracketed id — normalization matches.
    const admin = makeAdminMock([{ internet_message_id: "<id@HOST>", conversation_id: "conv-1" }]);
    const res = await checkDuplicateDelivery({
      emailRow,
      targetMailbox: "order@smeba.nl",
      admin,
      ingestedTargetMailboxes: ["order@smeba.nl"],
    });
    expect(res).toEqual({ status: "already_addressed", matched_layer: "message_id" });
  });

  it("conversation_id match (no message-id match) → already_addressed / conversation", async () => {
    const emailRow = {
      recipients: null,
      raw_json: { internetMessageId: "<other@host>", conversationId: "CONV-XYZ" },
    };
    const admin = makeAdminMock([{ internet_message_id: "<nomatch@host>", conversation_id: "conv-xyz" }]);
    const res = await checkDuplicateDelivery({
      emailRow,
      targetMailbox: "order@smeba.nl",
      admin,
      ingestedTargetMailboxes: ["order@smeba.nl"],
    });
    expect(res).toEqual({ status: "already_addressed", matched_layer: "conversation" });
  });

  it("non-ingested target → layer (b) gracefully skips (no throw) + logs a coverage gap; layer (a) decides routable", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const emailRow = {
      recipients: null,
      raw_json: { internetMessageId: "<id@host>" },
    };
    const admin = makeAdminMock([{ internet_message_id: "<id@host>" }]);
    const res = await checkDuplicateDelivery({
      emailRow,
      targetMailbox: "planning@fire-control.nl", // NOT in ingested list
      admin,
      ingestedTargetMailboxes: ["order@smeba.nl"],
    });
    expect(res).toEqual({ status: "routable", matched_layer: null });
    // layer (b) DB query must NOT have run for the non-ingested target.
    expect((admin as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
    // coverage-gap log emitted.
    expect(warn).toHaveBeenCalled();
    expect(String(warn.mock.calls[0]?.[0] ?? "")).toMatch(/coverage/i);
    warn.mockRestore();
  });
});

describe("checkDuplicateDelivery — non-duplicate", () => {
  it("not in To/CC, no id match at target → routable / null", async () => {
    const emailRow = {
      recipients: null,
      raw_json: {
        toRecipients: [{ emailAddress: { address: "someoneelse@smeba.nl" } }],
        internetMessageId: "<src@host>",
      },
    };
    const admin = makeAdminMock([]); // no rows at target → no id match
    const res = await checkDuplicateDelivery({
      emailRow,
      targetMailbox: "order@smeba.nl",
      admin,
      ingestedTargetMailboxes: ["order@smeba.nl"],
    });
    expect(res).toEqual({ status: "routable", matched_layer: null });
  });

  it("null/empty target mailbox (unrouted) → routable / null, no query", async () => {
    const admin = makeAdminMock([]);
    const res = await checkDuplicateDelivery({
      emailRow: { recipients: null, raw_json: {} },
      targetMailbox: null,
      admin,
      ingestedTargetMailboxes: ["order@smeba.nl"],
    });
    expect(res).toEqual({ status: "routable", matched_layer: null });
    expect((admin as { from: ReturnType<typeof vi.fn> }).from).not.toHaveBeenCalled();
  });
});
