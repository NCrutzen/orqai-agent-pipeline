import {
  intentAgentOutputSchema,
  type IntentAgentOutput,
} from "./types";

const ORQ_ENDPOINT = "https://api.orq.ai/v2/agents";
const AGENT_KEY = "debtor-intent-agent";
const TIMEOUT_MS = 45_000;

export type InvokeIntentInput = {
  email_id: string;
  inngest_run_id: string;
  subject: string;
  body_text: string;
  sender_email: string;
  sender_domain: string;
  mailbox: string;
  entity: string;
  /** Logged only, stripped from the prompt body for idempotency. */
  received_at: string;
};

export type InvokeIntentOptions = {
  /**
   * Sonnet escalation — passed into Orq `variables` as `model_override`.
   * TODO(orq): confirm how agent reads model override; may need Orq Router
   * per-invocation model override plumbing rather than a prompt variable.
   */
  modelOverride?: string;
};

export type InvokeIntentResult = {
  output: IntentAgentOutput;
  raw: string;
};

function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted as T;
}

function buildUserMessage(promptVars: Record<string, unknown>): string {
  // Key-sorted JSON blob preserves idempotency across Inngest replays.
  return `Classify the following debtor email.\n\n${JSON.stringify(
    promptVars,
    null,
    2,
  )}\n\nReturn the JSON object. No preamble.`;
}

export async function invokeIntentAgent(
  input: InvokeIntentInput,
  options: InvokeIntentOptions = {},
): Promise<InvokeIntentResult> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) throw new Error("ORQ_API_KEY not set");

  // `received_at` is logged as an Orq variable for traces but kept out of the
  // prompt text so retries N minutes later hash to the same prompt string.
  const promptVars = sortKeys({
    email_id: input.email_id,
    inngest_run_id: input.inngest_run_id,
    stage: "classify",
    subject: input.subject,
    body_text: input.body_text,
    sender_email: input.sender_email,
    sender_domain: input.sender_domain,
    mailbox: input.mailbox,
    entity: input.entity,
  });

  const variables: Record<string, unknown> = {
    ...promptVars,
    received_at: input.received_at,
  };
  if (options.modelOverride) {
    variables.model_override = options.modelOverride;
  }

  const body = {
    message: {
      role: "user",
      parts: [{ kind: "text", text: buildUserMessage(promptVars) }],
    },
    configuration: { blocking: true, variables },
  };

  const res = await fetch(`${ORQ_ENDPOINT}/${AGENT_KEY}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Orq intent-agent failed: ${res.status} ${res.statusText}${errText ? ` -- ${errText.slice(0, 200)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    output?: Array<{
      role?: string;
      parts?: Array<{ kind?: string; text?: string }>;
    }>;
  };

  const raw = json.output?.[0]?.parts?.[0]?.text ?? "";
  if (!raw) throw new Error("Orq intent-agent returned empty output");

  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    const e = new Error(
      `Intent-agent JSON.parse failed: ${(err as Error).message}`,
    );
    (e as { raw?: string }).raw = raw;
    throw e;
  }

  const validated = intentAgentOutputSchema.safeParse(parsed);
  if (!validated.success) {
    const e = new Error(
      `Intent-agent schema validation failed: ${validated.error.message}`,
    );
    (e as { raw?: string }).raw = raw;
    throw e;
  }

  return { output: validated.data, raw };
}
