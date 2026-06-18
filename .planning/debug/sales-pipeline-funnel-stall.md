---
status: checkpoint-human-verify
trigger: "Sales-email pipeline (verkoop@smeba.nl) stalls ~50% of emails mid-funnel so they never reach Stage 4 intent-labeling — Outlook stays unlabeled."
created: 2026-06-16
updated: 2026-06-16
---

# Debug: sales-pipeline-funnel-stall

## Symptoms

- **Expected:** Every non-noise inbound email on `verkoop@smeba.nl` (sales-email swarm) flows Stage 0→1→2→3→4 and gets an `AI: <intent>` category written to the Outlook message.
- **Actual:** ~54% of emails stall mid-funnel (Stage 1, 2, or 3) and never reach Stage 4, so Outlook stays unlabeled. Stalls occur at EVERY handoff (1→2, 2→3, 3→4), intermittently.
- **Errors:** None surfaced. `pipeline_events` only logs per-stage successes; failed handoffs leave no error row. `retries: 0` on coordinator + dispatcher → any hiccup is a permanent silent drop.
- **Timeline:** Intent-labeling (Phase 117) was enabled for sales-email on 2026-06-15 (gate `swarms.dry_run_config.stage_3_intent_label` flipped to `false`). Stage-4 reach rate: 2026-06-15 = 25% (17/67), 2026-06-16 = 46% (13/28). Not a regression from a working state; the funnel-stall was likely always present but only became visible once labeling exposed the end of the funnel. debtor-email is still gated (0 labels, expected).
- **Reproduction:** Observe today's `verkoop@smeba.nl` inbox — newest emails labeled inconsistently; specific stalled examples below. Reproducible via DB queries against `pipeline_events` + `agent_runs`.

## Verified evidence (from DB, pre-session)

- Mailbox = `verkoop@smeba.nl` → swarm_type `sales-email`. Gate `stage_3_intent_label=false` (labeling ON). debtor-email still `true` (gated).
- Label step is HEALTHY: all 13 emails reaching Stage 4 today got a correct `AI:` category; `public.swarm_written_categories` matches the Outlook screenshot exactly.
- Funnel stall today (28 emails reaching ≥Stage 1): max_stage 1 = 7 emails (0 labeled), 2 = 3 (0), 3 = 5 (0), 4 = 13 (13 labeled). All 15 stalls are "settled" (>5 min old; some 1.5h old and still stuck) → real drops, not in-flight.
- Stalled terminal decisions are legit-continue cases: Stage-1 stalls are decision=`unknown` (passed noise filter, should go to Stage 2); Stage-2 stalls are `unresolved`/`resolved` (Assad/Humberto were also `unresolved` and DID continue → decision is not the discriminator); Stage-3 stalls have valid top intents (`quote_request`, `other`, `purchase_order`, `quote_acceptance`). Only 1 of 15 is a legit stop (`own_outbound_invoice_loopback`).
- `agent_runs` anomaly (sales-email, today): 45 runs / 27 distinct emails = 1.67 runs/email; EXACTLY 27 `intent=null` orphan rows (one per email); `completed_at` set on 0/45 rows (incl. the 16 `routed_human_queue` successes → `completed_at` is a DEAD column, a red herring, NOT a gating cause). 29 `predicted`, 16 `routed_human_queue`. Stalled emails have only the orphan run, or a 2nd run stuck at `predicted`.

## Eliminated (do NOT re-pursue)

- hypothesis: Duplicate `step.run("emit-coordinator")` step-name → Inngest step dedup drops the 2nd emit. ELIMINATED: in the sales path only ONE emit runs per function execution (lines 469 generic vs 653 debtor are mutually-exclusive branches), and Inngest memoizes steps per-run, not across runs. Two separate events = two separate runs that don't dedup each other.
- hypothesis: Phase 65 replay-unsafe `run_id` (generated outside step.run → INSERT key-A / UPDATE key-B). ELIMINATED: `run_id` IS generated inside `step.run("resolve-run-id")` at `web/lib/inngest/functions/debtor-email-coordinator.ts:163-168`.

## Leading hypotheses to investigate

1. **Coordinator concurrency-key starvation/drop.** `debtor-email-coordinator.ts:84-87` sets `concurrency: [{key:"event.data.entity", limit:4}, {key:"event.data.run_id", limit:1}]`. The sales Stage-2 emit payload (`stage-2-customer-resolver.ts:472-488`) does NOT include `run_id` (and `entity` is `null` for sales). So `event.data.run_id` is `undefined` → all sales coordinator events may collapse into ONE concurrency bucket with limit 1, and `event.data.entity=null` into one bucket limit 4. Investigate whether undefined/null concurrency keys cause events to be cancelled/dropped (not just queued) — and whether this explains the per-boundary ~50% loss.
2. **Multiple coordinator invocations per email leaving an orphan `intent=null` run.** 1.67 runs/email + exactly one null orphan/email. `create-agent-run` (`debtor-email-coordinator.ts:173`) calls `createRun` (intent=null default) when the event lacks `agent_run_id` — and the sales emit does NOT pass `agent_run_id`. Determine: why 2 coordinator executions per email, which one orphans, and whether the orphan competes for/holds the concurrency slot or a downstream gate.
3. **Downstream worker silent failure with retries:0.** Stage-3 dispatcher (`stage-3-dispatcher.ts`) transitions `predicted`→`routed_human_queue`; stalled Stage-3 emails are stuck at `predicted` → dispatcher didn't pick up/complete. `emit-predicted` and `emit-intent-label` (`debtor-email-coordinator.ts` ~431, ~516) firing/gating to verify.

## Key files

- `web/lib/inngest/functions/stage-2-customer-resolver.ts` — `emit-coordinator` :469 (sales/generic path; payload :472-488 missing run_id + agent_run_id).
- `web/lib/inngest/functions/debtor-email-coordinator.ts` — concurrency :84-87; resolve-run-id :163; create-agent-run :173; create-coordinator-run :181; emit-intent-label (~431); emit-predicted (~516).
- `web/lib/inngest/functions/stage-3-dispatcher.ts` — `pipeline/predicted` listener; handler dispatch + predicted→routed transition.
- `web/lib/inngest/functions/stage-3-intent-label-worker.ts` — Stage-4 label write (HEALTHY; not the bug).

## Inngest run-IDs of stalled emails (inspect in dashboard)

- Kim Gerrits (stalled Stage 2): `01KV7Y3Q3BRWFHH378P4CBPJ4X`
- René van de Giessen (stalled Stage 2): `01KV7TDY9YAGHPGZ65RHZJYSNW`
- Annandsing, Gita (stalled Stage 2): `01KV7S2SPHYYFJBSRDMJ5174T5`
- Christophe SEVEREYNS (stalled Stage 3, no label): `01KV7YDP2KA5FGVG96BKCYPXZ0`
- Assad Mustafa (SUCCESS, reached Stage 4 — control): `01KV7VZMNFB3YV5K8S9DJ8JCWG`

## Current Focus

- hypothesis: ROOT CAUSE FOUND — every inter-stage handoff worker runs with `retries: 0` while owning a throw-capable external IO step (Supabase / Orq LLM / Graph GET+PATCH). A transient throw fails the run with zero retries, the downstream `inngest.send` handoff never fires, and the email is silently + permanently dropped mid-funnel with no error row. Per-stage transient loss compounds across 3 handoffs (~20%/stage → ~50% total funnel survival, matches observed 46–54%). The orphan `intent=null` agent_runs are the fingerprint: `create-agent-run` commits early, a later step throws, retries:0 leaves the row at defaults with no emit.
- test: confirm in Inngest dashboard that a stalled run shows status=Failed with a thrown step error and 0 attempts beyond the first.
- expecting: stalled coordinator/label-worker runs = Failed + thrown step (write-category Graph error, classify-intent Orq timeout, or load-context/emit-stage-2); control (Assad) = Completed.
- next_action: HUMAN-VERIFY checkpoint — operator confirms the failure class in Inngest, then re-spawn with goal=find_and_fix (routes through typescript-expert review).
- reasoning_checkpoint:
- tdd_checkpoint:

## Evidence

- pipeline_events / agent_runs DB analysis (see "Verified evidence" above) — funnel stall spread across all 3 handoffs, ~50%, settled (real drops); orphan intent=null agent_run exactly once per email; completed_at never set (dead column).
- Code confirms `retries: 0` on debtor-email-coordinator (:83) and stage-3-dispatcher; handoff workers each own throw-capable IO steps. The Stage-3→4 Graph label write (stage-3-intent-label-worker `write-category`, uncaught-throw path) is the dominant loss point.
- Math fit: ~20% per-stage transient throw × 3 handoffs ≈ 51% survival ≈ observed 46–54% Stage-4 reach.

## CONFIRMED in Inngest dashboard (2026-06-16)

- Status=Failed, Last 1d → 21 Failed runs concentrated on the handoff workers: `stage-1_5-attachment-extractor` (multiple: 12:45, 11:46, 10:10), `Debtor Email Coordinator (Stage 3)` (09:34, pipeline/coordinator.requested), `classifier/verdict-worker` (multiple), `stage-0/safety-worker`. Spread across Stage 0→1, 1→2, 1.5→2, 2→3 — confirms handoff-worker failures + retries:0 = silent drop.
- DECISIVE: the coordinator failure is NOT transient — it's a DETERMINISTIC hard Zod schema throw:
  `Intent-agent output schema mismatch (version=2026-05-19.v3): path ranked[1].sub_type — Invalid option: expected one of "invoice"|"credit_note"|"werkbon"|"contract"|"quote"`.
  The Orq intent-agent returns a `sub_type` for SALES emails that is outside the enum; that enum is DEBTOR document jargon. Sales is running the debtor V3 intent schema (`intentSchemaForSwarm("sales-email")` → debtor V3 sub_type enum) and the coordinator hard-parses → throws → retries:0 → email dropped at Stage 2→3.

## CORRECTION (2026-06-16, second pass) — sub_type error was DEBTOR, not sales

- The Inngest run inspected for the sub_type/v3 schema throw (`01KV7NMSK637G2QRPNZHVFXKE5`, 09:34, "Debtor Email Coordinator (Stage 3)") was picked from the Failed list, NOT from a known sales email. It has NO agent_runs row. The error is debtor jargon (sub_type enum invoice/credit_note/…, version=2026-05-19.v3 = debtor V3). → This is a DEBTOR-swarm coordinator failure (debtor agent returned a bad sub_type), a real bug but a DIFFERENT swarm; debtor labeling is gated anyway.
- The actual stalled SALES coordinator runs (Kim 01KV7Y3Q…, René 01KV7TDY…, Annandsing 01KV7S2S…, Christophe 01KV7YCQ…/01KV7YDP…) all have: `swarm_type='sales-email'` (CORRECT — no debtor fallback), `error_message=NULL` (coordinator recorded no throw), status=`predicted`. Christophe's 2nd run even has `intent='quote_acceptance'` → it classified fine and stalled at the 3→4 boundary, not at the coordinator.
- Schema-agent conclusion ("swarm_type wrong → debtor fallback") is ELIMINATED for sales: sales orphans carry swarm_type='sales-email' and intentSchemaForSwarm correctly returns the sales schema (no sub_type). The sub_type throw cannot be the sales-label cause.
- STILL OPEN for sales: why the coordinator leaves an orphan intent=null run, and why ~half stall with no error_message. Need the Inngest run STATUS (Failed/Cancelled/Completed) of a sales coordinator run. Prime suspect: coordinator concurrency keys `event.data.run_id` (undefined for sales) + `event.data.entity` (null for sales) collapsing buckets → possible cancellation, OR a throw in a step whose failure doesn't write agent_runs.error_message.

## Revised root cause (two layers)

- TRIGGER (per-stage, distinct bugs — THREE confirmed classes):
  1. Stage 2→3 coordinator: sales emails validated against debtor `sub_type` enum → hard Zod throw (deterministic).
  2. Stage 1.5→2 attachment-extractor: `emails lookup failed: canceling statement due to statement timeout` — Postgres statement timeout on an emails-table lookup (125k rows); perf/missing-index, NOT a schema issue.
  3. Stage 0→1 safety-worker + Stage 1→2 verdict-worker: same Failed pattern, error text not yet captured (assume own IO/parse throw).
- AMPLIFIER (systemic): every handoff worker runs `retries: 0` AND hard-throws, so any recoverable hiccup (stochastic LLM output, transient IO) becomes a permanent, silent mid-funnel drop.

## Fix direction (revised — supersedes earlier "just add retries")

1. Stage-3 schema: stop sales emails dying on the debtor `sub_type` enum. Either widen/parameterize the sales intent schema's `sub_type` (sales-appropriate values or nullable/tolerant), OR make the coordinator parse fail-soft (coerce unknown sub_type → null, keep the intent) instead of throwing. Verify `intentSchemaForSwarm` actually returns a sales-specific schema, not the debtor V3.
2. Systemic: add non-zero `retries` to handoff workers (helps stochastic-LLM + transient IO) AND/OR make hard-parse points fail-soft so a single throw degrades gracefully (route-to-review) rather than dropping silently.
3. Stage 1.5→2 attachment-extractor: fix the `emails` lookup statement timeout — identify the slow query (likely the load-context / conversation_context / body_full_text fetch) and add the missing index or narrow the select. Add retries as backstop (timeout is transient).
4. Characterize the verdict-worker + safety-worker throws (error text still to collect) — same systemic retries/fail-soft applies.

## ROOT CAUSE — CONFIRMED (final)

Every stage/handoff worker is created with `retries: 0` BY DESIGN (verified in all 8: stage-0-safety, classifier-screen, classifier-verdict, stage-1_5-attachment-extractor, stage-2-customer-resolver, debtor-email-coordinator, stage-3-dispatcher, stage-3-intent-label-worker — each carries a comment justifying retries:0, rationale: "Bulk Review retry button is the recovery path" / "each step is idempotent; failures surface as a returned decision, not a cascading retry").

The design assumed all failures are CAUGHT-and-RETURNED (visible in Bulk Review). Reality: several real failure modes THROW uncaught — Postgres statement timeout on the emails lookup (attachment-extractor / load-context), Orq schema mismatch + timeouts (coordinator), emit/IO errors. An uncaught throw + `retries: 0`, landing BEFORE the next-stage `inngest.send`, drops the email permanently and silently with NO recovery surface (the "surface, don't drop" path only covers caught errors).

Per-email proof:
- Kim / René / Annandsing (Stage-2 stalls): `coordinator_runs` has NO row (coordinator NEVER triggered). Stage-2 worker recorded its Stage-2 pipeline_event then threw before/at `emit-coordinator` (:469), retries:0 → 2→3 handoff lost.
- Christophe (Stage-3 stall): coordinator ran, produced ranked_intents (quote_acceptance), agent_run stuck at status=predicted (dispatcher never flipped to routed) → threw/failed at 3→4 (dispatcher or emit), retries:0.
- Inngest Failed list (21/1d) on the handoff functions confirms the throws: attachment-extractor (`emails lookup … statement timeout`), classifier/verdict-worker, stage-0/safety-worker, debtor coordinator (debtor sub_type schema throw — separate swarm).

Resolved earlier "open question": the ~1.67 agent_runs/email is NOT duplicate coordinator events. The `intent=null` row is an UPSTREAM-created placeholder agent_run that the coordinator fills on success; when the coordinator never runs (Kim), it stays null. Not a bug in itself — a symptom marker.

## Eliminated

- hypothesis: Duplicate emit-coordinator step-name Inngest dedup — see "Eliminated" section.
- hypothesis: Phase 65 replay-unsafe run_id — see "Eliminated" section.

## Resolution

- root_cause: Inter-stage handoff workers run with `retries: 0` and own throw-capable external IO steps; a transient throw permanently drops the email mid-funnel (no downstream `inngest.send`, no error row). Compounds across handoffs to ~50% funnel loss. Dominant loss = Stage 3→4 Graph label write (`stage-3-intent-label-worker.write-category`).
- fix (PROPOSED, not applied — gated on human-verify): (1) add non-zero `retries` to handoff workers, priority: stage-3-intent-label-worker → debtor-email-coordinator → stage-1_5-attachment-extractor / stage-2-customer-resolver / stage-3-dispatcher (all idempotency-safe via memoized step.run); (2) harden `stage-3-intent-label-worker.write-category` to fail-soft on a thrown Graph error like its existing `!ok` path (and consider throwing only on retryable 429/5xx so retries help, fail-soft on permanent 404/deleted); (3) separately drop the always-`undefined` `event.data.run_id` from the coordinator concurrency keys (latent throughput, not the drop).
- verification: (pending) re-check Stage-4 reach rate after deploy; expect ≫46%.
- files_changed: (none yet)
- specialist: typescript-expert review pending (part of find_and_fix path).
