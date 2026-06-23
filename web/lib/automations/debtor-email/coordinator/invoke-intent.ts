import type { ZodTypeAny } from "zod";
import {
  // Phase 65 D-12 — v2 ranked-intent schema. v1 import retained for the
  // Plan 65-05 backfill regression comparator; Phase 66 deletes v1.
  intentAgentOutputSchema,
  intentAgentOutputSchemaV2,
  // Phase 85 D-07 — V3 schema + discriminator. V2 stays alive one release.
  INTENT_VERSION_V3,
  intentAgentOutputSchemaV3,
  type IntentAgentOutput,
  type IntentAgentOutputV2,
  type IntentAgentOutputV3,
} from "./types";

const ORQ_ENDPOINT = "https://api.orq.ai/v2/agents";
// Phase 113 Plan 02 (Q1 seam) — the agent key is no longer a module-level
// constant baked into the URL. It is a per-call value defaulting to the debtor
// agent, so existing debtor callers (passing no options) get the IDENTICAL URL
// — byte-neutral. The shared coordinator overrides it with the per-swarm key
// read from swarms.stage3_coordinator_agent_key.
const DEFAULT_AGENT_KEY = "debtor-intent-agent";
const TIMEOUT_MS = 45_000;

export type InvokeIntentInput = {
  email_id: string;
  inngest_run_id: string;
  subject: string;
  body_text: string;
  /**
   * Phase 83 D-06: wrapped XML structure (<inbound_message>+<quoted_thread>)
   * assembled by `assembleInput`. This is what the Stage 3 prompt actually
   * sees; body_text remains in the Orq variables payload for trace visibility
   * only and is no longer interpolated into the prompt text.
   */
  assembled_input: string;
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
  /**
   * Phase 113 Plan 02 (Q1 seam) — per-call Orq agent key. Defaults to
   * `debtor-intent-agent`. The shared coordinator passes the per-swarm key it
   * reads from `swarms.stage3_coordinator_agent_key`, so a third swarm dispatches
   * through THIS same function with zero new code path. Omitting it preserves
   * the debtor URL byte-for-byte.
   */
  agent_key?: string;
  /**
   * Phase 113 Plan 02 (Q1 seam) — per-call output Zod gate. Defaults to the
   * debtor V2/V3 discriminated gate (sniffs intent_version). The shared
   * coordinator supplies the per-swarm schema from INTENT_SCHEMA_BY_SWARM so the
   * sales output validates against salesIntentOutputSchema. Omitting it preserves
   * the debtor validation byte-for-byte.
   */
  schema?: ZodTypeAny;
};

/**
 * Phase 87 Plan 03 — token-usage telemetry surfaced from Orq /responses.
 * Optional field: present whenever Orq returns a usage block (current API),
 * undefined when omitted (defensive — older API paths / future schema drift).
 * Plan 04's retro loop reads `total_tokens` to accumulate cost per run_id.
 */
export type InvokeIntentUsage = {
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
};

export type InvokeIntentResult = {
  // Phase 85 D-07 — discriminated union; narrow via `output.intent_version`.
  // Phase 113 Plan 02: when a per-swarm `schema` is supplied via options, the
  // validated output is that schema's type (e.g. SalesIntentOutput). The shared
  // coordinator casts the value to the swarm's known shape after the call —
  // every Stage 3 schema carries `ranked`, so the persist/hoist path is
  // swarm-agnostic. The default debtor path is unchanged (V2|V3 union).
  output: IntentAgentOutputV2 | IntentAgentOutputV3;
  raw: string;
  usage?: InvokeIntentUsage;
};

// Re-export v1 type alias for callers that still need it (Plan 65-05 backfill
// regression comparator). Production triage path consumes only IntentAgentOutputV2.
export type { IntentAgentOutput };

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
  entity: string;
  assembled_input: string;
}): string {
  // Phase 83 D-06: prompt text is a context block (XML-tagged metadata) plus
  // the wrapped <inbound_message>/<quoted_thread> assembled_input. Replay-
  // safety holds because assembled_input is deterministic for a given
  // (email_id, conversation_context state) pair.
  return (
    `Classify the following debtor email.\n\n` +
    `<context>\n` +
    `  <email_id>${promptVars.email_id}</email_id>\n` +
    `  <run_id>${promptVars.run_id}</run_id>\n` +
    `  <sender_email>${promptVars.sender_email}</sender_email>\n` +
    `  <sender_domain>${promptVars.sender_domain}</sender_domain>\n` +
    `  <mailbox>${promptVars.mailbox}</mailbox>\n` +
    `  <entity>${promptVars.entity}</entity>\n` +
    `</context>\n` +
    `${promptVars.assembled_input}\n` +
    `Return the JSON object. No preamble.`
  );
}

// Fail-soft repair (follow-up to debtor-email-coordinator.ts retries note):
// salvage a verdict whose ONLY schema violations are on secondary, coercible
// fields — an out-of-enum value on a NULLABLE field (→ null) or an over-long
// string (→ truncate). Swarm-agnostic: it names no field, only reacts to Zod
// issue codes, so it works for any swarm's output schema. It never invents a
// primary value: nulling a required field just makes the re-parse fail again
// and the caller throws, so a broken top-1 intent still surfaces (no silent
// mislabel). Returns the repaired clone, or undefined if any issue is one we
// can't safely coerce (caller then throws the original error).
type ZodIssueLike = {
  code: string;
  path: ReadonlyArray<string | number>;
  maximum?: number | bigint;
  origin?: string;
  type?: string;
};
function getAtPath(obj: unknown, path: ReadonlyArray<string | number>): unknown {
  let cur: unknown = obj;
  for (const k of path) {
    if (cur == null) return undefined;
    cur = (cur as Record<string | number, unknown>)[k];
  }
  return cur;
}
function setAtPath(
  obj: unknown,
  path: ReadonlyArray<string | number>,
  val: unknown,
): void {
  let cur: unknown = obj;
  for (let i = 0; i < path.length - 1; i++) {
    if (cur == null) return;
    cur = (cur as Record<string | number, unknown>)[path[i]];
  }
  if (cur != null) (cur as Record<string | number, unknown>)[path[path.length - 1]] = val;
}
function repairBySafeCoercion(
  value: unknown,
  issues: ReadonlyArray<ZodIssueLike>,
): unknown {
  const clone = structuredClone(value);
  for (const issue of issues) {
    if (issue.path.length === 0) return undefined; // root-level — unrepairable
    // zod4 emits "invalid_value" for enum mismatches; "invalid_enum_value" is
    // the zod3 name — accept both so the repair survives a zod bump.
    if (issue.code === "invalid_value" || issue.code === "invalid_enum_value") {
      setAtPath(clone, issue.path, null);
    } else if (
      issue.code === "too_big" &&
      (issue.origin === "string" || issue.type === "string") &&
      typeof issue.maximum === "number"
    ) {
      const cur = getAtPath(clone, issue.path);
      if (typeof cur === "string") setAtPath(clone, issue.path, cur.slice(0, issue.maximum));
    } else {
      return undefined; // unknown issue — don't guess, let the caller throw
    }
  }
  return clone;
}

export async function invokeIntentAgent(
  input: InvokeIntentInput,
  options: InvokeIntentOptions = {},
): Promise<InvokeIntentResult> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) throw new Error("ORQ_API_KEY not set");

  // `received_at` is logged as an Orq variable for traces but kept out of the
  // prompt text so retries N minutes later hash to the same prompt string.
  // Phase 83 D-06: prompt text is the wrapped XML assembled_input; subject /
  // body_text / received_at stay in `variables` for Orq trace visibility but
  // are no longer interpolated into the user message.
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
      parts: [
        {
          kind: "text",
          text: buildUserMessage({
            email_id: input.email_id,
            run_id: input.inngest_run_id,
            sender_email: input.sender_email,
            sender_domain: input.sender_domain,
            mailbox: input.mailbox,
            entity: input.entity,
            assembled_input: input.assembled_input,
          }),
        },
      ],
    },
    configuration: { blocking: true, variables },
  };

  // Phase 113 Plan 02 (Q1 seam) — per-call agent key, defaulting to the debtor
  // agent. Default path produces the IDENTICAL URL as the pre-parameterization
  // module constant — debtor byte-neutral.
  const agentKey = options.agent_key ?? DEFAULT_AGENT_KEY;

  const res = await fetch(`${ORQ_ENDPOINT}/${agentKey}/responses`, {
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
    // Phase 87 Plan 03 — Orq /responses usage block (verified at
    // orq-agents/client.ts:198-208). Optional: defensive against schema drift.
    usage?: {
      input_tokens?: number;
      output_tokens?: number;
      total_tokens?: number;
    };
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

  // Phase 113 Plan 02 (Q1 seam) — per-call output gate. When `options.schema`
  // is supplied (the shared coordinator passes the per-swarm schema from
  // INTENT_SCHEMA_BY_SWARM), validate against it directly. When omitted (every
  // existing debtor caller) fall back to the debtor V2/V3 discriminated gate
  // below — byte-identical to the pre-parameterization behaviour.
  //
  // Phase 85 (D-07) — tolerant Zod gate. Sniff intent_version BEFORE
  // safeParse so the error message points at the schema for the version the
  // agent actually returned. Single discriminator site — downstream consumers
  // narrow via `if (output.intent_version === INTENT_VERSION_V3)`.
  // V1 outputs still fail this gate (no matching literal in either branch).
  const version = (parsed as { intent_version?: unknown })?.intent_version;
  const debtorDefaultSchema =
    version === INTENT_VERSION_V3
      ? intentAgentOutputSchemaV3
      : intentAgentOutputSchemaV2;
  const schema = options.schema ?? debtorDefaultSchema;
  let validated = schema.safeParse(parsed);
  if (!validated.success) {
    // Fail-soft: try coercing secondary-field violations (out-of-enum nullable
    // fields, over-long strings) and re-parse once. Only a verdict broken on a
    // PRIMARY field (e.g. an out-of-enum ranked[].intent) still throws.
    const repaired = repairBySafeCoercion(parsed, validated.error.issues);
    const second = repaired === undefined ? undefined : schema.safeParse(repaired);
    if (second?.success) {
      console.warn(
        `[invoke-intent] fail-soft coerced ${validated.error.issues.length} secondary schema issue(s) (version=${String(
          version,
        )}): ${JSON.stringify(validated.error.issues.map((i) => i.path))}`,
      );
      validated = second;
    } else {
      const e = new Error(
        `Intent-agent output schema mismatch (version=${String(version)}): ${JSON.stringify(
          validated.error.issues,
        )}`,
      );
      (e as { raw?: string }).raw = raw;
      throw e;
    }
  }

  // Phase 87 Plan 03 — forward Orq usage when present. `undefined` keeps the
  // contract additive: callers that don't care still destructure { output, raw }.
  const u = json.usage;
  const usage: InvokeIntentUsage | undefined =
    u && typeof u.total_tokens === "number"
      ? {
          input_tokens: u.input_tokens ?? 0,
          output_tokens: u.output_tokens ?? 0,
          total_tokens: u.total_tokens,
        }
      : undefined;

  // Phase 113 Plan 02: `validated.data` is the per-call schema's inferred type
  // (the debtor V2/V3 union by default, or the supplied per-swarm schema's
  // output). Cast to the declared union on the result; the shared coordinator
  // re-casts to the swarm's known shape. Every Stage 3 schema carries `ranked`,
  // so the downstream persist/hoist path stays swarm-agnostic.
  return {
    output: validated.data as IntentAgentOutputV2 | IntentAgentOutputV3,
    raw,
    usage,
  };
}

// Silence unused-import lint for the retained v1 schema (kept for Plan 65-05).
void intentAgentOutputSchema;
