// Phase 86 Plan 03 Task 1 — RED then GREEN for DiscoveryTabStrip.
//
// Locked by drift #3 (86-03-PLAN): DiscoveryTabStrip is a PEER component to
// StageTabStrip — NOT a widening of derive-stage-tabs.ts. The numeric stage
// literal-union (0|1|2|3|4) is RFC-architecture-locked. This strip carries a
// string-literal key union ("intent-proposals" today; V9.0/V11.0 extend it).
//
// Present-condition for the "Intent proposals" tab:
//   Boolean(swarm.stage3_coordinator_agent_key)
// because intent proposals only exist when Stage 3 runs (proposals are emitted
// from pipeline_events.decision_details by the Stage 3 coordinator).
//
// Hard-separation reminder: this surface is read-only over
// intent_proposal_clusters; it never reads swarm_noise_categories and never
// writes swarm_intents.

import { describe, it, expect } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import type { SwarmRow } from "@/lib/swarms/types";
import { DiscoveryTabStrip, deriveDiscoveryTabs } from "../discovery-tab-strip";

afterEach(() => cleanup());

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

describe("deriveDiscoveryTabs", () => {
  it("Stage 3 configured → 'intent-proposals' tab is present", () => {
    const swarm: SwarmRow = {
      ...baseSwarm,
      stage3_coordinator_agent_key: "debtor-email-coordinator",
    };
    const tabs = deriveDiscoveryTabs(swarm);
    expect(tabs).toHaveLength(1);
    expect(tabs[0].key).toBe("intent-proposals");
    expect(tabs[0].slug).toBe("intent-proposals");
    expect(tabs[0].label).toBe("Intent proposals");
    expect(tabs[0].present).toBe(true);
  });

  it("Stage 3 NOT configured → 'intent-proposals' tab present:false", () => {
    const tabs = deriveDiscoveryTabs(baseSwarm);
    expect(tabs[0].present).toBe(false);
  });

  it("ignores swarm_type (registry-driven, not name-branched)", () => {
    const swarm: SwarmRow = {
      ...baseSwarm,
      swarm_type: "sales-email",
      stage3_coordinator_agent_key: "sales-email-coordinator",
    };
    const tabs = deriveDiscoveryTabs(swarm);
    expect(tabs[0].present).toBe(true);
    // slug is hardcoded — does not template the swarm_type
    expect(tabs[0].slug).toBe("intent-proposals");
  });
});

describe("DiscoveryTabStrip", () => {
  it("renders nothing when no tabs are present", () => {
    const { container } = render(<DiscoveryTabStrip swarm={baseSwarm} />);
    expect(container.firstChild).toBeNull();
  });

  it("renders 'Intent proposals' link when Stage 3 is configured", () => {
    const swarm: SwarmRow = {
      ...baseSwarm,
      stage3_coordinator_agent_key: "debtor-email-coordinator",
    };
    render(<DiscoveryTabStrip swarm={swarm} />);
    const link = screen.getByRole("link", { name: "Intent proposals" });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe(
      "/automations/debtor-email/intent-proposals",
    );
  });

  it("marks the current tab via aria-current=page", () => {
    const swarm: SwarmRow = {
      ...baseSwarm,
      stage3_coordinator_agent_key: "debtor-email-coordinator",
    };
    render(
      <DiscoveryTabStrip swarm={swarm} current="intent-proposals" />,
    );
    const link = screen.getByRole("link", { name: "Intent proposals" });
    expect(link.getAttribute("aria-current")).toBe("page");
  });

  it("does NOT mark aria-current when 'current' prop omitted", () => {
    const swarm: SwarmRow = {
      ...baseSwarm,
      stage3_coordinator_agent_key: "debtor-email-coordinator",
    };
    render(<DiscoveryTabStrip swarm={swarm} />);
    const link = screen.getByRole("link", { name: "Intent proposals" });
    expect(link.getAttribute("aria-current")).toBeNull();
  });
});
