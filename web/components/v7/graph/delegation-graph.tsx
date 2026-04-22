"use client";

/**
 * Live delegation graph (Phase 53, GRAPH-01..04).
 *
 * Reads `swarm_agents` and `agent_events` from the single Realtime
 * channel. Computes a deterministic orbital layout (orchestrator-left,
 * subagents fan right) memoized on the agent id set. Edges are derived
 * from `parent_span_id -> span_id` traversal; "recent" edges (<60s
 * since last event) carry GPU-driven SVG particles via animateMotion.
 *
 * Click on a node opens the agent detail drawer (Phase 51).
 */

import { useEffect, useMemo, useState } from "react";
import { GlassCard } from "@/components/ui/glass-card";
import { GraphNode } from "@/components/v7/graph/graph-node";
import { GraphEdge } from "@/components/v7/graph/graph-edge";
import { useDrawer } from "@/components/v7/drawer/drawer-context";
import { useRealtimeTable } from "@/lib/v7/use-realtime-table";
import { useReducedMotion } from "@/lib/v7/use-reduced-motion";
import { computeLayout } from "@/lib/v7/graph/layout";
import { deriveEdges, isRecentEdge } from "@/lib/v7/graph/edges";

interface DelegationGraphProps {
  swarmId: string;
}

const VIEWBOX_W = 1000;
const VIEWBOX_H = 420;
// Approx half-width of a graph node in viewbox coordinates (~144px node
// in a ~1000px wide canvas -> ~72 viewbox units assuming 1:1 scaling).
const NODE_HALF_WIDTH = 72;
const RECENT_BUCKET_MS = 5000;

function useNowBucket(): number {
  const [bucket, setBucket] = useState(() =>
    Math.floor(Date.now() / RECENT_BUCKET_MS),
  );
  useEffect(() => {
    const id = setInterval(() => {
      setBucket(Math.floor(Date.now() / RECENT_BUCKET_MS));
    }, RECENT_BUCKET_MS);
    return () => clearInterval(id);
  }, []);
  return bucket;
}

export function DelegationGraph(_props: DelegationGraphProps) {
  const { rows: agents } = useRealtimeTable("agents");
  const { rows: events } = useRealtimeTable("events");
  const reducedMotion = useReducedMotion();
  const { setOpenAgent } = useDrawer();
  const nowBucket = useNowBucket();

  const agentsKey = useMemo(
    () =>
      [...agents]
        .map((a) => a.id)
        .sort()
        .join("|"),
    [agents],
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps -- agentsKey is the intentional dep
  const layout = useMemo(() => computeLayout(agents), [agentsKey]);

  const allEdges = useMemo(() => deriveEdges(events), [events]);

  const edges = useMemo(() => {
    const now = nowBucket * RECENT_BUCKET_MS;
    return allEdges.map((e) => ({ edge: e, recent: isRecentEdge(e, now) }));
  }, [allEdges, nowBucket]);

  const recentCount = useMemo(
    () => edges.filter((x) => x.recent).length,
    [edges],
  );

  const coordsByName = useMemo(() => {
    const m = new Map<string, { x: number; y: number }>();
    for (const node of layout) {
      m.set(node.agent.agent_name, {
        x: (node.xPct / 100) * VIEWBOX_W,
        y: (node.yPct / 100) * VIEWBOX_H,
      });
    }
    return m;
  }, [layout]);

  return (
    <GlassCard className="p-[18px] flex flex-col gap-[14px] min-h-[320px]">
      <header className="flex justify-between items-start gap-3">
        <div className="flex flex-col gap-2">
          <span className="inline-flex items-center gap-2 text-[12px] leading-[1.3] tracking-[0.1em] uppercase text-[var(--v7-faint)]">
            <span
              aria-hidden
              className="inline-block w-2 h-2 rounded-full"
              style={{
                background: "var(--v7-teal)",
                animation: "v7-pulse-eyebrow 1.8s ease-in-out infinite",
              }}
            />
            Live delegation graph
          </span>
          <span className="font-[var(--font-cabinet)] text-[20px] leading-[1.2] font-bold text-[var(--v7-text)]">
            Who is talking to whom
          </span>
        </div>
        <span
          className="px-3 py-1 rounded-[var(--v7-radius-pill)] border text-[12px] leading-none whitespace-nowrap"
          style={
            recentCount > 0
              ? {
                  background: "var(--v7-teal-soft)",
                  color: "var(--v7-teal)",
                  borderColor: "var(--v7-teal)",
                }
              : {
                  background: "rgba(255,255,255,0.04)",
                  color: "var(--v7-muted)",
                  borderColor: "var(--v7-line)",
                }
          }
        >
          {recentCount > 0
            ? `${recentCount} active path${recentCount === 1 ? "" : "s"}`
            : "Idle"}
        </span>
      </header>

      {agents.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-2 min-h-[260px]">
          <h3 className="font-[var(--font-cabinet)] text-[20px] leading-[1.2] font-bold text-[var(--v7-text)]">
            No subagents registered
          </h3>
          <p className="text-[14px] leading-[1.5] text-[var(--v7-muted)] max-w-[40ch]">
            Deploy agents via Orq.ai to see them here.
          </p>
        </div>
      ) : (
        <div
          className="relative h-[380px] min-h-[320px] rounded-[var(--v7-radius)] border border-[var(--v7-line)] overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0.01))",
          }}
        >
          <svg
            viewBox={`0 0 ${VIEWBOX_W} ${VIEWBOX_H}`}
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full"
            role="img"
            aria-label="Live delegation graph"
          >
            <defs>
              <linearGradient id="v7-edge-grad" x1="0" x2="1">
                <stop offset="0%" stopColor="var(--v7-teal-soft)" />
                <stop offset="100%" stopColor="var(--v7-blue-soft)" />
              </linearGradient>
              <linearGradient id="v7-edge-grad-stale" x1="0" x2="1">
                <stop offset="0%" stopColor="rgba(255,255,255,0.06)" />
                <stop offset="100%" stopColor="rgba(255,255,255,0.04)" />
              </linearGradient>
            </defs>
            {edges.map(({ edge, recent }) => {
              const from = coordsByName.get(edge.from);
              const to = coordsByName.get(edge.to);
              if (!from || !to) return null;
              const fromAnchor = { x: from.x + NODE_HALF_WIDTH, y: from.y };
              const toAnchor = { x: to.x - NODE_HALF_WIDTH, y: to.y };
              return (
                <GraphEdge
                  key={edge.key}
                  edge={edge}
                  fromCoord={fromAnchor}
                  toCoord={toAnchor}
                  recent={recent}
                  reducedMotion={reducedMotion}
                />
              );
            })}
          </svg>
          {layout.map((node) => (
            <GraphNode key={node.id} node={node} onOpen={setOpenAgent} />
          ))}
          {edges.length === 0 && (
            <div className="absolute right-3 bottom-3 px-3 py-1 text-[12px] text-[var(--v7-faint)]">
              No delegation activity yet
            </div>
          )}
        </div>
      )}
    </GlassCard>
  );
}
