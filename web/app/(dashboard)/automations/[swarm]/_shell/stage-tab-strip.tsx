// Phase 76 Plan 06 Task 2 — Stage tab strip (server component, registry-driven).
//
// Renders only the tabs marked present:true by deriveStageTabs. Active tab:
// 2px brand-primary bottom border. Optional badge counts via `counts` prop.
// Right-edge link to /swarm/${id} (operations dashboard). UI-SPEC §Tabs.
//
// Cross-swarm reuse: zero literal swarm-name strings. The swarm.swarm_type
// is consumed only as data, so adding a new swarm = INSERT swarms row.

import Link from "next/link";
import type { SwarmRow } from "@/lib/swarms/types";
import { deriveStageTabs, type StageTab } from "./derive-stage-tabs";

interface Props {
  swarm: SwarmRow;
  currentStage: 0 | 1 | 2 | 3 | 4;
  counts?: Partial<Record<0 | 1 | 2 | 3 | 4, number>>;
}

export function StageTabStrip({ swarm, currentStage, counts }: Props) {
  const tabs: StageTab[] = deriveStageTabs(swarm).filter((t) => t.present);
  return (
    <nav
      className="stage-tab-strip"
      style={{
        display: "flex",
        gap: "var(--space-2)",
        padding: "var(--space-3) var(--space-5)",
        background: "var(--v7-bg-2)",
        borderBottom: "1px solid var(--v7-border)",
        alignItems: "center",
      }}
    >
      {tabs.map((t) => {
        const active = t.stage === currentStage;
        const count = counts?.[t.stage];
        return (
          <Link
            key={t.slug}
            href={`/automations/${swarm.swarm_type}/${t.slug}`}
            aria-current={active ? "page" : undefined}
            style={{
              fontSize: "14px",
              fontWeight: active ? 500 : 400,
              padding: "var(--space-2) var(--space-3)",
              color: active ? "var(--v7-text)" : "var(--v7-text-muted)",
              borderBottom: active
                ? "2px solid var(--v7-brand-primary)"
                : "2px solid transparent",
              textDecoration: "none",
              display: "inline-flex",
              alignItems: "center",
              gap: "var(--space-1)",
            }}
          >
            {t.label}
            {typeof count === "number" && count > 0 ? (
              <span
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: "11px",
                  marginLeft: "var(--space-1)",
                  padding: "0 var(--space-1)",
                  background: "var(--v7-brand-primary-soft)",
                  color: "var(--v7-brand-primary)",
                  borderRadius: "4px",
                }}
              >
                {count}
              </span>
            ) : null}
          </Link>
        );
      })}
      <Link
        href={`/swarm/${swarm.swarm_type}`}
        style={{
          marginLeft: "auto",
          fontSize: "13px",
          color: "var(--v7-text-muted)",
          textDecoration: "none",
        }}
      >
        ↗ Swarm operations dashboard
      </Link>
    </nav>
  );
}
