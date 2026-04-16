/**
 * Shared Orq.ai MCP HTTP JSON-RPC helper.
 *
 * Orq.ai exposes MCP tools (list_traces, list_spans, get_span, query_analytics,
 * get_analytics_overview, etc.) via a single HTTP endpoint that accepts the
 * JSON-RPC 2.0 tools/call method. This wraps that call pattern with:
 *
 *   - Bearer auth via ORQ_API_KEY
 *   - 45s client timeout (Orq.ai internal retry is 31s per CLAUDE.md)
 *   - JSON parse of the wrapped `result.content[0].text` payload
 *
 * Used by Inngest cron functions that need to poll Orq.ai for trace/analytics
 * data. Pure HTTP -- no side effects beyond the outbound request.
 */

const MCP_ENDPOINT = "https://my.orq.ai/v2/mcp";

export interface CallOrqaiMcpOptions {
  /** Client-side AbortSignal timeout in milliseconds. Defaults to 45_000. */
  timeoutMs?: number;
}

export async function callOrqaiMcp<T = unknown>(
  toolName: string,
  args: Record<string, unknown>,
  options: CallOrqaiMcpOptions = {}
): Promise<T> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) throw new Error("ORQ_API_KEY not configured");

  const timeoutMs = options.timeoutMs ?? 45_000;

  const res = await fetch(MCP_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "tools/call",
      params: { name: toolName, arguments: args },
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!res.ok) {
    throw new Error(`Orq.ai MCP error: ${res.status} ${res.statusText}`);
  }

  const rpc = (await res.json()) as {
    result?: { content?: Array<{ text?: string }> };
    error?: { message?: string };
  };

  if (rpc.error) {
    throw new Error(`Orq.ai MCP RPC error: ${rpc.error.message}`);
  }

  const text = rpc.result?.content?.[0]?.text;
  if (!text) {
    throw new Error("Orq.ai MCP returned empty content");
  }

  return JSON.parse(text) as T;
}
