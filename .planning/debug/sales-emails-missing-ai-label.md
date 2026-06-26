---
slug: sales-emails-missing-ai-label
status: fix-applied
trigger: "verkoop@smeba.nl shows emails without an AI: label; user suspects a recent merge/main broke it"
created: 2026-06-26
updated: 2026-06-26
---

# Sales (and debtor) emails missing AI: label — Stage 3 Orq timeout

## Current Focus
- ROOT CAUSE (external, transport-specific): the **legacy queue-backed Agents endpoint** `POST /v2/agents/{key}/responses` is STALLED on Orq's side (hangs >180s, no return). Stage-3 `invoke-intent.ts` (debtor+sales) calls this endpoint → 45s client abort → `ranked_intents: []` → no label. The **queue-free Router** (`/v2/router/chat/completions`, `/v3/router/responses`) is HEALTHY (0.9–2.7s, incl. json_schema) — Orq's own docs say `/v3/router/responses` w/ `model:"agent/{key}"` is THE documented way to run an agent. NOT the merge, NOT ingest, NOT the model.
- Why the user sees traces: the working traffic is the queue-free Router path (`responses.aws`/`chat.anthropic` = model-named, not agent-named → looks "standalone, untraceable"). The stalled agents-queue produces no/failed traces.
- Fix already half-built: `web/lib/automations/orq-agents/client.ts` has `invokeViaRouter` + `orq_agents.use_router` (queue-free Router replay). But Stage-3 intent uses `invoke-intent.ts`, which has NO such switch — hardcoded to the stalled endpoint.
- FIX APPLIED (branch `fix/orq-queuefree-responses`): new chokepoint `web/lib/automations/orq-responses.ts` (the single place the Orq API version lives — bump for /v4) routes both Stage-3 invoke wrappers (`debtor-email/.../invoke-intent.ts`, `sales-email/.../invoke-intent.ts`) through `/v3/router/responses` with `model:"agent/<key>"`. Studio prompt+response_format applied server-side → byte-equivalent output; existing Zod gate/fail-soft/usage unchanged. 196 tests green.
- next_action: (a) merge + deploy; (b) replay the 14 stuck emails once live; (c) report the queue stall to Orq; (d) FOLLOW-UP centralization — migrate the remaining legacy `/v2/agents/{key}/responses` callers onto the chokepoint: `llm-tiebreaker.ts`, `classifier-screen-worker.ts`, `v7/briefing/generate.ts`, `agent-namer/.../generate.ts` (orq-agents/client.ts already has a queue-free `use_router` path).

## Endpoint isolation (raw curl, prod ORQ_API_KEY, no pipeline code)
- `POST /v2/agents/{debtor-intent-agent|sales-intent-agent|stage-1-category-classifier}/responses` → HTTP 000, hangs to 90/180s, no trace. Full *correct* payload (real body + all variables, mirroring invoke-intent.ts) ALSO hangs → ingest/empty-body NOT the trigger.
- `POST /v2/router/chat/completions` (same Bedrock Haiku model) → **HTTP 200 in 0.88s**. Model + account + key all fine.
- `GET /v2/agents` → 0.14s. API fine.
- ⇒ The failure is isolated to the Agents `/responses` endpoint. Orq-platform/account incident, surfaced overnight (last good agent trace 25/06 17:36; first pipeline timeout 26/06 03:52). The pipeline calls this exact endpoint (`web/lib/automations/*/coordinator/invoke-intent.ts`).
- Resilience gaps exposed: agents have `fallbacks: None`; the client has no fallback off the Agents endpoint → one Orq endpoint outage silently kills all Stage-3 labeling (and now threatens Stage 1, which hangs on the same endpoint in testing).

## Decisive evidence (Orq Traces, 2026-06-26)
- `sales-intent-agent` Traces: 613 runs/14d, ALL success ~1.7–3.2s, but the LAST trace is **25/06 17:36:55** — ZERO invocations today. Our requests never reach the agent.
- Raw curl repro with the PROD ORQ_API_KEY (independent of our code): `POST /v2/agents/{debtor,sales}-intent-agent/responses` hangs — blocking AND non-blocking — HTTP 000 at 60s/180s, no response, no trace.
- Orq API itself is healthy: `GET /v2/agents` = 0.23s; other agents' `responses.aws` model spans succeed ~1–2s today. → not a global Orq outage, not the model.
- Agents use DIFFERENT model+provider yet both hang: debtor=`anthropic/claude-sonnet-4-5` (Anthropic-direct, agent unedited since 05-21); sales=`aws/eu…claude-haiku-4-5` (Bedrock EU, agent edited TODAY 07:07Z — AFTER the 03:52Z break, i.e. an attempted fix not the cause). Both agents have `fallbacks: None` (resilience gap).

## Symptom
Screenshot of verkoop@smeba.nl shows 2 emails today with no AI: chip:
1. "Dagelijks overzicht PIT" (no-reply@rbm-it.nl) — **noise digest, filtered at Stage 1, no label BY DESIGN** (not a bug; no coordinator_run exists).
2. "FW: Offerte SB018642 …" (marcel.jansen2@ingka.com) — real quote, SHOULD be labeled, isn't.

## Evidence
- Offerte (email_id e6fe8f4a…): Stage 1 correctly gated it to `unknown` (= not noise, pass-through). Its coordinator_run has `ranked_intents: []`, `completed_handlers: 0`. Its automation_run (f10e040d…) `status=failed`, `error_message="The operation was aborted due to timeout"` (= the 45s `AbortSignal.timeout` in `invoke-intent.ts`).
- Timeline: every sales-email Stage-3 run 06-25 (13:21→15:36) had real ranked intents → labels. From 06-26 03:52 onward, 100% empty.
- Cross-swarm: debtor-email AND sales-email both flipped 100% nonempty (06-25) → 100% empty (06-26). Shared coordinator `debtor-email-coordinator.ts` runs both, keyed by swarm_type. info-routing was empty both days (router shape, unrelated).
- All 11 failed automation_runs on 06-26 = `aborted due to timeout` (9 sales + 2 debtor = the 11 empty Stage-3 runs). 0 failures on 06-25.
- Registry intact: swarm_intents populated (13 sales / 9 debtor), swarms.enabled=true. Stages 0/1/2 fine; only the Stage-3 Orq LLM call fails.
- Merge exoneration: the local commits 68bbf18c / 14f11577 are NOT on origin/main (not deployed). origin/main HEAD (5c1bf685, 06:30 CEST) merged AFTER the first failure (05:52 CEST). The overnight force-deploy 33ed966b (16:48 UTC 06-25) pushed stale code live, but its changes were info-routing + test fixes + email_id/body-source tweaks — none of which make the Orq LLM itself slower. A uniform 45s timeout across two separate agents is an Orq/provider latency signature, not a code bug.

## Eliminated
- hypothesis: info-routing merge broke the sales swarm → NO. Failure is an Orq LLM timeout; the deployed changes don't touch the Stage-3 model/latency. Both debtor + sales fail identically.
- hypothesis: swarm_intents registry wiped by the "stop seeding dup master categories" commit → NO. Registry is intact and that commit isn't even deployed.
- hypothesis: payload bloat from 132.1 body-source change → unlikely. assembleInput caps input at 8000 chars.

## Could not verify directly
- Prod Orq latency: local ORQ_API_KEY in web/.env.local is expired (401). Prod's error is `timeout` (not 401/schema), so prod's key works; the call hangs. Needs an Orq Studio / status check.

## Remediation
1. Check Orq.ai: status page + invoke debtor-intent-agent / sales-intent-agent in Studio; confirm the model wasn't swapped to a slow/deprecated ID overnight and the provider (Bedrock EU) is healthy.
2. Replay the 14 stuck emails (9 sales, 2 debtor, 3 info-routing) once Orq is healthy — `web/app/api/automations/pipeline/replay/route.ts`. They sit at agent_runs.status=classifying / coordinator ranked_intents=[].
3. Resilience follow-up (exposed, not the cause): a 45s Orq timeout fails the whole Stage-3 run and silently leaves the email unlabeled (only visible via automation_runs.error_message). Consider a fallback model / alert on Stage-3 timeout-rate.
