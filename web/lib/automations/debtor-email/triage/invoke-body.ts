import {
  bodyAgentOutputSchema,
  BODY_VERSION,
  type BodyAgentOutput,
  type Confidence,
  type Entity,
  type Intent,
  type Language,
  type SubType,
} from "./types";

const ORQ_ENDPOINT = "https://api.orq.ai/v2/agents";
const AGENT_KEY = "debtor-copy-document-body-agent";
const TIMEOUT_MS = 45_000;

export type InvokeBodyInput = {
  email_id: string;
  inngest_run_id: string;
  email_subject: string;
  email_body_text: string;
  email_sender_email: string;
  email_sender_first_name: string | null;
  email_mailbox: string;
  email_entity: Entity;
  email_language: Language;
  intent_result_intent: Intent;
  intent_result_sub_type: SubType;
  intent_result_document_reference: string;
  intent_result_confidence: Confidence;
  fetched_document_invoice_id: string;
  fetched_document_filename: string;
  fetched_document_document_type: string;
  fetched_document_created_on: string;
  emotion_trigger_match: boolean;
  /** Logged only, stripped from the prompt body. */
  received_at?: string;
};

export type InvokeBodyOptions = {
  /** Prompt-addendum flag for validator-retry (see ORCHESTRATION.md §body retry). */
  previous_attempt_missing_footer?: boolean;
  previous_attempt_contained_signature?: boolean;
  previous_attempt_missing_team_line?: boolean;
  modelOverride?: string;
};

export type InvokeBodyResult = {
  output: BodyAgentOutput;
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
  return `Generate the cover-letter body for the following copy-document request.\n\n${JSON.stringify(
    promptVars,
    null,
    2,
  )}\n\nReturn the JSON object. No preamble.`;
}

export async function invokeBodyAgent(
  input: InvokeBodyInput,
  options: InvokeBodyOptions = {},
): Promise<InvokeBodyResult> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) throw new Error("ORQ_API_KEY not set");

  const promptVars = sortKeys({
    email_id: input.email_id,
    inngest_run_id: input.inngest_run_id,
    stage: "generate_body",
    email_subject: input.email_subject,
    email_body_text: input.email_body_text,
    email_sender_email: input.email_sender_email,
    email_sender_first_name: input.email_sender_first_name,
    email_mailbox: input.email_mailbox,
    email_entity: input.email_entity,
    email_language: input.email_language,
    intent_result_intent: input.intent_result_intent,
    intent_result_sub_type: input.intent_result_sub_type,
    intent_result_document_reference: input.intent_result_document_reference,
    intent_result_confidence: input.intent_result_confidence,
    fetched_document_invoice_id: input.fetched_document_invoice_id,
    fetched_document_filename: input.fetched_document_filename,
    fetched_document_document_type: input.fetched_document_document_type,
    fetched_document_created_on: input.fetched_document_created_on,
    body_version: BODY_VERSION,
    emotion_trigger_match: input.emotion_trigger_match,
    ...(options.previous_attempt_missing_footer
      ? { previous_attempt_missing_footer: true }
      : {}),
    ...(options.previous_attempt_contained_signature
      ? { previous_attempt_contained_signature: true }
      : {}),
    ...(options.previous_attempt_missing_team_line
      ? { previous_attempt_missing_team_line: true }
      : {}),
  });

  const variables: Record<string, unknown> = { ...promptVars };
  if (input.received_at) variables.received_at = input.received_at;
  if (options.modelOverride) {
    // TODO(orq): confirm how agent reads model override; may need Orq Router
    // per-invocation model override plumbing rather than a prompt variable.
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
      `Orq body-agent failed: ${res.status} ${res.statusText}${errText ? ` -- ${errText.slice(0, 200)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    output?: Array<{
      role?: string;
      parts?: Array<{ kind?: string; text?: string }>;
    }>;
  };

  const raw = json.output?.[0]?.parts?.[0]?.text ?? "";
  if (!raw) throw new Error("Orq body-agent returned empty output");

  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    const e = new Error(
      `Body-agent JSON.parse failed: ${(err as Error).message}`,
    );
    (e as { raw?: string }).raw = raw;
    throw e;
  }

  const validated = bodyAgentOutputSchema.safeParse(parsed);
  if (!validated.success) {
    const e = new Error(
      `Body-agent schema validation failed: ${validated.error.message}`,
    );
    (e as { raw?: string }).raw = raw;
    throw e;
  }

  return { output: validated.data, raw };
}
