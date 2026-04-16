import { describe, expect, it } from "vitest";
import { deriveBars, formatDuration, formatTime } from "../bars";
import type { AgentEvent, SwarmAgent } from "@/lib/v7/types";

const SWARM = "f8df0bce-ed24-4b77-b921-7fce44cabbbb";
const NOW = 1_776_000_000_000; // deterministic
const WINDOW_START = NOW - 30 * 60_000;

function ev(partial: Partial<AgentEvent>): AgentEvent {
  return {
    id: partial.id ?? "id-" + Math.random().toString(36).slice(2),
    swarm_id: SWARM,
    agent_name: "agent-a",
    event_type: "thinking",
    span_id: null,
    parent_span_id: null,
    content: null,
    started_at: null,
    ended_at: null,
    created_at: new Date(NOW - 10_000).toISOString(),
    ...partial,
  };
}

function agent(name: string): SwarmAgent {
  return {
    id: name,
    swarm_id: SWARM,
    agent_name: name,
    role: null,
    status: "idle",
    parent_agent: null,
    metrics: null,
    skills: null,
    orqai_deployment_id: null,
    created_at: new Date(NOW - 86_400_000).toISOString(),
    updated_at: new Date(NOW - 86_400_000).toISOString(),
  };
}

describe("deriveBars", () => {
  it("returns empty bars + empty lanes when no agents", () => {
    const out = deriveBars([], [], WINDOW_START, NOW);
    expect(out.bars).toEqual([]);
    expect(out.lanes).toEqual([]);
  });

  it("returns lanes from agents even when events are empty", () => {
    const out = deriveBars(
      [],
      [agent("zebra"), agent("alpha")],
      WINDOW_START,
      NOW,
    );
    expect(out.bars).toEqual([]);
    expect(out.lanes.map((l) => l.agent)).toEqual(["alpha", "zebra"]);
  });

  it("places a single span correctly inside the window", () => {
    const start = NOW - 5 * 60_000;
    const end = NOW - 4 * 60_000;
    const events: AgentEvent[] = [
      ev({
        agent_name: "alpha",
        event_type: "done",
        span_id: "span-1",
        started_at: new Date(start).toISOString(),
        ended_at: new Date(end).toISOString(),
        content: { span_name: "Compose" },
      }),
    ];
    const out = deriveBars(events, [agent("alpha")], WINDOW_START, NOW);
    expect(out.bars).toHaveLength(1);
    const bar = out.bars[0];
    expect(bar.agent).toBe("alpha");
    expect(bar.laneIndex).toBe(0);
    expect(bar.type).toBe("done");
    expect(bar.label).toBe("Compose");
    expect(bar.start).toBe(start);
    expect(bar.end).toBe(end);
    // 5 min into a 30-min window from the right edge = 25/30 = ~83.3% from window start
    expect(bar.leftPct).toBeCloseTo(((start - WINDOW_START) / (NOW - WINDOW_START)) * 100, 5);
    expect(bar.widthPct).toBeCloseTo(((end - start) / (NOW - WINDOW_START)) * 100, 5);
  });

  it("filters out spans starting after the window", () => {
    const events: AgentEvent[] = [
      ev({
        agent_name: "alpha",
        span_id: "future",
        started_at: new Date(NOW + 60_000).toISOString(),
        ended_at: new Date(NOW + 120_000).toISOString(),
      }),
    ];
    const out = deriveBars(events, [agent("alpha")], WINDOW_START, NOW);
    expect(out.bars).toEqual([]);
  });

  it("filters out spans ending before the window", () => {
    const events: AgentEvent[] = [
      ev({
        agent_name: "alpha",
        span_id: "ancient",
        started_at: new Date(WINDOW_START - 60_000 * 10).toISOString(),
        ended_at: new Date(WINDOW_START - 60_000 * 5).toISOString(),
      }),
    ];
    const out = deriveBars(events, [agent("alpha")], WINDOW_START, NOW);
    expect(out.bars).toEqual([]);
  });

  it("clamps in-flight spans (no ended_at) to windowEnd", () => {
    const start = NOW - 60_000;
    const events: AgentEvent[] = [
      ev({
        agent_name: "alpha",
        span_id: "in-flight",
        started_at: new Date(start).toISOString(),
        // ended_at intentionally null
      }),
    ];
    const out = deriveBars(events, [agent("alpha")], WINDOW_START, NOW);
    expect(out.bars).toHaveLength(1);
    expect(out.bars[0].end).toBe(NOW);
  });

  it("merges multi-event spans and lets terminal type win the color", () => {
    const start = NOW - 3 * 60_000;
    const end = NOW - 2 * 60_000;
    const events: AgentEvent[] = [
      ev({
        agent_name: "alpha",
        event_type: "thinking",
        span_id: "multi",
        started_at: new Date(start).toISOString(),
        content: { span_name: "Plan" },
      }),
      ev({
        agent_name: "alpha",
        event_type: "tool_call",
        span_id: "multi",
        started_at: new Date(start + 10_000).toISOString(),
        content: { span_name: "Plan" },
      }),
      ev({
        agent_name: "alpha",
        event_type: "done",
        span_id: "multi",
        ended_at: new Date(end).toISOString(),
        content: { span_name: "Plan" },
      }),
    ];
    const out = deriveBars(events, [agent("alpha")], WINDOW_START, NOW);
    expect(out.bars).toHaveLength(1);
    // done wins over thinking and tool_call
    expect(out.bars[0].type).toBe("done");
    expect(out.bars[0].start).toBe(start);
    expect(out.bars[0].end).toBe(end);
  });

  it("colors spans with error events as error", () => {
    const start = NOW - 60_000;
    const end = NOW - 30_000;
    const events: AgentEvent[] = [
      ev({
        agent_name: "alpha",
        event_type: "thinking",
        span_id: "broken",
        started_at: new Date(start).toISOString(),
      }),
      ev({
        agent_name: "alpha",
        event_type: "error",
        span_id: "broken",
        ended_at: new Date(end).toISOString(),
      }),
    ];
    const out = deriveBars(events, [agent("alpha")], WINDOW_START, NOW);
    expect(out.bars[0].type).toBe("error");
  });

  it("caps lanes at 8 alphabetically", () => {
    const tenAgents = Array.from({ length: 10 }, (_, i) =>
      agent(`agent-${String.fromCharCode(106 - i)}`), // j..a, then mixed; sort fixes
    );
    const out = deriveBars([], tenAgents, WINDOW_START, NOW);
    expect(out.lanes).toHaveLength(8);
    // Lanes should be the alphabetically lowest 8
    const sortedNames = tenAgents
      .map((a) => a.agent_name)
      .sort()
      .slice(0, 8);
    expect(out.lanes.map((l) => l.agent)).toEqual(sortedNames);
  });

  it("ignores events whose agent_name is not in the lane set", () => {
    const start = NOW - 60_000;
    const end = NOW - 30_000;
    const events: AgentEvent[] = [
      ev({
        agent_name: "alpha",
        event_type: "done",
        span_id: "ok",
        started_at: new Date(start).toISOString(),
        ended_at: new Date(end).toISOString(),
      }),
      ev({
        agent_name: "stranger",
        event_type: "done",
        span_id: "ignored",
        started_at: new Date(start).toISOString(),
        ended_at: new Date(end).toISOString(),
      }),
    ];
    const out = deriveBars(events, [agent("alpha")], WINDOW_START, NOW);
    expect(out.bars).toHaveLength(1);
    expect(out.bars[0].agent).toBe("alpha");
  });
});

describe("formatDuration", () => {
  it("renders sub-second values in ms", () => {
    expect(formatDuration(500)).toBe("500ms");
  });
  it("renders sub-minute values in seconds", () => {
    expect(formatDuration(2500)).toBe("2.5s");
  });
  it("renders minute-scale values in minutes", () => {
    expect(formatDuration(120_000)).toBe("2.0m");
  });
});

describe("formatTime", () => {
  it("renders HH:MM:SS in a stable locale", () => {
    const out = formatTime(NOW);
    expect(out).toMatch(/\d{2}:\d{2}:\d{2}/);
  });
});
