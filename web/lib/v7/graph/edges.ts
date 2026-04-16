/**
 * Pure edge derivation for the V7 delegation graph (Phase 53).
 *
 * An edge exists from agent A to agent B iff there is a `parent_span_id`
 * link in `agent_events` whose parent span belongs to A and the child
 * span belongs to B. Recent edges (lastTs within 60s of `now`) drive the
 * particle animation; older edges render as faded static strokes.
 */

import type { AgentEvent } from "@/lib/v7/types";

export interface Edge {
  key: string;
  from: string;
  to: string;
  count: number;
  lastTs: number;
  index: number;
}

const RECENT_WINDOW_MS = 60_000;

const PARTICLE_COLORS = [
  "var(--v7-teal)",
  "var(--v7-blue)",
  "var(--v7-amber)",
] as const;

export function deriveEdges(events: AgentEvent[]): Edge[] {
  // Build a map from span_id -> agent_name. If multiple events share a
  // span_id (start + done pair) the agent is by definition the same, so
  // last-write-wins is harmless.
  const spanToAgent = new Map<string, string>();
  for (const e of events) {
    if (e.span_id) spanToAgent.set(e.span_id, e.agent_name);
  }

  const edges = new Map<string, Edge>();
  for (const e of events) {
    if (!e.parent_span_id) continue;
    const fromAgent = spanToAgent.get(e.parent_span_id);
    if (!fromAgent) continue;
    if (fromAgent === e.agent_name) continue; // skip intra-agent self-loops

    const key = `${fromAgent}->${e.agent_name}`;
    const ts = Date.parse(e.created_at);
    const safeTs = Number.isFinite(ts) ? ts : 0;

    const cur = edges.get(key);
    if (cur) {
      cur.count += 1;
      if (safeTs > cur.lastTs) cur.lastTs = safeTs;
    } else {
      edges.set(key, {
        key,
        from: fromAgent,
        to: e.agent_name,
        count: 1,
        lastTs: safeTs,
        index: edges.size,
      });
    }
  }

  return [...edges.values()];
}

export function isRecentEdge(edge: Edge, now: number): boolean {
  return now - edge.lastTs <= RECENT_WINDOW_MS;
}

export function particleColor(edgeIndex: number): string {
  if (edgeIndex <= 0) return PARTICLE_COLORS[0];
  if (edgeIndex === 1) return PARTICLE_COLORS[1];
  return PARTICLE_COLORS[2];
}
