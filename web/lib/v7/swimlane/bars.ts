/**
 * Swimlane bar derivation. Pure function — no DOM, no React, no Date.now().
 *
 * Pairs `agent_events` rows by (agent_name, span_id), promotes terminal event
 * types (done/error) so the bar's color reflects the span outcome, clips to a
 * sliding window, and returns positional bars + lanes ready for absolute
 * positioning in a Gantt grid.
 *
 * See `.planning/phases/53-advanced-observability/53-RESEARCH.md` section 4.
 */

import type { AgentEvent, AgentEventType, SwarmAgent } from "@/lib/v7/types";

export interface Bar {
  key: string;
  agent: string;
  laneIndex: number;
  type: AgentEventType;
  label: string;
  shortLabel: string;
  start: number;
  end: number;
  leftPct: number;
  widthPct: number;
  duration: string;
  startTime: string;
  endTime: string;
}

export interface Lane {
  agent: string;
  index: number;
}

const TERMINAL_TYPES: AgentEventType[] = ["done", "error"];
const MAX_LANES = 8;
const MIN_BAR_WIDTH_PCT = 0.6;

export function deriveBars(
  events: AgentEvent[],
  agents: SwarmAgent[],
  windowStart: number,
  windowEnd: number,
): { bars: Bar[]; lanes: Lane[] } {
  // Lane assignment: alphabetical by agent_name, capped at MAX_LANES.
  const lanes: Lane[] = [...agents]
    .sort((a, b) => a.agent_name.localeCompare(b.agent_name))
    .slice(0, MAX_LANES)
    .map((a, i) => ({ agent: a.agent_name, index: i }));
  const laneIndexByAgent = new Map(lanes.map((l) => [l.agent, l.index]));

  if (lanes.length === 0) return { bars: [], lanes };

  // Span pairing: collect by (agent, span_id)
  interface SpanAcc {
    agent: string;
    type: AgentEventType;
    label: string;
    start: number | null;
    end: number | null;
  }

  const acc = new Map<string, SpanAcc>();
  for (const e of events) {
    if (!e.span_id) continue;
    if (!laneIndexByAgent.has(e.agent_name)) continue;
    const k = `${e.agent_name}|${e.span_id}`;
    let s = acc.get(k);
    if (!s) {
      const content = (e.content as Record<string, unknown> | null) ?? null;
      const label =
        typeof content?.span_name === "string"
          ? content.span_name
          : typeof content?.tool === "string"
            ? `tool: ${content.tool}`
            : e.event_type;
      s = {
        agent: e.agent_name,
        type: e.event_type,
        label,
        start: null,
        end: null,
      };
      acc.set(k, s);
    }
    const startedMs = e.started_at ? Date.parse(e.started_at) : null;
    const endedMs = e.ended_at ? Date.parse(e.ended_at) : null;
    if (startedMs !== null && (s.start === null || startedMs < s.start)) {
      s.start = startedMs;
    }
    if (endedMs !== null && (s.end === null || endedMs > s.end)) {
      s.end = endedMs;
    }
    // Promote terminal type: done/error wins over thinking/tool_call as the
    // bar's color, since the user wants to see at-a-glance outcomes.
    if (TERMINAL_TYPES.includes(e.event_type)) s.type = e.event_type;
  }

  // Build bars
  const windowDuration = windowEnd - windowStart;
  const bars: Bar[] = [];
  for (const [key, s] of acc) {
    const start = s.start ?? s.end;
    if (start === null) continue;
    const end = s.end ?? windowEnd; // in-flight: extend to window edge
    if (end < windowStart || start > windowEnd) continue; // outside window
    const clippedStart = Math.max(start, windowStart);
    const clippedEnd = Math.min(end, windowEnd);
    bars.push({
      key,
      agent: s.agent,
      laneIndex: laneIndexByAgent.get(s.agent)!,
      type: s.type,
      label: s.label,
      shortLabel:
        s.label.length > 18 ? s.label.slice(0, 17) + "\u2026" : s.label,
      start: clippedStart,
      end: clippedEnd,
      leftPct: ((clippedStart - windowStart) / windowDuration) * 100,
      widthPct: Math.max(
        MIN_BAR_WIDTH_PCT,
        ((clippedEnd - clippedStart) / windowDuration) * 100,
      ),
      duration: formatDuration(end - start),
      startTime: formatTime(start),
      endTime: formatTime(end),
    });
  }
  return { bars, lanes };
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60_000).toFixed(1)}m`;
}

export function formatTime(ms: number): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(new Date(ms));
}
