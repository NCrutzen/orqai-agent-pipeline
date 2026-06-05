// Phase 116 review WR-04 — shared Orq.ai Router chat helper.
//
// Both support-tickets/detect-system.ts and attachments/extract.ts independently
// re-probed the @orq-ai/node SDK surface
// (`router?.chatCompletions?.create ?? router?.chat?.completions?.create ?? …`)
// and invoked it via `completionFn.call(...)`. The review (WR-04) flagged this
// duplicated, cast-through-`any` probe: if the SDK shape drifts, EVERY call site
// silently degrades to a per-item failure, masking a systemic Router outage as
// scattered extraction failures. Factor the probe + invocation into ONE util so
// the SDK surface is resolved in a single place, and distinguish
// "Router unavailable / misconfigured" (a throw) from "this item produced no
// content" (the caller's concern).
//
// CLAUDE.md compliance: routes through the Orq.ai Router only (NEVER a direct
// OpenAI/Anthropic key); the @orq-ai/node SDK is imported lazily because raw HTTP
// to /v2/router/chat/completions returns 404 (the SDK routes internally).

/** Thrown when the Router client itself is unavailable/misconfigured (missing
 *  credential, SDK shape drift). Distinct from a per-item empty/usable result so
 *  a systemic outage is observable instead of masquerading as item failures. */
export class OrqRouterUnavailableError extends Error {
  readonly code: string;
  constructor(code: string, opts?: { cause?: unknown; message?: string }) {
    super(opts?.message ?? code, { cause: opts?.cause });
    this.name = "OrqRouterUnavailableError";
    this.code = code;
  }
}

export interface OrqRouterChatResponse {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export interface OrqRouterChatOptions {
  apiKey: string;
  /** The chat-completions request body (model, messages, response_format, …). */
  body: Record<string, unknown>;
  /** SDK client timeout in ms (covers Orq's ~31s internal retry window). */
  timeoutMs?: number;
}

/**
 * Resolve the @orq-ai/node Router chat-completions method ONCE and invoke it.
 *
 * Throws OrqRouterUnavailableError when the SDK surface cannot be located (shape
 * drift / misconfig) — the caller can then surface a systemic-outage signal
 * rather than a per-item failure. The actual request error (network, model) is
 * re-thrown wrapped so callers can still catch-all for fail-soft behaviour.
 */
export async function orqRouterChat(
  opts: OrqRouterChatOptions,
): Promise<OrqRouterChatResponse> {
  const { Orq } = await import("@orq-ai/node");
  const orq =
    opts.timeoutMs !== undefined
      ? new Orq({ apiKey: opts.apiKey, timeoutMs: opts.timeoutMs })
      : new Orq({ apiKey: opts.apiKey });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const router = (orq as any).router;
  const completionsObj =
    router?.chatCompletions ?? router?.chat?.completions ?? router?.completions;
  const completionFn =
    router?.chatCompletions?.create ??
    router?.chat?.completions?.create ??
    router?.completions?.create;
  if (typeof completionFn !== "function") {
    throw new OrqRouterUnavailableError("orq_sdk_router_method_missing", {
      message: "Could not locate router chat completions method on Orq SDK",
    });
  }
  return (await completionFn.call(
    completionsObj,
    opts.body,
  )) as OrqRouterChatResponse;
}
