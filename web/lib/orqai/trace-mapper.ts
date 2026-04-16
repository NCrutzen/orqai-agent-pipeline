/**
 * Pure trace-to-agent_events mapper.
 *
 * Input: Orq.ai span items (from list_spans) + parent trace metadata.
 * Output: agent_events rows ready to INSERT via the Supabase admin client.
 *
 * Mapping semantics:
 *   - span.tool_call (or span name including "tool") -> tool_call + tool_result pair
 *   - span.deployment / span.chat_completion / span.agent / anything else -> thinking + done pair
 *
 * The mapper is pure (no I/O, no side effects) so it can be unit tested
 * against fixtures without touching Supabase or Orq.ai.
 */

import type { AgentEventType } from "@/lib/v7/types";
import type { SpanItem, TraceItem } from "./trace-mapper.schema";

export interface AgentEventInsert {
  swarm_id: string;
  agent_name: string;
  event_type: AgentEventType;
  span_id: string | null;
  parent_span_id: string | null;
  content: Record<string, unknown>;
  started_at: string | null;
  ended_at: string | null;
}

function resolveAgentName(span: SpanItem, trace: TraceItem): string {
  return (
    span.attributes?.gen_ai?.operation?.name ??
    trace.attributes?.gen_ai?.operation?.name ??
    span.name ??
    "unknown-agent"
  );
}

function isToolSpan(span: SpanItem): boolean {
  const type = span.type ?? "";
  if (type.includes("tool")) return true;
  const name = span.name ?? "";
  return name.toLowerCase().includes("tool");
}

/**
 * Map a single span to the agent_events rows it represents.
 *
 * Returns [tool_call, tool_result] for tool spans, [thinking, done] for any
 * other span shape. Returns an empty array only if the span has no usable
 * identifier at all (extremely rare / malformed input).
 */
export function spanToAgentEvents(
  span: SpanItem,
  swarmId: string,
  context: { trace: TraceItem }
): AgentEventInsert[] {
  const spanId = span.span_id ?? span._id;
  if (!spanId) return [];

  const parentSpanId = span.parent_id ?? null;
  const agentName = resolveAgentName(span, context.trace);
  const startedAt = span.start_time ?? null;
  const endedAt = span.end_time ?? null;

  const contentBase: Record<string, unknown> = {
    trace_id: span.trace_id,
    span_id: spanId,
    span_type: span.type ?? null,
    span_name: span.name ?? null,
  };

  if (isToolSpan(span)) {
    const toolName = span.name ?? null;
    return [
      {
        swarm_id: swarmId,
        agent_name: agentName,
        event_type: "tool_call",
        span_id: spanId,
        parent_span_id: parentSpanId,
        content: { ...contentBase, tool: toolName },
        started_at: startedAt,
        ended_at: null,
      },
      {
        swarm_id: swarmId,
        agent_name: agentName,
        event_type: "tool_result",
        span_id: spanId,
        parent_span_id: parentSpanId,
        content: { ...contentBase, tool: toolName },
        started_at: null,
        ended_at: endedAt,
      },
    ];
  }

  return [
    {
      swarm_id: swarmId,
      agent_name: agentName,
      event_type: "thinking",
      span_id: spanId,
      parent_span_id: parentSpanId,
      content: contentBase,
      started_at: startedAt,
      ended_at: null,
    },
    {
      swarm_id: swarmId,
      agent_name: agentName,
      event_type: "done",
      span_id: spanId,
      parent_span_id: parentSpanId,
      content: contentBase,
      started_at: null,
      ended_at: endedAt,
    },
  ];
}

/**
 * Map every span in a trace to its agent_events rows. Flat-mapped so the
 * caller gets a single array ready to bulk-insert.
 */
export function spansToAgentEvents(
  spans: SpanItem[],
  swarmId: string,
  trace: TraceItem
): AgentEventInsert[] {
  return spans.flatMap((span) => spanToAgentEvents(span, swarmId, { trace }));
}

/**
 * Return the latest end_time across a batch of traces, or null if empty.
 * Used to advance the per-swarm sync watermark.
 */
export function maxEndTime(traces: TraceItem[]): string | null {
  if (traces.length === 0) return null;
  return traces.reduce(
    (acc, t) => (t.end_time > acc ? t.end_time : acc),
    traces[0]!.end_time
  );
}
