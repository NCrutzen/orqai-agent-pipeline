// Phase 132 Plan 02 Task 1 — forward-state idempotency store unit tests.
//
// Mirrors written-category-store mechanics: upsert on conflict(email_id) and a
// read that returns null (never throws) when no row exists. The store backs the
// D-02 no-double-forward guard.

import { describe, it, expect, vi } from "vitest";
import { recordForwardState, readForwardState } from "../forward-state";

function makeUpsertAdmin() {
  const upsert = vi.fn().mockResolvedValue({ error: null });
  const from = vi.fn().mockReturnValue({ upsert });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: { from } as any, from, upsert };
}

function makeReadAdmin(result: { data: unknown; error: unknown }) {
  const maybeSingle = vi.fn().mockResolvedValue(result);
  const eq = vi.fn().mockReturnValue({ maybeSingle });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return { admin: { from } as any, from, select, eq, maybeSingle };
}

describe("forward-state store", () => {
  it("recordForwardState upserts onConflict email_id with the full payload", async () => {
    const { admin, from, upsert } = makeUpsertAdmin();
    await recordForwardState(admin, {
      email_id: "e1",
      swarm_type: "info-routing",
      status: "sent",
      draft_id: "draft-123",
      target_mailbox: "storingen@smeba.nl",
    });
    expect(from).toHaveBeenCalledWith("info_routing_forwards");
    expect(upsert).toHaveBeenCalledTimes(1);
    const [row, opts] = upsert.mock.calls[0];
    expect(row).toMatchObject({
      email_id: "e1",
      swarm_type: "info-routing",
      status: "sent",
      draft_id: "draft-123",
      target_mailbox: "storingen@smeba.nl",
    });
    expect(typeof row.updated_at).toBe("string");
    expect(opts).toEqual({ onConflict: "email_id" });
  });

  it("recordForwardState defaults draft_id/target_mailbox to null when omitted", async () => {
    const { admin, upsert } = makeUpsertAdmin();
    await recordForwardState(admin, {
      email_id: "e2",
      swarm_type: "info-routing",
      status: "held",
    });
    const [row] = upsert.mock.calls[0];
    expect(row.draft_id).toBeNull();
    expect(row.target_mailbox).toBeNull();
  });

  it("readForwardState returns the row when present", async () => {
    const { admin } = makeReadAdmin({
      data: {
        email_id: "e1",
        swarm_type: "info-routing",
        status: "sent",
        draft_id: "draft-123",
        target_mailbox: "storingen@smeba.nl",
        updated_at: "2026-06-18T00:00:00.000Z",
      },
      error: null,
    });
    const row = await readForwardState(admin, "e1");
    expect(row?.status).toBe("sent");
    expect(row?.draft_id).toBe("draft-123");
  });

  it("readForwardState returns null when absent (no throw)", async () => {
    const { admin } = makeReadAdmin({ data: null, error: null });
    const row = await readForwardState(admin, "missing");
    expect(row).toBeNull();
  });

  it("readForwardState returns null on a query error (no throw)", async () => {
    const { admin } = makeReadAdmin({ data: null, error: { message: "boom" } });
    const row = await readForwardState(admin, "e1");
    expect(row).toBeNull();
  });
});
