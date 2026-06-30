// ───────────────────────────────────────────────────────────────────────────
// THE single chokepoint for invoking Orq.ai agents/models over HTTP.
//
// Everything routes through the Responses API at /v3/router/responses — Orq's
// documented, QUEUE-FREE invocation path
// (https://docs.orq.ai/docs/ai-studio/ai-engineering/run-agents).
//
// Why this exists (2026-06-26 incident): the legacy agents endpoint
// `/v2/agents/{key}/responses` is queue-backed. When Orq's agent-invocation
// queue stalls, every call to it hangs to the client timeout — silently killing
// Stage-3 labelling for debtor + sales (45s abort → empty ranked_intents → no
// label). Throughout that incident the Router Responses API ran the SAME agents
// and models in ~2s. Routing all agent calls here means one Orq outage mode
// can't take down the pipeline, AND an Orq version bump (e.g. /v4) is a
// ONE-LINE change in this file instead of a grep-and-pray across the codebase.
//
// `model: "agent/<key>"` runs a Studio agent with its OWN system prompt +
// response_format applied server-side, so Studio stays the source of truth and
// callers keep their existing Zod gate around the returned text.
// ───────────────────────────────────────────────────────────────────────────

// ponytail: the ONLY place the Orq API version lives. Bump here for /v4.
const ORQ_RESPONSES_URL = "https://api.orq.ai/v3/router/responses";
const DEFAULT_TIMEOUT_MS = 45_000;

export type OrqUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type OrqResponsesResult = {
  /** Assistant text output — for a Stage-3 agent this is the JSON string. */
  text: string;
  usage?: OrqUsage;
  /** Full parsed Responses payload, for callers that need more than `text`. */
  raw: unknown;
};

export type InvokeOrqResponsesParams = {
  /**
   * `agent/<key>` runs a Studio agent (its prompt + response_format applied
   * server-side). A bare model id (e.g. `aws/eu.anthropic.claude-haiku-4-5-...`)
   * runs a raw model — then supply `instructions` / `response_format` yourself.
   */
  model: string;
  /** User input / prompt text. */
  input: string;
  /** Bare-model only; harmless-but-redundant for `agent/<key>`. */
  instructions?: string;
  response_format?: unknown;
  /** Fallback model ids, tried in order if the primary fails. */
  fallbacks?: string[];
  /** Client deadline. Mirrors the old 45s contract; throws TimeoutError on abort. */
  timeoutMs?: number;
  /** Defaults to process.env.ORQ_API_KEY. */
  apiKey?: string;
};

type ResponsesPayload = {
  status?: string;
  output?: Array<{
    content?: Array<{ type?: string; text?: string }>;
  }>;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  };
};

/**
 * Pull the first non-empty textual output part from a Responses API payload.
 * Shape: `output[].content[]` where the agent's JSON lands in an `output_text`
 * part. Exported so the parser is unit-testable without a live call.
 */
export function extractResponsesText(json: ResponsesPayload): string {
  for (const item of json.output ?? []) {
    for (const part of item.content ?? []) {
      if (typeof part.text === "string" && part.text.length > 0) return part.text;
    }
  }
  return "";
}

export async function invokeOrqResponses(
  params: InvokeOrqResponsesParams,
): Promise<OrqResponsesResult> {
  const apiKey = params.apiKey ?? process.env.ORQ_API_KEY;
  if (!apiKey) throw new Error("ORQ_API_KEY not set");

  const reqBody: Record<string, unknown> = {
    model: params.model,
    input: params.input,
  };
  if (params.instructions !== undefined) reqBody.instructions = params.instructions;
  if (params.response_format !== undefined)
    reqBody.response_format = params.response_format;
  if (params.fallbacks && params.fallbacks.length > 0) {
    reqBody.fallbacks = params.fallbacks.map((model) => ({ model }));
  }

  const res = await fetch(ORQ_RESPONSES_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(reqBody),
    signal: AbortSignal.timeout(params.timeoutMs ?? DEFAULT_TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Orq responses (${params.model}) failed: ${res.status} ${res.statusText}${errText ? ` -- ${errText.slice(0, 200)}` : ""}`,
    );
  }

  const json = (await res.json()) as ResponsesPayload;
  const text = extractResponsesText(json);
  if (!text)
    throw new Error(`Orq responses (${params.model}) returned empty output`);

  const u = json.usage;
  const usage: OrqUsage | undefined =
    u && typeof u.total_tokens === "number"
      ? {
          input_tokens: u.input_tokens ?? 0,
          output_tokens: u.output_tokens ?? 0,
          total_tokens: u.total_tokens,
        }
      : undefined;

  return { text, usage, raw: json };
}
