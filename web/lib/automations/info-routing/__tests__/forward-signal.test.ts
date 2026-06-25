import { describe, it, expect } from "vitest";
import {
  buildForwardSignalRow,
  type ForwardSignalInput,
} from "../forward-signal";

const base: ForwardSignalInput = {
  swarm_type: "info-routing",
  mailbox: "info@smeba.nl",
  email_id: "11111111-2222-3333-4444-555555555555",
  conversation_id: "AAQkAGI2THE_CONVERSATION_ID",
  predicted_bucket: "storingen",
  observed_bucket: "verkoop",
  observed_to_address: "verkoop@smeba.nl",
  forward_sent_at: "2026-06-20T09:00:00Z",
};

describe("buildForwardSignalRow — graded forward (D-02)", () => {
  it("produces the exact forward_observed row contract", () => {
    const row = buildForwardSignalRow(base);
    expect(row.verdict).toBe("forward_observed");
    expect(row.transition_kind).toBe("forward_observed");
    expect(row.swarm_type).toBe("info-routing");
    expect(row.mailbox).toBe("info@smeba.nl");
    expect(row.email_id).toBe("11111111-2222-3333-4444-555555555555");
    expect(row.category_key).toBe("storingen"); // carries predicted bucket
    expect(row.observed_at).toBe("2026-06-20T09:00:00Z"); // = forward_sent_at
  });

  it("keys dedupe_key on swarm_type|conversation_id|verdict|forward_sent_at", () => {
    const row = buildForwardSignalRow(base);
    expect(row.dedupe_key).toBe(
      "info-routing|AAQkAGI2THE_CONVERSATION_ID|forward_observed|2026-06-20T09:00:00Z",
    );
  });

  it("is pure: the same conversation+sentAt always yields an identical dedupe_key (re-scan-safe, Pitfall 4)", () => {
    const a = buildForwardSignalRow(base);
    const b = buildForwardSignalRow({ ...base });
    expect(a.dedupe_key).toBe(b.dedupe_key);
  });

  it("a re-forward of the same conversation at a NEW sentAt yields a DIFFERENT dedupe_key (Pitfall 4)", () => {
    const a = buildForwardSignalRow(base);
    const b = buildForwardSignalRow({
      ...base,
      forward_sent_at: "2026-06-21T14:30:00Z", // corrected re-forward = new observation
    });
    expect(a.dedupe_key).not.toBe(b.dedupe_key);
  });

  it("makes observed_bucket + predicted_bucket + To-address reconstructable from the row alone (A6)", () => {
    const row = buildForwardSignalRow(base);
    expect(row.observed_meta.observed_bucket).toBe("verkoop");
    expect(row.observed_meta.predicted_bucket).toBe("storingen");
    expect(row.observed_meta.observed_to_address).toBe("verkoop@smeba.nl");
  });
});

describe("buildForwardSignalRow — no-verdict forward (Pitfall 5)", () => {
  const noVerdict: ForwardSignalInput = {
    ...base,
    predicted_bucket: null, // no persisted Stage-3 verdict (or unrouted)
  };

  it("uses the forward_observed_no_verdict verdict/transition_kind", () => {
    const row = buildForwardSignalRow(noVerdict);
    expect(row.verdict).toBe("forward_observed_no_verdict");
    expect(row.transition_kind).toBe("forward_observed_no_verdict");
  });

  it("flags the row so callers never feed it to Wilson (category_key null + predicted_bucket null)", () => {
    const row = buildForwardSignalRow(noVerdict);
    expect(row.category_key).toBeNull();
    expect(row.observed_meta.predicted_bucket).toBeNull();
  });

  it("gets a DISTINCT dedupe_key suffix from a graded forward of the same conversation+sentAt", () => {
    const graded = buildForwardSignalRow(base);
    const noVerd = buildForwardSignalRow(noVerdict);
    // verdict is part of the key, so a graded and a no-verdict observation of the
    // same conversation at the same sentAt never collide.
    expect(noVerd.dedupe_key).not.toBe(graded.dedupe_key);
    expect(noVerd.dedupe_key).toBe(
      "info-routing|AAQkAGI2THE_CONVERSATION_ID|forward_observed_no_verdict|2026-06-20T09:00:00Z",
    );
  });

  it("still carries the observed To-address so the unmapped target is auditable (A6)", () => {
    const row = buildForwardSignalRow({
      ...noVerdict,
      observed_bucket: null, // forwarded to a personal/external address
      observed_to_address: "jan.devries@smeba.nl",
    });
    expect(row.observed_meta.observed_to_address).toBe("jan.devries@smeba.nl");
    expect(row.observed_meta.observed_bucket).toBeNull();
  });
});
