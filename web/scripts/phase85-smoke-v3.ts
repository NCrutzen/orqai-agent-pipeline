/**
 * Phase 85 Plan 03 — Stage 3 prompt V3 post-Studio smoke harness.
 *
 * Runs three independent smokes against the live `debtor-intent-agent` after
 * the operator has (1) created the V3 JSON Schema tool in Orq.ai Studio and
 * pointed the agent's Response Format dropdown at it, and (2) PATCHed the
 * agent with the V3 instructions string via `mcp__orqai-mcp__update_agent`.
 *
 * MODES
 *   --smoke-novel     One WKA-style email (CONTEXT R-02 case). Expects
 *                     `intent_proposal !== null` AND `proposal_reason` starts
 *                     with `No closed-list intent fits because` AND
 *                     `intent_version === "2026-05-19.v3"`.
 *   --smoke-clean     One clean copy_document_request. Expects
 *                     `intent_proposal === null` AND `proposal_reason === null`
 *                     (CONTEXT R-01 — no false novelty).
 *   --regression      Replays 12 historical `payment_dispute` emails against
 *                     the V3 agent and compares ranked-top closed-list intent
 *                     against the recorded baseline (85-REGRESSION-BASELINE.md
 *                     — file expected post-Wave-1). Expects
 *                     `changed_count <= 1` (CONTEXT verification §4).
 *   (no flag)         Runs all three sequentially. Prints
 *                     `ALL 3 SMOKES GREEN` on full pass, otherwise lists
 *                     failures and exits 1.
 *
 * USAGE
 *   cd web && npx tsx scripts/phase85-smoke-v3.ts                 # all 3
 *   cd web && npx tsx scripts/phase85-smoke-v3.ts --smoke-novel
 *   cd web && npx tsx scripts/phase85-smoke-v3.ts --smoke-clean
 *   cd web && npx tsx scripts/phase85-smoke-v3.ts --regression
 *
 * ENV
 *   ORQ_API_KEY  — required. Read from web/.env.local automatically.
 *
 * REGRESSION BASELINE FILE
 *   The script reads
 *   `.planning/phases/85-stage-3-prompt-v3-intent-definitions-and-open-set-schema/85-REGRESSION-BASELINE.md`
 *   when --regression is requested. The file is expected to contain a
 *   fenced JSON block of the form:
 *     ```json
 *     [
 *       { "email_id": "...", "subject": "...", "body_text": "...",
 *         "sender_email": "...", "sender_domain": "...", "mailbox": "...",
 *         "entity": "smeba", "baseline_top_intent": "payment_dispute" },
 *       ...
 *     ]
 *     ```
 *   If the file is missing OR no JSON block is found, --regression aborts
 *   with a clear message — it does NOT silently pass.
 *
 * INVOCATION SHAPE
 *   Mirrors `web/lib/automations/debtor-email/coordinator/invoke-intent.ts` —
 *   POST https://api.orq.ai/v2/agents/debtor-intent-agent/responses with
 *   { message: { role: "user", parts: [{ kind: "text", text: ... }] },
 *     configuration: { blocking: true, variables: {...} } }.
 *   Response is read from `output[0].parts[0].text`, fenced-JSON-stripped,
 *   then parsed.
 *
 * Exit codes:
 *   0 — all requested smokes pass
 *   1 — any smoke fails OR pre-flight setup error
 */

import { config as loadDotenv } from "dotenv";
import path from "node:path";
import fs from "node:fs";

// Mark module-scope to avoid script-global collision with sibling smokes.
export {};

loadDotenv({ path: path.resolve(__dirname, "..", ".env.local") });

const ORQ_API_KEY = process.env.ORQ_API_KEY;
if (!ORQ_API_KEY) {
  console.error("ORQ_API_KEY is not set (expected in web/.env.local)");
  process.exit(1);
}

const AGENT_KEY = "debtor-intent-agent";
const ORQ_AGENT_URL = `https://api.orq.ai/v2/agents/${AGENT_KEY}/responses`;
const TIMEOUT_MS = 45_000;
const EXPECTED_VERSION = "2026-05-19.v3";
const REASON_PREFIX = "No closed-list intent fits because";

const REGRESSION_BASELINE_PATH = path.resolve(
  __dirname,
  "..",
  "..",
  ".planning",
  "phases",
  "85-stage-3-prompt-v3-intent-definitions-and-open-set-schema",
  "85-REGRESSION-BASELINE.md",
);

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type ClosedListIntent =
  | "copy_document_request"
  | "payment_dispute"
  | "address_change"
  | "peppol_request"
  | "credit_request"
  | "contract_inquiry"
  | "general_inquiry"
  | "other";

interface RankedEntry {
  intent: ClosedListIntent;
  confidence: "low" | "medium" | "high";
  document_reference: string | null;
  sub_type: string | null;
  reasoning: string;
}

interface AgentOutputV3 {
  ranked: RankedEntry[];
  language: "nl" | "en" | "de" | "fr";
  urgency: "low" | "normal" | "high";
  intent_version: string;
  intent_proposal: string | null;
  proposal_reason: string | null;
}

interface SampleEmail {
  email_id: string;
  subject: string;
  body_text: string;
  sender_email: string;
  sender_domain: string;
  mailbox: string;
  entity: string;
}

interface BaselineRow extends SampleEmail {
  baseline_top_intent: ClosedListIntent;
}

interface SmokeFailure {
  smoke: string;
  reason: string;
}

// ---------------------------------------------------------------------------
// Built-in sample emails
// ---------------------------------------------------------------------------

const NOVEL_SAMPLE: SampleEmail = {
  email_id: "phase85-smoke-novel-wka",
  subject: "WKA-gegevens aanvraag — keten-aansprakelijkheid",
  body_text:
    "Geachte heer/mevrouw,\n\nIn het kader van onze ketenaansprakelijkheid (WKA) verzoeken wij u om uw recente verklaring betalingsgedrag van de Belastingdienst, een kopie van uw G-rekening overeenkomst, en het meest recente uittreksel KvK. Graag binnen 14 dagen aanleveren.\n\nMet vriendelijke groet,\nBreman Installatiebedrijf",
  sender_email: "administratie@breman.nl",
  sender_domain: "breman.nl",
  mailbox: "debiteuren@smeba.nl",
  entity: "smeba",
};

const CLEAN_SAMPLE: SampleEmail = {
  email_id: "phase85-smoke-clean-copydoc",
  subject: "Kopie factuur graag",
  body_text:
    "Goedemorgen,\n\nKunnen jullie ons factuur 33052208 nogmaals toesturen? We kunnen 'm in onze administratie niet meer terugvinden.\n\nAlvast bedankt.",
  sender_email: "boekhouding@klant.nl",
  sender_domain: "klant.nl",
  mailbox: "debiteuren@smeba.nl",
  entity: "smeba",
};

// ---------------------------------------------------------------------------
// Orq invocation (mirrors web/lib/automations/debtor-email/coordinator/invoke-intent.ts)
// ---------------------------------------------------------------------------

function sortKeys<T extends Record<string, unknown>>(obj: T): T {
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = obj[key];
  }
  return sorted as T;
}

function buildAssembledInput(s: SampleEmail): string {
  // Phase 83 D-06: prompt sees a wrapped XML envelope. For the smoke script
  // we synthesise a minimal inbound_message wrapper around the body_text;
  // production replaces this with the full assembleInput() output.
  return (
    `<inbound_message>\n` +
    `  <subject>${s.subject}</subject>\n` +
    `  <body>${s.body_text}</body>\n` +
    `</inbound_message>`
  );
}

function buildUserMessage(s: SampleEmail, runId: string): string {
  const assembled = buildAssembledInput(s);
  return (
    `Classify the following debtor email.\n\n` +
    `<context>\n` +
    `  <email_id>${s.email_id}</email_id>\n` +
    `  <run_id>${runId}</run_id>\n` +
    `  <sender_email>${s.sender_email}</sender_email>\n` +
    `  <sender_domain>${s.sender_domain}</sender_domain>\n` +
    `  <mailbox>${s.mailbox}</mailbox>\n` +
    `  <entity>${s.entity}</entity>\n` +
    `</context>\n` +
    `${assembled}\n` +
    `Return the JSON object. No preamble.`
  );
}

async function invokeAgent(s: SampleEmail): Promise<AgentOutputV3> {
  const runId = `phase85-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const promptVars = sortKeys({
    email_id: s.email_id,
    inngest_run_id: runId,
    stage: "classify",
    subject: s.subject,
    body_text: s.body_text,
    assembled_input: buildAssembledInput(s),
    sender_email: s.sender_email,
    sender_domain: s.sender_domain,
    mailbox: s.mailbox,
    entity: s.entity,
  });

  const variables: Record<string, unknown> = {
    ...promptVars,
    received_at: new Date().toISOString(),
  };

  const body = {
    message: {
      role: "user",
      parts: [
        {
          kind: "text",
          text: buildUserMessage(s, runId),
        },
      ],
    },
    configuration: { blocking: true, variables },
  };

  const res = await fetch(ORQ_AGENT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${ORQ_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `Orq intent-agent HTTP ${res.status} ${res.statusText} -- ${errText.slice(0, 400)}`,
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
    throw new Error(
      `JSON.parse failed on agent output: ${(err as Error).message}\nRAW: ${raw.slice(0, 400)}`,
    );
  }
  return parsed as AgentOutputV3;
}

// ---------------------------------------------------------------------------
// Smoke implementations
// ---------------------------------------------------------------------------

async function smokeNovel(): Promise<SmokeFailure | null> {
  console.log("\n## SMOKE 1/3 — novel (WKA pattern) -> intent_proposal non-null");
  let out: AgentOutputV3;
  try {
    out = await invokeAgent(NOVEL_SAMPLE);
  } catch (e) {
    return { smoke: "novel", reason: `invocation error: ${(e as Error).message}` };
  }
  console.log(JSON.stringify(out, null, 2));

  if (out.intent_version !== EXPECTED_VERSION) {
    return {
      smoke: "novel",
      reason: `intent_version='${out.intent_version}', expected '${EXPECTED_VERSION}'`,
    };
  }
  if (out.intent_proposal === null || out.intent_proposal === undefined) {
    return {
      smoke: "novel",
      reason: "intent_proposal is null on WKA sample — expected non-null novel label",
    };
  }
  if (
    typeof out.proposal_reason !== "string" ||
    !out.proposal_reason.startsWith(REASON_PREFIX)
  ) {
    return {
      smoke: "novel",
      reason: `proposal_reason does not start with '${REASON_PREFIX}' (got: ${JSON.stringify(out.proposal_reason)})`,
    };
  }
  console.log(
    `  PASS: intent_proposal='${out.intent_proposal}', proposal_reason starts with anchor`,
  );
  return null;
}

async function smokeClean(): Promise<SmokeFailure | null> {
  console.log(
    "\n## SMOKE 2/3 — clean copy_document_request -> intent_proposal must be null",
  );
  let out: AgentOutputV3;
  try {
    out = await invokeAgent(CLEAN_SAMPLE);
  } catch (e) {
    return { smoke: "clean", reason: `invocation error: ${(e as Error).message}` };
  }
  console.log(JSON.stringify(out, null, 2));

  if (out.intent_version !== EXPECTED_VERSION) {
    return {
      smoke: "clean",
      reason: `intent_version='${out.intent_version}', expected '${EXPECTED_VERSION}'`,
    };
  }
  if (out.intent_proposal !== null) {
    return {
      smoke: "clean",
      reason: `intent_proposal='${out.intent_proposal}' on a clean copy_document_request — expected null (R-01 over-eager)`,
    };
  }
  if (out.proposal_reason !== null) {
    return {
      smoke: "clean",
      reason: `proposal_reason='${out.proposal_reason}' but intent_proposal is null — must also be null`,
    };
  }
  if (out.ranked[0]?.intent !== "copy_document_request") {
    return {
      smoke: "clean",
      reason: `ranked[0].intent='${out.ranked[0]?.intent}', expected 'copy_document_request'`,
    };
  }
  console.log("  PASS: ranked-top is copy_document_request, both proposal fields null");
  return null;
}

function loadRegressionBaseline(): BaselineRow[] {
  if (!fs.existsSync(REGRESSION_BASELINE_PATH)) {
    throw new Error(
      `regression baseline file missing: ${REGRESSION_BASELINE_PATH}\n` +
        "Expected from Wave 1 / Plan 85-01. Cannot run --regression without it.",
    );
  }
  const md = fs.readFileSync(REGRESSION_BASELINE_PATH, "utf8");
  const m = md.match(/```json\s*([\s\S]*?)```/);
  if (!m) {
    throw new Error(
      `regression baseline file has no fenced \`\`\`json block: ${REGRESSION_BASELINE_PATH}`,
    );
  }
  let arr: unknown;
  try {
    arr = JSON.parse(m[1]);
  } catch (e) {
    throw new Error(`regression baseline JSON parse failed: ${(e as Error).message}`);
  }
  if (!Array.isArray(arr) || arr.length === 0) {
    throw new Error("regression baseline JSON is not a non-empty array");
  }
  return arr as BaselineRow[];
}

async function smokeRegression(): Promise<SmokeFailure | null> {
  console.log("\n## SMOKE 3/3 — disambiguation regression (<=1 of 12 changes top-1)");
  let baseline: BaselineRow[];
  try {
    baseline = loadRegressionBaseline();
  } catch (e) {
    return { smoke: "regression", reason: (e as Error).message };
  }
  console.log(`  loaded ${baseline.length} baseline rows from 85-REGRESSION-BASELINE.md`);

  let changed = 0;
  const diffs: string[] = [];
  for (const row of baseline) {
    let out: AgentOutputV3;
    try {
      out = await invokeAgent(row);
    } catch (e) {
      return {
        smoke: "regression",
        reason: `invocation error on email_id=${row.email_id}: ${(e as Error).message}`,
      };
    }
    const newTop = out.ranked[0]?.intent ?? "(no-top)";
    const same = newTop === row.baseline_top_intent;
    if (!same) changed += 1;
    const line = `  ${row.email_id} ${row.baseline_top_intent} -> ${newTop} (${same ? "SAME" : "CHANGED"})`;
    diffs.push(line);
    console.log(line);
  }

  console.log(`  changed_count=${changed} / ${baseline.length}`);
  if (changed > 1) {
    return {
      smoke: "regression",
      reason: `changed_count=${changed} (>1) — disambiguation regression budget exceeded. Diffs:\n${diffs.join("\n")}`,
    };
  }
  console.log(`  PASS: changed_count=${changed} within budget (<=1)`);
  return null;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const wantNovel = args.length === 0 || args.includes("--smoke-novel");
  const wantClean = args.length === 0 || args.includes("--smoke-clean");
  const wantRegression = args.length === 0 || args.includes("--regression");

  const failures: SmokeFailure[] = [];

  if (wantNovel) {
    const f = await smokeNovel();
    if (f) failures.push(f);
  }
  if (wantClean) {
    const f = await smokeClean();
    if (f) failures.push(f);
  }
  if (wantRegression) {
    const f = await smokeRegression();
    if (f) failures.push(f);
  }

  console.log("\n## SUMMARY");
  if (failures.length === 0) {
    if (args.length === 0) {
      console.log("ALL 3 SMOKES GREEN");
    } else {
      console.log(`SMOKE(S) GREEN: ${args.join(" ")}`);
    }
    return 0;
  }

  console.error(`FAILURES (${failures.length}):`);
  for (const f of failures) {
    console.error(`  - [${f.smoke}] ${f.reason}`);
  }
  return 1;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("UNCAUGHT", (e as Error).stack ?? e);
    process.exit(1);
  },
);
