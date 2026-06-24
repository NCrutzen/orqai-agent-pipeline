import { describe, it, expect } from "vitest";
import {
  isForwardSubject,
  pickForwardRecipient,
  buildForwardObservations,
  type HeldVerdict,
  type ForwardRecord,
} from "../forward-observer";

describe("isForwardSubject", () => {
  it("recognises forward prefixes across locales", () => {
    expect(isForwardSubject("FW: Offerte")).toBe(true);
    expect(isForwardSubject("Fwd: keuring")).toBe(true);
    expect(isForwardSubject("Doorst: storing")).toBe(true);
    expect(isForwardSubject("  WG: Anfrage")).toBe(true);
  });
  it("rejects fresh composes and replies", () => {
    expect(isForwardSubject("Offerteaanvraag")).toBe(false);
    expect(isForwardSubject("RE: Offerte")).toBe(false);
    expect(isForwardSubject(null)).toBe(false);
    expect(isForwardSubject("")).toBe(false);
  });
});

describe("pickForwardRecipient", () => {
  it("takes the first To recipient, lowercased", () => {
    expect(
      pickForwardRecipient([
        { emailAddress: { address: "Verkoop@Smeba.NL" } },
        { emailAddress: { address: "x@y.nl" } },
      ]),
    ).toBe("verkoop@smeba.nl");
  });
  it("returns null when there is no recipient", () => {
    expect(pickForwardRecipient([])).toBeNull();
    expect(pickForwardRecipient(undefined)).toBeNull();
  });
});

describe("buildForwardObservations", () => {
  const destinations = [
    { destination_key: "verkoop", brand: "smeba", target_mailbox: "verkoop@smeba.nl", outlook_category: "Verkoop" },
    { destination_key: "inspecties", brand: "smeba", target_mailbox: "planning@smeba.nl", outlook_category: "Inspecties" },
  ];
  const verdicts: HeldVerdict[] = [
    { email_id: "e1", conversation_id: "c1", source_mailbox: "info@smeba.nl", predicted_bucket: "verkoop", predicted_target: "verkoop@smeba.nl", brand: "smeba" },
    { email_id: "e2", conversation_id: "c2", source_mailbox: "info@smeba.nl", predicted_bucket: "verkoop", predicted_target: "verkoop@smeba.nl", brand: "smeba" },
    { email_id: "e3", conversation_id: "c3", source_mailbox: "info@smeba.nl", predicted_bucket: "inspecties", predicted_target: "planning@smeba.nl", brand: "smeba" },
    { email_id: "e4", conversation_id: null, source_mailbox: "info@smeba.nl", predicted_bucket: "verkoop", predicted_target: "verkoop@smeba.nl", brand: "smeba" },
  ];
  const forwards = new Map<string, ForwardRecord>([
    ["c1", { toAddress: "verkoop@smeba.nl", sentAt: "2026-06-24T10:00:00Z" }], // agree
    ["c2", { toAddress: "planning@smeba.nl", sentAt: "2026-06-24T11:00:00Z" }], // disagree (forwarded to inspecties)
    ["c3", { toAddress: "jan@smeba.nl", sentAt: "2026-06-24T12:00:00Z" }], // ungraded (personal)
  ]);

  it("matches forwards by conversation_id and grades agree/disagree", () => {
    const rows = buildForwardObservations(verdicts, forwards, destinations);
    // e4 (no conversation) dropped; e1/e2/e3 matched.
    expect(rows.map((r) => r.email_id).sort()).toEqual(["e1", "e2", "e3"]);

    const e1 = rows.find((r) => r.email_id === "e1")!;
    expect(e1.observed_bucket).toBe("verkoop");
    expect(e1.agree).toBe(true);

    const e2 = rows.find((r) => r.email_id === "e2")!;
    expect(e2.observed_bucket).toBe("inspecties");
    expect(e2.agree).toBe(false); // predicted verkoop, forwarded to inspecties

    const e3 = rows.find((r) => r.email_id === "e3")!;
    expect(e3.observed_bucket).toBeNull(); // personal mailbox → ungraded
    expect(e3.agree).toBe(false);
  });

  it("drops verdicts whose conversation has no forward yet", () => {
    const rows = buildForwardObservations(
      [verdicts[0]],
      new Map(),
      destinations,
    );
    expect(rows).toEqual([]);
  });
});
