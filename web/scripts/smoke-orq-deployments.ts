/**
 * Phase 999.5 Wave 0 — Live Orq Deployments smoke.
 *
 * Surfaces (does NOT lock) the per-call cost field on POST /v2/deployments/invoke.
 * Task 3 of the plan (human-verify checkpoint) reads this script's stdout and
 * picks the JSON path that becomes InvokeResult.cost_cents in Wave 1.
 *
 * Critical [ASSUMED] under test:
 *   A1. Response body contains a parseable per-call cost field.
 *   A3 (early signal). Latency < 5s end-to-end with Bedrock EU Haiku 4.5 + no Studio queue.
 *
 * Run (one per deployment):
 *   cd web && ORQ_API_KEY=$(grep '^ORQ_API_KEY=' .env.local | cut -d= -f2- | tr -d '"') \
 *     DEPLOYMENT_KEY=stage-0-safety-classifier npx tsx scripts/smoke-orq-deployments.ts
 *   cd web && ORQ_API_KEY=$(grep '^ORQ_API_KEY=' .env.local | cut -d= -f2- | tr -d '"') \
 *     DEPLOYMENT_KEY=stage-1-category-classifier npx tsx scripts/smoke-orq-deployments.ts
 *
 * Exit codes:
 *   0 — HTTP 2xx; full response body printed; cost-field candidates surfaced.
 *   1 — env missing, fetch error, or non-2xx response.
 *
 * Per Pitfall 7: stream:false is sent EXPLICITLY.
 * Per Pitfall 1: cost field path is NOT hard-coded — recursive grep surfaces candidates.
 */

const ORQ_API_KEY = process.env.ORQ_API_KEY;
if (!ORQ_API_KEY) {
  console.error("ORQ_API_KEY is not set in environment");
  process.exit(1);
}

const DEPLOYMENT_KEY = process.env.DEPLOYMENT_KEY ?? "stage-0-safety-classifier";
const DEPLOYMENTS_URL = "https://api.orq.ai/v2/deployments/invoke";

type CanaryInputs = Record<string, unknown>;

function inputsFor(deploymentKey: string): CanaryInputs {
  if (deploymentKey === "stage-0-safety-classifier") {
    return {
      email_id: "smoke-001",
      email_subject: "Hi",
      email_body: "Hello, this is a benign test email.",
    };
  }
  if (deploymentKey === "stage-1-category-classifier") {
    return {
      subject: "Hi",
      body_text: "Hello",
      categories: [
        { category_key: "auto_reply", display_label: "Auto reply" },
        { category_key: "ooo", display_label: "Out of office" },
      ],
    };
  }
  // Unknown deployment_key — pass a generic envelope so the script still runs.
  return {
    smoke: true,
    note: "generic canary payload — deployment_key not recognized by smoke script",
  };
}

/**
 * Walk an arbitrary JSON value and emit every (path, value) pair where either
 * the leaf path segment OR a string value matches /cost|price|billing/i.
 */
function findCostCandidates(
  value: unknown,
  path: string,
  out: Array<{ path: string; value: unknown }>,
): void {
  if (value === null || value === undefined) return;
  if (typeof value !== "object") {
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, i) => findCostCandidates(item, `${path}[${i}]`, out));
    return;
  }
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    const childPath = path === "" ? k : `${path}.${k}`;
    if (/cost|price|billing/i.test(k)) {
      out.push({ path: childPath, value: v });
    }
    findCostCandidates(v, childPath, out);
  }
}

async function main(): Promise<number> {
  const inputs = inputsFor(DEPLOYMENT_KEY);

  console.log(`## Deployment under test`);
  console.log(`DEPLOYMENT_KEY: ${DEPLOYMENT_KEY}`);
  console.log(`URL: ${DEPLOYMENTS_URL}`);
  console.log(`## Canary inputs`);
  console.log(JSON.stringify(inputs, null, 2));

  const t_start = Date.now();
  const request_sent_at = Date.now();
  let res: Response;
  try {
    res = await fetch(DEPLOYMENTS_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${ORQ_API_KEY}`,
      },
      body: JSON.stringify({
        key: DEPLOYMENT_KEY,
        inputs,
        stream: false,
      }),
    });
  } catch (e) {
    console.error("FETCH_ERROR", (e as Error).message);
    return 1;
  }
  const response_received_at = Date.now();
  const latency_ms = response_received_at - request_sent_at;
  const total_ms = response_received_at - t_start;

  const bodyText = await res.text();

  console.log(`## HTTP`);
  console.log(`HTTP_STATUS: ${res.status}`);
  console.log(`LATENCY_MS: ${latency_ms}`);
  console.log(`TOTAL_MS: ${total_ms}`);

  if (!res.ok) {
    console.error("FAIL: non-2xx response");
    console.error("RAW_BODY_TRUNC_2000", bodyText.slice(0, 2000));
    return 1;
  }

  let json: unknown;
  try {
    json = JSON.parse(bodyText);
  } catch (e) {
    console.error("OUTER_JSON_PARSE_FAIL", (e as Error).message);
    console.error("RAW_BODY_TRUNC_2000", bodyText.slice(0, 2000));
    return 1;
  }

  const obj = json as Record<string, unknown>;

  console.log(`## Top-level keys`);
  console.log(JSON.stringify(Object.keys(obj).sort()));

  console.log(`## Recursive cost-field grep`);
  const candidates: Array<{ path: string; value: unknown }> = [];
  findCostCandidates(obj, "", candidates);
  if (candidates.length === 0) {
    console.log("(no keys matching /cost|price|billing/i found in response)");
  } else {
    for (const c of candidates) {
      console.log(`${c.path} = ${JSON.stringify(c.value)}`);
    }
  }

  console.log(`## choices[0].message.content`);
  const choices = obj.choices as
    | Array<{ message?: { content?: string | null } }>
    | undefined;
  const content = choices?.[0]?.message?.content ?? null;
  console.log(`raw: ${typeof content === "string" ? content : JSON.stringify(content)}`);
  if (typeof content === "string") {
    try {
      const parsed = JSON.parse(content);
      console.log(`parsed: ${JSON.stringify(parsed)}`);
    } catch (e) {
      console.log(`parsed: <JSON.parse failed: ${(e as Error).message}>`);
    }
  }

  console.log(`## usage`);
  console.log(JSON.stringify(obj.usage ?? null, null, 2));

  console.log(`## telemetry`);
  console.log(JSON.stringify(obj.telemetry ?? null, null, 2));

  console.log(`## providerResponse (truncated 2000 chars)`);
  console.log(JSON.stringify(obj.providerResponse ?? null, null, 2).slice(0, 2000));

  console.log(`## Full response (truncated 4000 chars)`);
  console.log(JSON.stringify(obj, null, 2).slice(0, 4000));

  return 0;
}

main().then(
  (code) => process.exit(code),
  (e) => {
    console.error("UNCAUGHT", (e as Error).stack ?? e);
    process.exit(1);
  },
);
