import { describe, expect, it } from "vitest";
import {
  deriveEdges,
  isRecentEdge,
  particleColor,
} from "@/lib/v7/graph/edges";
import type { AgentEvent, AgentEventType } from "@/lib/v7/types";

let idCounter = 0;
function makeEvent(
  agent_name: string,
  span_id: string | null,
  parent_span_id: string | null,
  event_type: AgentEventType = "thinking",
  created_at: string = new Date().toISOString(),
): AgentEvent {
  idCounter += 1;
  return {
    id: `evt-${idCounter}`,
    swarm_id: "swarm-1",
    agent_name,
    event_type,
    span_id,
    parent_span_id,
    content: {},
    started_at: null,
    ended_at: null,
    created_at,
  };
}

describe("deriveEdges", () => {
  it("returns [] for empty events", () => {
    expect(deriveEdges([])).toEqual([]);
  });

  it("derives a single edge from a parent_span_id link across agents", () => {
    const events = [
      makeEvent("Alpha", "span-A", null),
      makeEvent("Bravo", "span-B", "span-A"),
    ];
    const edges = deriveEdges(events);
    expect(edges).toHaveLength(1);
    expect(edges[0].from).toBe("Alpha");
    expect(edges[0].to).toBe("Bravo");
    expect(edges[0].key).toBe("Alpha->Bravo");
    expect(edges[0].count).toBe(1);
    expect(edges[0].index).toBe(0);
  });

  it("aggregates edge count across multiple events", () => {
    const events = [
      makeEvent("Alpha", "span-A", null),
      makeEvent("Bravo", "span-B", "span-A"),
      makeEvent("Bravo", "span-B", "span-A", "done"),
      makeEvent("Bravo", "span-C", "span-A"),
    ];
    const edges = deriveEdges(events);
    expect(edges).toHaveLength(1);
    expect(edges[0].count).toBe(3);
  });

  it("drops self-loops", () => {
    const events = [
      makeEvent("Alpha", "span-A", null),
      makeEvent("Alpha", "span-B", "span-A"),
    ];
    expect(deriveEdges(events)).toEqual([]);
  });

  it("drops events whose parent_span_id has no known agent", () => {
    const events = [makeEvent("Bravo", "span-B", "span-X")];
    expect(deriveEdges(events)).toEqual([]);
  });

  it("ignores events without span_id when building the agent map", () => {
    const events = [
      makeEvent("Alpha", null, null), // anonymous span -- not indexable
      makeEvent("Bravo", "span-B", "span-A"),
    ];
    expect(deriveEdges(events)).toEqual([]);
  });

  it("tracks the latest timestamp per edge", () => {
    const earlier = "2026-04-16T10:00:00.000Z";
    const later = "2026-04-16T11:00:00.000Z";
    const events = [
      makeEvent("Alpha", "span-A", null, "thinking", earlier),
      makeEvent("Bravo", "span-B", "span-A", "thinking", earlier),
      makeEvent("Bravo", "span-C", "span-A", "thinking", later),
    ];
    const edges = deriveEdges(events);
    expect(edges).toHaveLength(1);
    expect(edges[0].lastTs).toBe(Date.parse(later));
  });

  it("derives multiple edges when multiple targets exist", () => {
    const events = [
      makeEvent("Alpha", "span-A", null),
      makeEvent("Bravo", "span-B", "span-A"),
      makeEvent("Charlie", "span-C", "span-A"),
    ];
    const edges = deriveEdges(events);
    expect(edges).toHaveLength(2);
    const keys = edges.map((e) => e.key).sort();
    expect(keys).toEqual(["Alpha->Bravo", "Alpha->Charlie"]);
    expect(edges[0].index).toBe(0);
    expect(edges[1].index).toBe(1);
  });

  it("derives nested delegations (2-hop)", () => {
    const events = [
      makeEvent("Alpha", "span-A", null),
      makeEvent("Bravo", "span-B", "span-A"),
      makeEvent("Charlie", "span-C", "span-B"),
    ];
    const edges = deriveEdges(events);
    expect(edges.map((e) => e.key).sort()).toEqual([
      "Alpha->Bravo",
      "Bravo->Charlie",
    ]);
  });
});

describe("isRecentEdge", () => {
  it("treats edges within 60s as recent", () => {
    const now = Date.now();
    expect(isRecentEdge({ key: "k", from: "A", to: "B", count: 1, lastTs: now - 30_000, index: 0 }, now)).toBe(true);
    expect(isRecentEdge({ key: "k", from: "A", to: "B", count: 1, lastTs: now - 60_000, index: 0 }, now)).toBe(true);
    expect(isRecentEdge({ key: "k", from: "A", to: "B", count: 1, lastTs: now - 60_001, index: 0 }, now)).toBe(false);
  });
});

describe("particleColor", () => {
  it("cycles teal -> blue -> amber by edge index", () => {
    expect(particleColor(0)).toBe("var(--v7-teal)");
    expect(particleColor(1)).toBe("var(--v7-blue)");
    expect(particleColor(2)).toBe("var(--v7-amber)");
    expect(particleColor(7)).toBe("var(--v7-amber)");
  });
});
