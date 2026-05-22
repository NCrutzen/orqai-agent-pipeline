// Phase 68 (R-01). evaluateSideEffects: trigger filter + gate equality match
// against runtime ctx. Mocks loadSwarm so the test runs without Supabase.

import { describe, it, expect, beforeEach, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

// Mock the registry so loadSwarm is replaceable per-test.
vi.mock("../registry", () => ({
  loadSwarm: vi.fn(),
}));

import { loadSwarm } from "../registry";
import { evaluateSideEffects } from "../side-effects";
import type { SwarmRow } from "../types";

const loadSwarmMock = vi.mocked(loadSwarm);

const baseSwarm = (sideEffects: unknown[]): SwarmRow => ({
  swarm_type: "debtor-email",
  display_name: "Debtor Email",
  description: null,
  review_route: "/automations/debtor-email/review",
  source_table: "automation_runs",
  enabled: true,
  ui_config: {
    tree_levels: ["topic"],
    row_columns: [],
    drawer_fields: [],
    default_sort: "created_at desc",
  },
  side_effects: sideEffects,
  stage1_regex_module: "@/lib/debtor-email/classify",
  stage2_entity_resolver: "@/lib/automations/debtor-email/resolve-debtor",
  stage3_coordinator_agent_key: "debtor-intent-agent",
  canonical_context_shape: null,
  entity_brand: ["smeba"],
  tenant_domains: [],
});

const icontrollerTagDescriptor = {
  kind: "inngest_event",
  event: "debtor-email/stage-2.icontroller-label.requested",
  trigger: "stage2_match_live",
  gate: {
    dry_run: false,
    customer_account_id_present: true,
    icontroller_company_present: true,
  },
  phase_origin: "67",
};

const cleanupDescriptor = {
  kind: "automation_run_insert",
  automation: "debtor-email-cleanup",
  trigger: "stage1_categorize_archive",
  gate: { category_action: "categorize_archive" },
  result_template: { stage: "icontroller_delete", icontroller: "pending" },
  phase_origin: "56.7",
};

const admin = {} as unknown as SupabaseClient;

describe("evaluateSideEffects", () => {
  beforeEach(() => {
    loadSwarmMock.mockReset();
  });

  it("returns the matching descriptor when trigger and gate equal ctx", async () => {
    loadSwarmMock.mockResolvedValue(
      baseSwarm([icontrollerTagDescriptor, cleanupDescriptor]),
    );
    const got = await evaluateSideEffects(admin, "debtor-email", "stage2_match_live", {
      dry_run: false,
      customer_account_id_present: true,
      icontroller_company_present: true,
    });
    expect(got).toHaveLength(1);
    expect(got[0].kind).toBe("inngest_event");
  });

  it("returns empty when gate differs (dry_run flipped)", async () => {
    loadSwarmMock.mockResolvedValue(
      baseSwarm([icontrollerTagDescriptor, cleanupDescriptor]),
    );
    const got = await evaluateSideEffects(admin, "debtor-email", "stage2_match_live", {
      dry_run: true,
      customer_account_id_present: true,
      icontroller_company_present: true,
    });
    expect(got).toHaveLength(0);
  });

  it("returns empty when trigger does not match any descriptor", async () => {
    loadSwarmMock.mockResolvedValue(
      baseSwarm([icontrollerTagDescriptor, cleanupDescriptor]),
    );
    const got = await evaluateSideEffects(
      admin,
      "debtor-email",
      "stage4_synthesis_complete",
      {},
    );
    expect(got).toHaveLength(0);
  });

  it("matches the cleanup descriptor on the stage1 trigger", async () => {
    loadSwarmMock.mockResolvedValue(
      baseSwarm([icontrollerTagDescriptor, cleanupDescriptor]),
    );
    const got = await evaluateSideEffects(
      admin,
      "debtor-email",
      "stage1_categorize_archive",
      { category_action: "categorize_archive" },
    );
    expect(got).toHaveLength(1);
    expect(got[0].kind).toBe("automation_run_insert");
  });

  it("returns empty when swarm has no side_effects", async () => {
    loadSwarmMock.mockResolvedValue(baseSwarm([]));
    const got = await evaluateSideEffects(admin, "debtor-email", "stage2_match_live", {});
    expect(got).toHaveLength(0);
  });

  it("returns empty when swarm row is null", async () => {
    loadSwarmMock.mockResolvedValue(null);
    const got = await evaluateSideEffects(admin, "missing", "stage2_match_live", {});
    expect(got).toHaveLength(0);
  });
});
