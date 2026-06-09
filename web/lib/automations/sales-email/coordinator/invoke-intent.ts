import { salesIntentOutputSchema, type SalesIntentOutput } from "./types";

// ---------------------------------------------------------------------------
// Sales Stage 3 Orq invoke wrapper (Phase 113, greenfield V1).
//
// Structurally identical to the debtor invoke-intent.ts (same ORQ_ENDPOINT,
// 45s timeout, sortKeys, received_at-out-of-prompt, fence-strip regex, usage
// forwarding). The only substantive differences:
//   1. AGENT_KEY = "sales-intent-agent".
//   2. Single literal-version Zod gate (salesIntentOutputSchema) — sales is
//      greenfield V1, so NO V2/V3 discriminated union.
//   3. No document_reference/sub_type, so the prompt <context> block carries the
//      sales fields + a <stage2_resolution> line (the entity_relationship prompt
//      input, D-05/D-06).
//   4. No modelOverride path — sales is single-model V1.
// ---------------------------------------------------------------------------

const ORQ_ENDPOINT = "https://api.orq.ai/v2/agents";
const AGENT_KEY = "sales-intent-agent";
const TIMEOUT_MS = 45_000;

export type InvokeSalesIntentInput = {
  email_id: string;
  inngest_run_id: string;
  subject: string;
  body_text: string;
  /**
   * Wrapped XML structure (<inbound_message>+<quoted_thread>) assembled
   * upstream. This is what the Stage 3 prompt actually sees; body_text stays in
   * the Orq variables payload for trace visibility only.
   */
  assembled_input: string;
  sender_email: string;
  sender_domain: string;
  mailbox: string;
  /**
   * The Stage 2 resolution status string (D-05/D-06). Fed into the prompt
   * <stage2_resolution> line so the agent can ground the entity_relationship
   * axis on what Stage 2 actually found ("resolved_entity" / dry-run / etc.).
   */
  resolution_status: string;
  /** Logged only, stripped from the prompt body for idempotency. */
  received_at: string;
};

/**
 * Token-usage telemetry surfaced from Orq /responses. Optional: present when
 * Orq returns a usage block, undefined otherwise (defensive against drift).
 */
export type InvokeSalesIntentUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type InvokeSalesIntentResult = {
  output: SalesIntentOutput;
  raw: string;
  usage?: InvokeSalesIntentUsage;
};

function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted as T;
}

function buildUserMessage(promptVars: {
  email_id: string;
  run_id: string;
  sender_email: string;
  sender_domain: string;
  mailbox: string;
  resolution_status: string;
  assembled_input: string;
}): string {
  // Prompt text is a context block (XML-tagged metadata + the Stage 2
  // resolution status) plus the wrapped assembled_input. Replay-safe because
  // assembled_input is deterministic for a given (email_id, context) pair.
  return (
    `Classify the following sales email.\n\n` +
    `<context>\n` +
    `  <email_id>${promptVars.email_id}</email_id>\n` +
    `  <run_id>${promptVars.run_id}</run_id>\n` +
    `  <sender_email>${promptVars.sender_email}</sender_email>\n` +
    `  <sender_domain>${promptVars.sender_domain}</sender_domain>\n` +
    `  <mailbox>${promptVars.mailbox}</mailbox>\n` +
    `  <stage2_resolution>${promptVars.resolution_status}</stage2_resolution>\n` +
    `</context>\n` +
    `${promptVars.assembled_input}\n` +
    `Return the JSON object. No preamble.`
  );
}

export async function invokeSalesIntentAgent(
  input: InvokeSalesIntentInput,
): Promise<InvokeSalesIntentResult> {
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
    assembled_input: input.assembled_input,
    sender_email: input.sender_email,
    sender_domain: input.sender_domain,
    mailbox: input.mailbox,
    resolution_status: input.resolution_status,
  });

  const variables: Record<string, unknown> = {
    ...promptVars,
    received_at: input.received_at,
  };

  const body = {
    message: {
      role: "user",
      parts: [
        {
          kind: "text",
          text: buildUserMessage({
            email_id: input.email_id,
            run_id: input.inngest_run_id,
            sender_email: input.sender_email,
            sender_domain: input.sender_domain,
            mailbox: input.mailbox,
            resolution_status: input.resolution_status,
            assembled_input: input.assembled_input,
          }),
        },
      ],
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
      `Orq sales-intent-agent failed: ${res.status} ${res.statusText}${errText ? ` -- ${errText.slice(0, 200)}` : ""}`,
    );
  }

  const json = (await res.json()) as {
    output?: Array<{
      role?: string;
      parts?: Array<{ kind?: string; text?: string }>;
    }>;
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
  };

  const raw = json.output?.[0]?.parts?.[0]?.text ?? "";
  if (!raw) throw new Error("Orq sales-intent-agent returned empty output");

  const stripped = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "");

  let parsed: unknown;
  try {
    parsed = JSON.parse(stripped);
  } catch (err) {
    const e = new Error(
      `Sales-intent-agent JSON.parse failed: ${(err as Error).message}`,
    );
    (e as { raw?: string }).raw = raw;
    throw e;
  }

  // Single literal-version Zod gate (sales is greenfield V1). A failure surfaces
  // to Bulk Review with `.raw` attached as the retry surface — never routes.
  const validated = salesIntentOutputSchema.safeParse(parsed);
  if (!validated.success) {
    const e = new Error(
      `Sales-intent-agent output schema mismatch: ${JSON.stringify(
        validated.error.issues,
      )}`,
    );
    (e as { raw?: string }).raw = raw;
    throw e;
  }

  const u = json.usage;
  const usage: InvokeSalesIntentUsage | undefined =
    u && typeof u.total_tokens === "number"
      ? {
          input_tokens: u.input_tokens ?? 0,
          output_tokens: u.output_tokens ?? 0,
          total_tokens: u.total_tokens,
        }
      : undefined;

  return { output: validated.data, raw, usage };
}
