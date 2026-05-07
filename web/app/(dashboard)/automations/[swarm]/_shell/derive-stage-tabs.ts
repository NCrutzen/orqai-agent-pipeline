// Phase 76 Plan 06 Task 1 — registry-driven stage-tab derivation (D-05.5 NEW).
//
// Pure function: SwarmRow → array of `{stage, label, slug, present}`. The
// stage-tab-strip component renders only `present:true` tabs. Stage 0 and
// Stage 4 are universal (always present); Stages 1/2/3 are present iff the
// swarm has the corresponding registry binding.
//
// Cross-swarm reuse contract: zero literal swarm-name branches here. Phase
// 78 (sales-email) lights up the same shell by inserting a registry row.
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/README.md):
//   - Stage 0 = safety (always)
//   - Stage 1 = noise filter (swarms.stage1_regex_module)
//   - Stage 2 = entity resolution (swarms.stage2_entity_resolver)
//   - Stage 3 = ranked-intent classifier (swarms.stage3_coordinator_agent_key)
//   - Stage 4 = handler (always — handler-error queue is universal)

import type { SwarmRow } from "@/lib/swarms/types";

export interface StageTab {
  stage: 0 | 1 | 2 | 3 | 4;
  label: string;
  slug: string;
  present: boolean;
}

const FIXED: ReadonlyArray<{ stage: 0 | 1 | 2 | 3 | 4; label: string; slug: string }> = [
  { stage: 0, label: "Stage 0 · Safety", slug: "stage-0" },
  { stage: 1, label: "Stage 1 · Noise", slug: "stage-1" },
  { stage: 2, label: "Stage 2 · Customer", slug: "stage-2" },
  { stage: 3, label: "Stage 3 · Intent", slug: "stage-3" },
  { stage: 4, label: "Stage 4 · Handler", slug: "stage-4" },
];

export function deriveStageTabs(swarm: SwarmRow): StageTab[] {
  return FIXED.map((t) => {
    let present = false;
    if (t.stage === 0) present = true;
    if (t.stage === 1) present = Boolean(swarm.stage1_regex_module);
    if (t.stage === 2) present = Boolean(swarm.stage2_entity_resolver);
    if (t.stage === 3) present = Boolean(swarm.stage3_coordinator_agent_key);
    if (t.stage === 4) present = true;
    return { ...t, present };
  });
}
