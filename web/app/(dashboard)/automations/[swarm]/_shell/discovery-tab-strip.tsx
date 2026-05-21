// Phase 86 Plan 03 — peer discovery tab strip (drift #3 lock).
//
// Rendered BELOW the existing StageTabStrip on discovery surfaces. Does NOT
// widen derive-stage-tabs.ts — that file's StageTab.stage literal-union
// (0|1|2|3|4) is RFC-architecture-locked per docs/agentic-pipeline/README.md.
//
// Extensibility: the DiscoveryTab.key union starts at one literal today
// ("intent-proposals"). V9.0 Learning Inbox and V11.0 Handler queue extend
// this union with additional keys — same shell component, additional rows in
// FIXED, no churn at the call sites.
//
// Read-only surface contract (Phase 86 D-04): tabs registered here never
// produce writes to swarm_intents or swarm_noise_categories — they only
// surface read models (intent_proposal_clusters today).

import Link from "next/link";
import type { SwarmRow } from "@/lib/swarms/types";

export interface DiscoveryTab {
  key: "intent-proposals"; // widen as V9.0 / V11.0 tabs land
  label: string;
  slug: string;
  present: boolean;
}

const FIXED: ReadonlyArray<{
  key: DiscoveryTab["key"];
  label: string;
  slug: string;
}> = [
  {
    key: "intent-proposals",
    label: "Intent proposals",
    slug: "intent-proposals",
  },
];

export function deriveDiscoveryTabs(swarm: SwarmRow): DiscoveryTab[] {
  return FIXED.map((t) => {
    let present = false;
    if (t.key === "intent-proposals") {
      // Proposals only emit when Stage 3 runs (the coordinator writes the
      // intent_proposal field into pipeline_events.decision_details).
      present = Boolean(swarm.stage3_coordinator_agent_key);
    }
    return { ...t, present };
  });
}

interface Props {
  swarm: SwarmRow;
  current?: DiscoveryTab["key"];
}

export function DiscoveryTabStrip({ swarm, current }: Props) {
  const tabs = deriveDiscoveryTabs(swarm).filter((t) => t.present);
  if (tabs.length === 0) return null;
  return (
    <nav
      className="discovery-tab-strip"
      aria-label="Discovery surfaces"
      style={{
        display: "flex",
        gap: "var(--space-2)",
        padding: "var(--space-2) var(--space-5)",
        background: "var(--v7-bg-2)",
        borderBottom: "1px solid var(--v7-border)",
        alignItems: "center",
      }}
    >
      {tabs.map((t) => {
        const active = t.key === current;
        return (
          <Link
            key={t.key}
            href={`/automations/${swarm.swarm_type}/${t.slug}`}
            aria-current={active ? "page" : undefined}
            style={{
              fontSize: "13px",
              fontWeight: active ? 500 : 400,
              padding: "var(--space-2) var(--space-3)",
              color: active ? "var(--v7-text)" : "var(--v7-text-muted)",
              borderBottom: active
                ? "2px solid var(--v7-brand-primary)"
                : "2px solid transparent",
              textDecoration: "none",
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}
