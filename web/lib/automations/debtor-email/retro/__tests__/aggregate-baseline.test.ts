/**
 * Phase 87 Plan 02 Task 3 — RED → GREEN for `aggregateBaseline`.
 *
 * Helper aggregates per-email retro verdicts (stage_3_retro_runs WHERE run_id)
 * into intent_volume_baselines rows (one per closed-list intent) plus proposal
 * cluster rows for the matching swarm + window.
 */
import { describe, it, expect } from "vitest";
import {
  buildMockAdmin,
  type FixtureRetroRunRow,
  type FixtureClusterRow,
} from "./fixtures/sample-emails";
import { aggregateBaseline } from "../aggregate-baseline";

const RUN_ID = "rrrrrrrr-rrrr-rrrr-rrrr-rrrrrrrrrrrr";
const ARGS = {
  run_id: RUN_ID,
  window_start: "2026-05-01",
  window_end: "2026-05-31",
  swarm_type: "debtor-email",
};

function rerow(intent: string, suffix: string): FixtureRetroRunRow {
  return { run_id: RUN_ID, email_id: `e${suffix}`, new_top_intent: intent };
}

describe("Phase 87 aggregateBaseline", () => {
  it("inserts one closed_list row per distinct new_top_intent with correct counts + share~1.0", async () => {
    const retro: FixtureRetroRunRow[] = [
      rerow("payment_dispute", "01"),
      rerow("payment_dispute", "02"),
      rerow("payment_dispute", "03"),
      rerow("payment_dispute", "04"),
      rerow("payment_dispute", "05"),
      rerow("copy_document_request", "06"),
      rerow("copy_document_request", "07"),
      rerow("copy_document_request", "08"),
      rerow("general_inquiry", "09"),
      rerow("general_inquiry", "10"),
    ];
    const admin = buildMockAdmin({
      stage_3_retro_runs: retro,
      intent_proposal_clusters: [],
    });

    const out = await aggregateBaseline(
      admin as unknown as Parameters<typeof aggregateBaseline>[0],
      ARGS,
    );

    expect(out.closed_list_rows).toBe(3);
    const inserted = admin._calls.inserts["intent_volume_baselines"] ?? [];
    expect(inserted).toHaveLength(3);

    const byIntent = new Map(
      inserted.map((r) => [
        (r as Record<string, unknown>).intent_key as string,
        r as Record<string, unknown>,
      ]),
    );
    expect(byIntent.get("payment_dispute")?.count).toBe(5);
    expect(byIntent.get("copy_document_request")?.count).toBe(3);
    expect(byIntent.get("general_inquiry")?.count).toBe(2);

    const totalShare = inserted.reduce(
      (s, r) => s + Number((r as Record<string, unknown>).share),
      0,
    );
    expect(totalShare).toBeCloseTo(1.0, 4);
  });

  it("stamps intent_source='closed_list' + window args on every closed-list row", async () => {
    const admin = buildMockAdmin({
      stage_3_retro_runs: [rerow("payment_dispute", "01")],
      intent_proposal_clusters: [],
    });
    await aggregateBaseline(
      admin as unknown as Parameters<typeof aggregateBaseline>[0],
      ARGS,
    );
    const inserted = admin._calls.inserts["intent_volume_baselines"] ?? [];
    const row = inserted[0] as Record<string, unknown>;
    expect(row.intent_source).toBe("closed_list");
    expect(row.window_start).toBe(ARGS.window_start);
    expect(row.window_end).toBe(ARGS.window_end);
    expect(row.swarm_type).toBe(ARGS.swarm_type);
  });

  it("appends proposal_cluster rows when intent_proposal_clusters has matches", async () => {
    const clusters: FixtureClusterRow[] = [
      {
        swarm_type: "debtor-email",
        centroid_label: "kvk_extract_request",
        member_count: 7,
        window_start: "2026-05-01",
        window_end: "2026-05-31",
      },
      {
        swarm_type: "debtor-email",
        centroid_label: "balansbevestiging",
        member_count: 3,
        window_start: "2026-05-01",
        window_end: "2026-05-31",
      },
    ];
    const admin = buildMockAdmin({
      stage_3_retro_runs: [
        rerow("payment_dispute", "01"),
        rerow("payment_dispute", "02"),
      ],
      intent_proposal_clusters: clusters,
    });

    const out = await aggregateBaseline(
      admin as unknown as Parameters<typeof aggregateBaseline>[0],
      ARGS,
    );

    expect(out.proposal_rows).toBe(2);
    const inserted = admin._calls.inserts["intent_volume_baselines"] ?? [];
    expect(inserted).toHaveLength(3); // 1 closed-list + 2 proposal
    const proposalRows = inserted.filter(
      (r) => (r as Record<string, unknown>).intent_source === "proposal_cluster",
    );
    expect(proposalRows).toHaveLength(2);
    const keys = proposalRows
      .map((r) => (r as Record<string, unknown>).intent_key)
      .sort();
    expect(keys).toEqual(["balansbevestiging", "kvk_extract_request"]);
  });

  it("empty retro run still inserts proposal rows if clusters exist (no divide-by-zero)", async () => {
    const admin = buildMockAdmin({
      stage_3_retro_runs: [],
      intent_proposal_clusters: [
        {
          swarm_type: "debtor-email",
          centroid_label: "kvk_extract_request",
          member_count: 7,
          window_start: "2026-05-01",
          window_end: "2026-05-31",
        },
      ],
    });
    const out = await aggregateBaseline(
      admin as unknown as Parameters<typeof aggregateBaseline>[0],
      ARGS,
    );
    expect(out.closed_list_rows).toBe(0);
    expect(out.proposal_rows).toBe(1);
    const inserted = admin._calls.inserts["intent_volume_baselines"] ?? [];
    expect(inserted).toHaveLength(1);
    expect((inserted[0] as Record<string, unknown>).share).toBe(0);
  });

  it("returns the actual insert counts", async () => {
    const admin = buildMockAdmin({
      stage_3_retro_runs: [
        rerow("payment_dispute", "01"),
        rerow("copy_document_request", "02"),
        rerow("other", "03"),
      ],
      intent_proposal_clusters: [
        {
          swarm_type: "debtor-email",
          centroid_label: "kvk_extract_request",
          member_count: 4,
          window_start: "2026-05-01",
          window_end: "2026-05-31",
        },
        {
          swarm_type: "debtor-email",
          centroid_label: "balansbevestiging",
          member_count: 2,
          window_start: "2026-05-01",
          window_end: "2026-05-31",
        },
      ],
    });
    const out = await aggregateBaseline(
      admin as unknown as Parameters<typeof aggregateBaseline>[0],
      ARGS,
    );
    expect(out).toEqual({ closed_list_rows: 3, proposal_rows: 2 });
  });
});
