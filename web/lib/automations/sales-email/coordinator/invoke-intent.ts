import { salesIntentOutputSchema, type SalesIntentOutput } from "./types";
import { invokeOrqResponses } from "@/lib/automations/orq-responses";

// ---------------------------------------------------------------------------
// Sales Stage 3 Orq invoke wrapper (Phase 113, greenfield V1).
//
// Structurally identical to the debtor invoke-intent.ts: both route through the
// queue-free Responses API (orq-responses.ts) via `agent/<key>`, with a 45s
// deadline, fence-strip regex, and usage forwarding. The only substantive
// differences:
//   1. AGENT_KEY = "sales-intent-agent".
//   2. Single literal-version Zod gate (salesIntentOutputSchema) — sales is
//      greenfield V1, so NO V2/V3 discriminated union.
//   3. No document_reference/sub_type, so the prompt <context> block carries the
//      sales fields + a <stage2_resolution> line (the entity_relationship prompt
//      input, D-05/D-06).
// ---------------------------------------------------------------------------

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
  // Phase 139 — invoke via the QUEUE-FREE Responses API (orq-responses.ts), NOT
  // the legacy /v2/agents/{key}/responses queue endpoint. `agent/<key>` applies
  // the agent's Studio prompt + response_format server-side. received_at was an
  // Orq trace-only variable on the dead endpoint; the <context> block in
  // buildUserMessage already carries the ids, so trace visibility holds via `input`.
  const { text: raw, usage: orqUsage } = await invokeOrqResponses({
    model: `agent/${AGENT_KEY}`,
    input: buildUserMessage({
      email_id: input.email_id,
      run_id: input.inngest_run_id,
      sender_email: input.sender_email,
      sender_domain: input.sender_domain,
      mailbox: input.mailbox,
      resolution_status: input.resolution_status,
      assembled_input: input.assembled_input,
    }),
    timeoutMs: TIMEOUT_MS,
  });

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

  const usage: InvokeSalesIntentUsage | undefined = orqUsage;

  return { output: validated.data, raw, usage };
}
