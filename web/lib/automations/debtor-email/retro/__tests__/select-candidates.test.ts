/**
 * Phase 87 Plan 02 Task 1 — RED → GREEN for `selectCandidates`.
 *
 * Helper queries `pipeline_events` for stage=3 events in [since, until) and
 * returns recency-ordered candidates. D-03 enforces a hard 5000-row cap with
 * a fail-loud throw.
 */
import { describe, it, expect } from "vitest";
import {
  SAMPLE_PIPELINE_EVENTS,
  buildMockAdmin,
  type FixturePipelineEvent,
} from "./fixtures/sample-emails";
import {
  selectCandidates,
  STAGE_3_RETRO_HARD_CAP,
} from "../select-candidates";

const WINDOW = {
  swarm_type: "debtor-email",
  since: "2026-05-01T00:00:00Z",
  until: "2026-05-31T00:00:00Z",
};

describe("Phase 87 selectCandidates", () => {
  it("returns rows in DESC created_at order", async () => {
    const admin = buildMockAdmin({
      pipeline_events: SAMPLE_PIPELINE_EVENTS,
    });

    const out = await selectCandidates(
      admin as unknown as Parameters<typeof selectCandidates>[0],
      WINDOW,
    );

    expect(out).toHaveLength(3);
    // SAMPLE_PIPELINE_EVENTS are dated 10/11/12 May; recency DESC = 12, 11, 10.
    expect(out.map((r) => r.email_id)).toEqual([
      "33333333-3333-3333-3333-333333333333",
      "22222222-2222-2222-2222-222222222222",
      "11111111-1111-1111-1111-111111111111",
    ]);
  });

  it("maps decision → original_top_intent and confidence → original_confidence", async () => {
    const admin = buildMockAdmin({
      pipeline_events: SAMPLE_PIPELINE_EVENTS,
    });

    const out = await selectCandidates(
      admin as unknown as Parameters<typeof selectCandidates>[0],
      WINDOW,
    );

    const row = out.find(
      (r) => r.email_id === "22222222-2222-2222-2222-222222222222",
    );
    expect(row?.original_top_intent).toBe("payment_dispute");
    expect(row?.original_confidence).toBeCloseTo(0.91);
  });

  it("throws with literal 'Phase 87 D-03 cap exceeded' when rows > cap", async () => {
    const tooMany: FixturePipelineEvent[] = Array.from(
      { length: STAGE_3_RETRO_HARD_CAP + 1 },
      (_, i) => ({
        email_id: `aaaaaaaa-0000-0000-0000-${String(i).padStart(12, "0")}`,
        decision: "general_inquiry",
        confidence: 0.5,
        created_at: `2026-05-10T08:30:${String(i % 60).padStart(2, "0")}Z`,
        swarm_type: "debtor-email",
        stage: 3,
      }),
    );
    const admin = buildMockAdmin({ pipeline_events: tooMany });

    await expect(
      selectCandidates(
        admin as unknown as Parameters<typeof selectCandidates>[0],
        WINDOW,
      ),
    ).rejects.toThrow(/Phase 87 D-03 cap exceeded/);
  });

  it("returns [] (no throw) for an empty window", async () => {
    const admin = buildMockAdmin({ pipeline_events: [] });
    const out = await selectCandidates(
      admin as unknown as Parameters<typeof selectCandidates>[0],
      WINDOW,
    );
    expect(out).toEqual([]);
  });

  it("only queries swarm_type AND stage=3 (chained .eq calls)", async () => {
    const admin = buildMockAdmin({
      pipeline_events: SAMPLE_PIPELINE_EVENTS,
    });
    await selectCandidates(
      admin as unknown as Parameters<typeof selectCandidates>[0],
      WINDOW,
    );

    const eqCols = admin._calls.eqCalls.map((c) => c.col);
    expect(eqCols).toContain("swarm_type");
    expect(eqCols).toContain("stage");
    const stageCall = admin._calls.eqCalls.find((c) => c.col === "stage");
    expect(stageCall?.val).toBe(3);
    const swarmCall = admin._calls.eqCalls.find(
      (c) => c.col === "swarm_type",
    );
    expect(swarmCall?.val).toBe("debtor-email");
  });
});
