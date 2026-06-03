// Phase 76 Plan 06 Task 1 — registry-driven stage-tab derivation (D-05.5 NEW).
//
// Pure function: SwarmRow → array of `{stage, label, slug, present}`. The
// stage-tab-strip component renders only `present:true` tabs. Stage 4 is
// universal (always present); Stages 1/3 are present iff the swarm has the
// corresponding registry binding.
//
// Bulk Review consolidation (REQ-01, this milestone): Stage 0 and Stage 2 no
// longer have standalone per-stage routes — `/stage-0` and `/stage-2` redirect
// to the unified Bulk Review surface (`/review`), where the Stage 0 Safety
// facet and the Stage 2 Customer cells/override live. They are therefore
// dropped from the tab strip (clicking a tab must never land on a redirect).
// Their per-row data is still surfaced via the shared 5-axis detail pane and
// via `/review`. This supersedes v8.0 Phase 82's per-stage browse for stages
// 0 and 2; stages 1/3/4 keep their unified-shell browse routes.
//
// Cross-swarm reuse contract: zero literal swarm-name branches here. Phase
// 78 (sales-email) lights up the same shell by inserting a registry row.
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/README.md):
//   - Stage 0 = safety (browse via /review Safety facet)
//   - Stage 1 = noise filter (swarms.stage1_regex_module)
//   - Stage 2 = entity resolution (browse via /review Customer cells)
//   - Stage 3 = ranked-intent classifier (swarms.stage3_coordinator_agent_key)
//   - Stage 4 = handler (always — handler-error queue is universal)

import type { SwarmRow } from "@/lib/swarms/types";

export interface StageTab {
  stage: 0 | 1 | 2 | 3 | 4;
  label: string;
  slug: string;
  present: boolean;
}

// Stages 0 and 2 are intentionally absent — their routes redirect to /review
// (Bulk Review consolidation, REQ-01). The StageTab.stage union keeps 0|2 for
// the shared detail pane, which still renders all five stage sections per row.
const FIXED: ReadonlyArray<{ stage: 0 | 1 | 2 | 3 | 4; label: string; slug: string }> = [
  { stage: 1, label: "Stage 1 · Noise", slug: "stage-1" },
  { stage: 3, label: "Stage 3 · Intent", slug: "stage-3" },
  { stage: 4, label: "Stage 4 · Handler", slug: "stage-4" },
];

export function deriveStageTabs(swarm: SwarmRow): StageTab[] {
  return FIXED.map((t) => {
    let present = false;
    if (t.stage === 1) present = Boolean(swarm.stage1_regex_module);
    if (t.stage === 3) present = Boolean(swarm.stage3_coordinator_agent_key);
    if (t.stage === 4) present = true;
    return { ...t, present };
  });
}
