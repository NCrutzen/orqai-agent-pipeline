// Phase 4 Plan 02 Task 1 — hydrateCandidatesForSwarm tests.
//
// Hydration query contract:
//   - SELECT * FROM public.promotion_candidates
//   - WHERE swarm_type = $1
//   - ORDER BY stage ASC, expected_savings_cents_per_month DESC NULLS LAST
//
// The Patterns listing surface (Plan 02) is a CONSUMER of the
// promotion_candidates rows Plan 01 emits. It never reads from
// swarm_noise_categories (Stage 1 vocabulary) or swarm_intents (Stage 3
// vocabulary) — hard-separation is preserved at the data source.

import { describe, it, expect, vi, beforeEach } from "vitest";

const fromMock = vi.fn();
const adminMock = {
  from: (...args: unknown[]) => fromMock(...args),
};

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => adminMock,
}));

beforeEach(() => {
  fromMock.mockReset();
});

async function importHydrate() {
  const mod = await import("../../_lib/hydrate-candidates");
  return mod.hydrateCandidatesForSwarm;
}

describe("hydrateCandidatesForSwarm", () => {
  it("queries promotion_candidates with the locked filter + order chain", async () => {
    const orderInner = vi.fn().mockResolvedValue({ data: [], error: null });
    const orderOuter = vi.fn().mockReturnValue({ order: orderInner });
    const eqMock = vi.fn().mockReturnValue({ order: orderOuter });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ select: selectMock });

    const hydrateCandidatesForSwarm = await importHydrate();
    await hydrateCandidatesForSwarm("debtor-email");

    expect(fromMock).toHaveBeenCalledWith("promotion_candidates");
    expect(selectMock).toHaveBeenCalledWith("*");
    expect(eqMock).toHaveBeenCalledWith("swarm_type", "debtor-email");
    expect(orderOuter).toHaveBeenCalledWith("stage", { ascending: true });
    expect(orderInner).toHaveBeenCalledWith(
      "expected_savings_cents_per_month",
      { ascending: false, nullsFirst: false },
    );
  });

  it("returns rows verbatim from the query result", async () => {
    const sample = [
      {
        id: "c-1",
        kind: "regex_rule",
        swarm_type: "debtor-email",
        stage: "1-noise",
        signature_key: "abc",
        proposed_change: { display_signature: "Filter rule …", structured_payload: { kind: "regex_rule", subject_pattern: "x" } },
        evidence_event_ids: [],
        evidence_email_ids: [],
        matched_event_count_30d: 5,
        confirm_rate: 1,
        expected_savings_cents_per_month: 1200,
        savings_calculation_version: 1,
        status: "open",
        approved_by: null,
        approved_at: null,
        dismissed_by: null,
        dismissed_at: null,
        created_at: "2026-05-25T00:00:00Z",
        updated_at: "2026-05-25T00:00:00Z",
      },
    ];
    const orderInner = vi
      .fn()
      .mockResolvedValue({ data: sample, error: null });
    const orderOuter = vi.fn().mockReturnValue({ order: orderInner });
    const eqMock = vi.fn().mockReturnValue({ order: orderOuter });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ select: selectMock });

    const hydrateCandidatesForSwarm = await importHydrate();
    const rows = await hydrateCandidatesForSwarm("debtor-email");

    expect(rows).toEqual(sample);
  });

  it("returns [] when supabase returns null data", async () => {
    const orderInner = vi.fn().mockResolvedValue({ data: null, error: null });
    const orderOuter = vi.fn().mockReturnValue({ order: orderInner });
    const eqMock = vi.fn().mockReturnValue({ order: orderOuter });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ select: selectMock });

    const hydrateCandidatesForSwarm = await importHydrate();
    const rows = await hydrateCandidatesForSwarm("debtor-email");

    expect(rows).toEqual([]);
  });

  it("throws when supabase returns an error", async () => {
    const orderInner = vi
      .fn()
      .mockResolvedValue({ data: null, error: { message: "boom" } });
    const orderOuter = vi.fn().mockReturnValue({ order: orderInner });
    const eqMock = vi.fn().mockReturnValue({ order: orderOuter });
    const selectMock = vi.fn().mockReturnValue({ eq: eqMock });
    fromMock.mockReturnValue({ select: selectMock });

    const hydrateCandidatesForSwarm = await importHydrate();
    await expect(
      hydrateCandidatesForSwarm("debtor-email"),
    ).rejects.toBeTruthy();
  });
});
