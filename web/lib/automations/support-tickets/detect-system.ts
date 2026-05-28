// Plan 02-05 Task 1 — detectSoftwareSystem via Orq.ai LLM Router.
//
// Calls Sonnet 4.5 (anthropic/claude-sonnet-4-5-20250929) through Orq's
// /v2/router/chat/completions endpoint with json_schema strict mode and
// anyOf-for-nullable on `system_key` (CLAUDE.md "Orq.ai" rule). Vision-capable
// model — frame URLs flow in as image_url content parts (signed via Supabase
// Storage createSignedUrl(600s)).
//
// Hallucination guard (T-02-27 mitigation): when the LLM returns a `system_key`
// that is NOT in the provided registry, force `status='unknown'` with
// reasoning marker `llm_hallucinated_system_key:<key>`.
//
// CLAUDE.md compliance: NO direct OpenAI/Anthropic SDK — routes via Orq.
// 45s AbortController timeout (covers Orq's 31s internal retry window).
//
// Cost: numeric(10,4) precision (matches pipeline_events.cost_cents). Read
// from response.usage when present; else estimate from token counts at Sonnet
// 4.5 pricing ($3/M input, $15/M output as of 2026-05).

import { z } from "zod";

const ORQ_ROUTER_URL = "https://api.orq.ai/v2/router/chat/completions";
const MODEL_ID = "anthropic/claude-sonnet-4-5-20250929" as const;
const TIMEOUT_MS = 45_000;
const FRAME_SIGNED_URL_TTL_S = 600;
const STORAGE_BUCKET = "support-tickets-frames";
const SONNET_USD_PER_INPUT_TOKEN = 3 / 1_000_000;
const SONNET_USD_PER_OUTPUT_TOKEN = 15 / 1_000_000;
const USD_TO_CENTS = 100;

export class DetectSystemError extends Error {
  readonly code: string;
  readonly http_status: number | null;
  constructor(
    code: string,
    opts?: { cause?: unknown; http_status?: number | null; message?: string },
  ) {
    super(opts?.message ?? code, { cause: opts?.cause });
    this.name = "DetectSystemError";
    this.code = code;
    this.http_status = opts?.http_status ?? null;
  }
}

export interface DetectSystemArgs {
  transcript: string;
  /** Frame Storage keys (relative to STORAGE_BUCKET). Signed at call time. */
  frameUrls: string[];
  registryRows: Array<{ system_key: string; display_name: string }>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: { storage: { from: (b: string) => any } };
  env: { ORQ_API_KEY?: string };
}

export interface DetectSystemResult {
  system_key: string | null;
  status: "detected" | "unknown";
  cost_cents: number;
  reasoning: string;
}

const responseSchema = z.object({
  system_key: z.string().nullable(),
  confidence: z.enum(["high", "medium", "low"]),
  reasoning: z.string(),
});

/**
 * Round a cost in cents to numeric(10,4) precision (matches
 * pipeline_events.cost_cents column scale).
 */
function quantizeCost(cents: number): number {
  return Math.round(cents * 10_000) / 10_000;
}

function computeCostCents(usage: {
  prompt_tokens?: number;
  completion_tokens?: number;
} | null | undefined): number {
  const inTok = usage?.prompt_tokens ?? 0;
  const outTok = usage?.completion_tokens ?? 0;
  const usd = inTok * SONNET_USD_PER_INPUT_TOKEN + outTok * SONNET_USD_PER_OUTPUT_TOKEN;
  return quantizeCost(usd * USD_TO_CENTS);
}

function buildSystemPrompt(registryRows: DetectSystemArgs["registryRows"]): string {
  const bullets = registryRows
    .map((r) => `  - ${r.system_key} — ${r.display_name}`)
    .join("\n");
  return [
    "<role>",
    "You are a support-ticket triage classifier for Moyne Roberts.",
    "</role>",
    "<task>",
    "Given a transcript of a user describing a problem (plus optional screenshots),",
    "identify WHICH software system from the registry below the issue concerns.",
    "</task>",
    "<constraints>",
    "- You MUST return a system_key from the registry list OR null.",
    "- Do NOT invent a system_key. If unsure, return null.",
    "- Use ONLY the system_keys listed below.",
    "</constraints>",
    "<registry>",
    bullets,
    "</registry>",
    "<output_format>",
    "Return JSON matching the response schema: { system_key, confidence, reasoning }.",
    "</output_format>",
  ].join("\n");
}

async function signFrame(
  supabase: DetectSystemArgs["supabase"],
  key: string,
): Promise<string | null> {
  try {
    const res = await supabase.storage
      .from(STORAGE_BUCKET)
      .createSignedUrl(key, FRAME_SIGNED_URL_TTL_S);
    return res?.data?.signedUrl ?? null;
  } catch {
    return null;
  }
}

export async function detectSoftwareSystem(
  args: DetectSystemArgs,
): Promise<DetectSystemResult> {
  if (args.registryRows.length === 0) {
    return {
      system_key: null,
      status: "unknown",
      cost_cents: 0,
      reasoning: "registry_empty",
    };
  }

  const apiKey = args.env.ORQ_API_KEY;
  if (!apiKey) {
    throw new DetectSystemError("missing_orq_api_key");
  }

  // Sign each frame for vision input. Failures are skipped silently — vision
  // is supplementary, transcript drives the classification.
  const signedFrameUrls: string[] = [];
  for (const k of args.frameUrls) {
    const signed = await signFrame(args.supabase, k);
    if (signed) signedFrameUrls.push(signed);
  }

  const userContent: Array<
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } }
  > = [
    {
      type: "text",
      text: `<transcript>\n${args.transcript}\n</transcript>`,
    },
  ];
  for (const url of signedFrameUrls) {
    userContent.push({ type: "image_url", image_url: { url } });
  }

  const responseFormat = {
    type: "json_schema",
    json_schema: {
      name: "support_system_detect_v1",
      strict: true,
      schema: {
        type: "object",
        additionalProperties: false,
        properties: {
          system_key: { anyOf: [{ type: "string" }, { type: "null" }] },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
          reasoning: { type: "string" },
        },
        required: ["system_key", "confidence", "reasoning"],
      },
    },
  };

  const body = {
    model: MODEL_ID,
    max_tokens: 1024,
    messages: [
      { role: "system", content: buildSystemPrompt(args.registryRows) },
      { role: "user", content: userContent },
    ],
    response_format: responseFormat,
    metadata: { user_id: "support-tickets-stage-2" },
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ORQ_ROUTER_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (cause) {
    clearTimeout(timeout);
    throw new DetectSystemError("orq_request_failed", { cause });
  }
  clearTimeout(timeout);

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new DetectSystemError("orq_http_error", {
      http_status: res.status,
      message: `Orq router error ${res.status}: ${errText.slice(0, 200)}`,
    });
  }

  let json: {
    choices?: Array<{ message?: { content?: string } }>;
    usage?: { prompt_tokens?: number; completion_tokens?: number };
  };
  try {
    json = await res.json();
  } catch (cause) {
    throw new DetectSystemError("response_json_parse_failed", { cause });
  }

  const rawContent = json.choices?.[0]?.message?.content ?? "";
  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(rawContent);
  } catch {
    throw new DetectSystemError("response_schema_invalid", {
      message: `LLM content is not valid JSON: ${rawContent.slice(0, 120)}`,
    });
  }

  const safe = responseSchema.safeParse(parsedJson);
  if (!safe.success) {
    throw new DetectSystemError("response_schema_invalid", {
      cause: safe.error,
    });
  }
  const parsed = safe.data;

  const cost_cents = computeCostCents(json.usage);

  // Hallucination guard (T-02-27).
  if (
    parsed.system_key !== null &&
    !args.registryRows.some((r) => r.system_key === parsed.system_key)
  ) {
    return {
      system_key: null,
      status: "unknown",
      cost_cents,
      reasoning: `llm_hallucinated_system_key:${parsed.system_key}`,
    };
  }

  return {
    system_key: parsed.system_key,
    status: parsed.system_key !== null ? "detected" : "unknown",
    cost_cents,
    reasoning: parsed.reasoning,
  };
}
