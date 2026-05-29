// Phase 76 Plan 06 Task 1 — RED then GREEN.
//
// deriveStageTabs(swarm) is registry-driven (D-05.5 NEW): the tab list is
// derived from the swarms registry row, NOT hardcoded per swarm. This is
// the cross-swarm reuse contract — Phase 78 (sales-email) lights up the
// same shell with zero UI changes.
//
// Bulk Review consolidation (REQ-01): Stage 0 and Stage 2 no longer have
// standalone per-stage routes — they redirect to /review — so they are NOT
// tabs. Stage 4 is universal (always present); Stage 1 / Stage 3 are present
// iff the swarm has the corresponding registry binding. Stage 1 = noise filter
// (swarm_noise_categories), Stage 3 = intent classifier (swarm_intents) —
// hard separation preserved.

import { describe, it, expect } from "vitest";
import type { SwarmRow } from "@/lib/swarms/types";
import { deriveStageTabs } from "../derive-stage-tabs";

const baseSwarm: SwarmRow = {
  swarm_type: "debtor-email",
  display_name: "Debtor Email",
  description: null,
  review_route: "/automations/debtor-email/review",
  source_table: "email_pipeline.emails",
  enabled: true,
  ui_config: {
    tree_levels: [],
    row_columns: [],
    drawer_fields: [],
    default_sort: "",
  },
  side_effects: null,
  stage1_regex_module: null,
  stage2_entity_resolver: null,
  stage3_coordinator_agent_key: null,
  canonical_context_shape: null,
  entity_brand: null,
  tenant_domains: [],
};

describe("deriveStageTabs", () => {
  it("full registry row → 3 tabs (stages 1, 3, 4); stage 0 + 2 are NOT tabs (redirect to /review)", () => {
    const swarm: SwarmRow = {
      ...baseSwarm,
      stage1_regex_module: "debtor-email/classifier",
      stage2_entity_resolver: "debtor-email/label-resolver",
      stage3_coordinator_agent_key: "debtor-email-coordinator",
    };
    const tabs = deriveStageTabs(swarm);
    expect(tabs).toHaveLength(3);
    expect(tabs.every((t) => t.present)).toBe(true);
    expect(tabs.map((t) => t.stage)).toEqual([1, 3, 4]);
    // Stage 0 and Stage 2 retired to Bulk Review (/review) — never tabs.
    expect(tabs.find((t) => t.stage === 0)).toBeUndefined();
    expect(tabs.find((t) => t.stage === 2)).toBeUndefined();
  });

  it("missing stage1_regex_module → stage 1 present:false", () => {
    const swarm: SwarmRow = {
      ...baseSwarm,
      stage1_regex_module: null,
      stage2_entity_resolver: "debtor-email/label-resolver",
      stage3_coordinator_agent_key: "debtor-email-coordinator",
    };
    const tabs = deriveStageTabs(swarm);
    expect(tabs.find((t) => t.stage === 1)?.present).toBe(false);
    expect(tabs.find((t) => t.stage === 3)?.present).toBe(true);
    expect(tabs.find((t) => t.stage === 4)?.present).toBe(true);
    // Stage 2 is never a tab regardless of its registry binding.
    expect(tabs.find((t) => t.stage === 2)).toBeUndefined();
  });

  it("minimal row → only stage 4 present:true (stages 0 + 2 absent)", () => {
    const tabs = deriveStageTabs(baseSwarm);
    expect(tabs.find((t) => t.stage === 0)).toBeUndefined();
    expect(tabs.find((t) => t.stage === 1)?.present).toBe(false);
    expect(tabs.find((t) => t.stage === 2)).toBeUndefined();
    expect(tabs.find((t) => t.stage === 3)?.present).toBe(false);
    expect(tabs.find((t) => t.stage === 4)?.present).toBe(true);
  });

  it("sales-email-shaped row (different bindings, same shape) → tabs match registry, NOT swarm_type", () => {
    const swarm: SwarmRow = {
      ...baseSwarm,
      swarm_type: "sales-email",
      display_name: "Sales Email",
      stage1_regex_module: "sales-email/classifier",
      stage2_entity_resolver: null, // sales-email has no Stage 2 yet
      stage3_coordinator_agent_key: "sales-email-coordinator",
    };
    const tabs = deriveStageTabs(swarm);
    // Identical present-mask to a debtor-email row with the same bindings —
    // proves the function ignores swarm_type entirely.
    expect(tabs.find((t) => t.stage === 1)?.present).toBe(true);
    expect(tabs.find((t) => t.stage === 2)).toBeUndefined();
    expect(tabs.find((t) => t.stage === 3)?.present).toBe(true);
    // Slug + label come from the FIXED table, not from swarm_type.
    expect(tabs.find((t) => t.stage === 3)?.slug).toBe("stage-3");
    expect(tabs.find((t) => t.stage === 3)?.label).toContain("Stage 3");
  });
});
