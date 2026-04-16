import { describe, it, expect } from "vitest";
import {
  maxEndTime,
  spanToAgentEvents,
  spansToAgentEvents,
} from "../trace-mapper";
import type { SpanItem, TraceItem } from "../trace-mapper.schema";

const SWARM_ID = "00000000-0000-0000-0000-000000000001";

// Fixture shaped from a real list_traces response pulled via MCP 2026-04-16.
const TRACE_FIXTURE: TraceItem = {
  _id: "01KP9P322XYT2EK2GRXR0JMD6J",
  trace_id: "01KP9P322X1KJ66V4BEABYCHJ8",
  start_time: "2026-04-15T23:02:15.905Z",
  end_time: "2026-04-15T23:02:17.369Z",
  name: "EASY_email",
  attributes: {
    orq: { project_id: "58205e70-6fc2-4f28-9b7f-aca40cb0e4be" },
    gen_ai: { operation: { name: "EASY_email" } },
    leading_span: {
      span_id: "01KP9P322X4FDP2SK6X47AD16C",
      span_type: "span.deployment",
    },
  },
};

describe("spanToAgentEvents", () => {
  it("maps a deployment span to a thinking+done pair", () => {
    const span: SpanItem = {
      _id: "01KP9P322X4FDP2SK6X47AD16C",
      trace_id: TRACE_FIXTURE.trace_id,
      span_id: "01KP9P322X4FDP2SK6X47AD16C",
      parent_id: null,
      start_time: TRACE_FIXTURE.start_time,
      end_time: TRACE_FIXTURE.end_time,
      name: "EASY_email",
      type: "span.deployment",
    };

    const events = spanToAgentEvents(span, SWARM_ID, { trace: TRACE_FIXTURE });

    expect(events).toHaveLength(2);
    expect(events[0]).toMatchObject({
      swarm_id: SWARM_ID,
      agent_name: "EASY_email",
      event_type: "thinking",
      span_id: "01KP9P322X4FDP2SK6X47AD16C",
      started_at: TRACE_FIXTURE.start_time,
      ended_at: null,
    });
    expect(events[1]).toMatchObject({
      swarm_id: SWARM_ID,
      agent_name: "EASY_email",
      event_type: "done",
      span_id: "01KP9P322X4FDP2SK6X47AD16C",
      started_at: null,
      ended_at: TRACE_FIXTURE.end_time,
    });
  });

  it("maps a tool span to a tool_call+tool_result pair with parent linkage", () => {
    const span: SpanItem = {
      _id: "span-tool-1",
      trace_id: TRACE_FIXTURE.trace_id,
      span_id: "span-tool-1",
      parent_id: "01KP9P322X4FDP2SK6X47AD16C",
      start_time: "2026-04-15T23:02:16.000Z",
      end_time: "2026-04-15T23:02:16.500Z",
      name: "lookup_tool",
      type: "span.tool_call",
    };

    const events = spanToAgentEvents(span, SWARM_ID, { trace: TRACE_FIXTURE });

    expect(events.map((e) => e.event_type)).toEqual([
      "tool_call",
      "tool_result",
    ]);
    expect(events[0].content).toMatchObject({ tool: "lookup_tool" });
    expect(events[0].parent_span_id).toBe("01KP9P322X4FDP2SK6X47AD16C");
    expect(events[1].parent_span_id).toBe("01KP9P322X4FDP2SK6X47AD16C");
  });

  it("detects tool spans by name substring when type is generic", () => {
    const span: SpanItem = {
      _id: "span-tool-2",
      trace_id: TRACE_FIXTURE.trace_id,
      span_id: "span-tool-2",
      start_time: TRACE_FIXTURE.start_time,
      end_time: TRACE_FIXTURE.end_time,
      name: "call-browserless-tool",
      type: "span.function",
    };
    const events = spanToAgentEvents(span, SWARM_ID, { trace: TRACE_FIXTURE });
    expect(events.map((e) => e.event_type)).toEqual([
      "tool_call",
      "tool_result",
    ]);
  });

  it("falls back to the trace operation name when the span lacks operation metadata", () => {
    const span: SpanItem = {
      _id: "span-bare",
      trace_id: TRACE_FIXTURE.trace_id,
      span_id: "span-bare",
      start_time: TRACE_FIXTURE.start_time,
      end_time: TRACE_FIXTURE.end_time,
      type: "span.chat_completion",
    };
    const events = spanToAgentEvents(span, SWARM_ID, { trace: TRACE_FIXTURE });
    expect(events[0].agent_name).toBe("EASY_email");
    expect(events[1].agent_name).toBe("EASY_email");
  });

  it("uses the span _id when span_id is absent", () => {
    const span: SpanItem = {
      _id: "fallback-id",
      trace_id: TRACE_FIXTURE.trace_id,
      start_time: TRACE_FIXTURE.start_time,
      end_time: TRACE_FIXTURE.end_time,
      type: "span.agent",
      name: "agent-x",
    };
    const events = spanToAgentEvents(span, SWARM_ID, { trace: TRACE_FIXTURE });
    expect(events).toHaveLength(2);
    expect(events[0].span_id).toBe("fallback-id");
  });
});

describe("spansToAgentEvents", () => {
  it("flat-maps every span into its event pair", () => {
    const spans: SpanItem[] = [
      {
        _id: "a",
        trace_id: "t",
        span_id: "a",
        start_time: "2026-04-15T23:02:15.000Z",
        end_time: "2026-04-15T23:02:16.000Z",
        type: "span.deployment",
      },
      {
        _id: "b",
        trace_id: "t",
        span_id: "b",
        start_time: "2026-04-15T23:02:15.000Z",
        end_time: "2026-04-15T23:02:16.000Z",
        type: "span.tool_call",
        name: "tool-x",
      },
    ];
    const events = spansToAgentEvents(spans, SWARM_ID, TRACE_FIXTURE);
    expect(events).toHaveLength(4);
  });
});

describe("maxEndTime", () => {
  it("returns null for an empty batch", () => {
    expect(maxEndTime([])).toBeNull();
  });

  it("returns the latest ISO end_time", () => {
    const traces: TraceItem[] = [
      { ...TRACE_FIXTURE, end_time: "2026-04-15T23:02:17.000Z" },
      { ...TRACE_FIXTURE, end_time: "2026-04-15T23:05:00.000Z" },
      { ...TRACE_FIXTURE, end_time: "2026-04-15T23:03:00.000Z" },
    ];
    expect(maxEndTime(traces)).toBe("2026-04-15T23:05:00.000Z");
  });
});
