---
slug: debtor-st2-stranded-no-st3-label
status: root_cause_found
mode: diagnose_only
trigger: |
  DATA_START
  Live bug: new debtor-email mail is intermittently not getting labeled.
  Rows resolve at Stage 2 (customer resolver), the generic path emits the
  Stage-3 handoff (pipeline/coordinator.requested), but Stage 3 (coordinator)
  intermittently produces NO classification for a portion of the mail -> the
  row stays "resolved at st2, no st3, no label".

  CONFIRMED so far (operator localization):
  - usesGenericPath = resolutionConfig !== null && resolverPath !== null ->
    debtor uses the generic path (157 resolution_audit rows in 2h, last 07:49).
  - That path writes the audit AND emits pipeline/coordinator.requested.
  - So the emit DOES happen; the gap is at/after the Stage 3 coordinator.

  CRITICAL REFRAME (operator, this session):
  - The fix MUST be swarm-agnostic. verkoop@smeba.nl (SALES swarm) labels
    FINE through the same generic Stage 3 coordinator path. Only DEBTOR is
    stranding rows.
  - => A generic "coordinator drops events intermittently" race would hit
    sales too. It does not. So the prior event-drop hypothesis is suspect.
    Root cause more likely differs PER SWARM: debtor swarm_intents config,
    a swarm-scoped branch/filter in dispatch, debtor-only volume/concurrency,
    or a swarm filter that silently no-ops for debtor.
  DATA_END
created: 2026-06-23
updated: 2026-06-23
---

# Debug: debtor-st2-stranded-no-st3-label

## Symptoms

- New debtor mail intermittently never gets labeled.
- Rows: resolved at Stage 2, Stage-3 handoff emitted, but no Stage 3
  classification and no label for a portion of mail.
- SALES (verkoop@smeba.nl) through the same generic coordinator path: healthy.
- Asymmetry sales-OK / debtor-stranded is the highest-signal fact.

## Current Focus

- hypothesis: root cause is swarm-specific (debtor vs sales), NOT a generic
  coordinator event-drop. Candidates: (i) debtor swarm_intents registry gap so
  the coordinator classifies-to-nothing / no matching intent -> no dispatch,
  no label; (ii) a swarm-scoped branch/filter in the Stage 3
  coordinator-orchestrator / debtor-email-coordinator-worker that no-ops for
  debtor; (iii) debtor-only volume/concurrency exhausting retries:0 workers
  (cf. sales-funnel-stall memory: retries:0 + throw-capable IO -> silent drop);
  (iv) the coordinator runs but its output stage/label write is swarm-gated.
- test: (a) pull a sample of debtor message_ids stranded at st2-no-st3 in the
  last few hours from the pipeline tables; (b) for each, read full
  pipeline-events + agent_runs (did a coordinator run start? finish? what was
  tool_outputs?); (c) diff debtor vs sales config: swarm_intents rows,
  coordinator worker dispatch code, any `swarm`/`brand` filter; (d) check the
  coordinator worker for retries:0 + throwing IO.
- expecting: a swarm-scoped divergence — either a missing/empty debtor intent
  set, or a worker that silently no-ops/drops on a debtor-only condition.
- next_action: spawn gsd-debugger (diagnose-only) to run the queries + read the
  coordinator dispatch path, comparing debtor vs sales.

## Evidence

- timestamp: 2026-06-23
  checked: public.swarms.dry_run_config for debtor vs sales (live REST read).
  found: debtor stage_3_routing=false (OPEN), stage_3_intent_label=false (LIVE);
    sales stage_3_routing=false, stage_3_intent_label=false. SYMMETRIC.
  implication: ELIMINATES the routing-gate / labeling-gate hypotheses (gate
    config is identical between debtor and sales). The asymmetry is NOT a gate.

- timestamp: 2026-06-23
  checked: public.swarm_intents rows debtor vs sales.
  found: debtor has 9 intents (8 placeholder + invoice_copy_request registered);
    sales has 13 (all placeholder). Both well-populated, handler_event set.
  implication: ELIMINATES "debtor swarm_intents gap" — placeholder intents route
    fine to Kanban (routed_human_queue); confirmed by many healthy debtor rows.

- timestamp: 2026-06-23
  checked: agent_runs stuck in status='classifying' (intent=null) last 6h.
  found: DEBTOR = 9 stuck rows; SALES = 0 stuck rows. Healthy debtor rows reach
    routed_human_queue normally (payment_dispute, general_inquiry, other).
  implication: Quantifies the asymmetry. The strand = agent_runs stuck in
    'classifying', never flipped to 'predicted'. Sales structurally never strands.

- timestamp: 2026-06-23
  checked: full lifecycle of one stuck row (email 4e5edf9a, agent_run 0e632a3a).
  found: pipeline_events st0 safe, st1 unknown, st2 UNRESOLVED (entity→'smeba'
    default). coordinator_runs row created (run c2f46c3a) with ranked_intents=[],
    decision_details=null, completed_at=08:13:17 (catch/mark-failed path). NO
    stage-3 pipeline_event. agent_runs.tool_outputs={}, intent=null. => the
    classify-intent step (3) threw; persist-ranked/flip/emit never ran.
  implication: coordinator STARTS, creates its rows, then throws inside
    classify-intent → catch → mark-failed → re-throw → retries:3 exhaust → onFailure.
    Row left in 'classifying'; no predicted-emit, no intent-label emit → no label.

- timestamp: 2026-06-23
  checked: pipeline_events stage=3 decision=worker_failed, last 24h, bucketed.
  found: 37 total — 27 "createRun: null email_id", 9 "sub_type schema mismatch",
    1 "other schema mismatch (document_reference too_big >64)".
  implication: TWO distinct failure modes. The 9 sub_type (+1 doc_ref) ARE this
    session's symptom. The 27 createRun-null are a SEPARATE bug (see below).

- timestamp: 2026-06-23
  checked: cross-ref all 9 stuck 'classifying' debtor email_ids ↔ failure type.
  found: 9/9 map to a debtor ranked-entry schema mismatch (8 sub_type enum,
    1 document_reference max-64). Exact error:
    `Intent-agent output schema mismatch (version=2026-05-19.v3):
     path ["ranked",0,"sub_type"] — expected one of
     invoice|credit_note|werkbon|contract|quote`.
  implication: 1:1 proof. The strand IS the debtor intent-agent returning a
    ranked-entry field value outside the debtor schema's closed constraints.

- timestamp: 2026-06-23
  checked: intent-schema-registry.ts + debtor/coordinator/types.ts +
    sales-email/coordinator/types.ts + invoke-intent.ts:259-268.
  found: debtor ranked entry = { intent, confidence, reasoning, sub_type:
    z.enum(SUB_TYPE).nullable(), document_reference: z.string().max(64)... }.
    SALES ranked entry = { intent, confidence, reasoning } — NO sub_type, NO
    document_reference. invoke-intent.ts does schema.safeParse(parsed) and
    THROWS unconditionally on !success (no fail-soft).
  implication: ROOT CAUSE + asymmetry mechanism proven. Sales is STRUCTURALLY
    immune (the failing fields don't exist in its schema). Debtor carries
    over-constrained debtor-only fields (sub_type closed enum, document_reference
    max-64) that the LLM intermittently violates → deterministic Zod throw →
    retries:3 replay same cached output → same throw → onFailure → strand.
    The code's own comment (debtor-email-coordinator.ts:90-93) predicted exactly
    this: "a DETERMINISTIC schema-mismatch throw will exhaust all retries and
    then surface via onFailure."

## Eliminated

- hypothesis: Generic coordinator event-drop race (the prior session theory).
  evidence: Failures are deterministic Zod throws recorded in pipeline_events
    (worker_failed), not silent drops; and sales (same coordinator/dispatcher)
    has 0 strands. Not a race.
  timestamp: 2026-06-23

- hypothesis: Debtor swarm_intents registry gap (H1).
  evidence: 9 well-formed debtor intents present; healthy debtor rows route to
    routed_human_queue via the same intents every minute.
  timestamp: 2026-06-23

- hypothesis: Swarm-scoped routing/labeling gate no-ops for debtor (H2/H4).
  evidence: debtor stage_3_routing=false + stage_3_intent_label=false (both
    LIVE/OPEN), identical to sales. Gate config is symmetric.
  timestamp: 2026-06-23

- hypothesis: retries:0 + throwing IO silently drops (H3, sales-funnel-stall
    pattern).
  evidence: coordinator runs retries:3 (raised from 0 on 2026-06-16) and the
    failures ARE surfaced (worker_failed pipeline_events + onFailure). The strand
    is a deterministic throw exhausting retries, not a retries:0 silent drop.
  timestamp: 2026-06-23

## Resolution

root_cause: |
  The debtor Stage-3 Intent Agent (Orq) intermittently returns a ranked-entry
  field value that violates the DEBTOR-SPECIFIC output schema — most often
  `ranked[0].sub_type` outside the closed enum
  (invoice|credit_note|werkbon|contract|quote), occasionally
  `ranked[0].document_reference` longer than 64 chars. invoke-intent.ts (line
  259-268) does `schema.safeParse(parsed)` and THROWS unconditionally on
  failure. The throw propagates out of the coordinator's classify-intent
  step.run; retries:3 replay the SAME cached LLM output → the SAME deterministic
  throw → catch/mark-failed → onFailure. The agent_runs row is left in
  status='classifying' (the flip to 'predicted' lives AFTER the throw point), so
  `pipeline/predicted` (Stage 3.5 dispatcher) and `pipeline/intent-label.requested`
  (the AI:-category writer) are never emitted → no Kanban routing and no label.

  WHY DEBTOR BUT NOT SALES: the two swarms use different Stage-3 output schemas
  (intent-schema-registry.ts). The sales ranked entry is { intent, confidence,
  reasoning } — it has NO sub_type and NO document_reference field, so the
  failing constraints literally cannot fire for sales. The debtor ranked entry
  carries those extra, over-constrained debtor-only fields. The asymmetry is the
  schema, not the pipeline plumbing (which is shared and swarm-agnostic).

fix: |
  NOT APPLIED (diagnose-only). Swarm-agnostic fix direction:
  Make the Stage-3 intent-agent parse FAIL-SOFT instead of hard-throw, uniformly
  for every swarm, at the single shared site (invoke-intent.ts safeParse / the
  coordinator's classify-intent step). On a schema mismatch, coerce the
  offending optional/secondary fields to a safe default rather than discarding
  the whole verdict:
    - sub_type: on out-of-enum value → null (the field is already .nullable()).
    - document_reference: on >64 chars → truncate to 64 (or null).
  This preserves the top-1 intent (which is the label-bearing field) so the row
  still flips classifying→predicted, emits pipeline/predicted + intent-label, and
  gets routed/labeled. Keep the raw LLM value in tool_outputs/telemetry for
  audit. The fix is swarm-agnostic by construction: it lives in the shared parse
  path and only relaxes the COERCION of secondary fields; sales (which lacks
  those fields) is byte-neutral. Optionally also loosen the debtor SUB_TYPE enum
  or widen document_reference, but fail-soft is the durable fix because the LLM
  will always occasionally go out-of-distribution.

  This matches the explicit open follow-up already flagged in
  debtor-email-coordinator.ts:90-93 ("fail-soft the intent-agent parse to a
  review lane rather than throw").

sweeper_assessment: |
  A st2-stranded sweeper that merely RE-RUNS the coordinator would be a NO-OP:
  the LLM output is cached (findCachedOutput on intent_version) and the parse is
  deterministic, so a replay hits the identical out-of-enum value and throws
  again — exactly what retries:3 already proved. A sweeper is therefore NOT a
  fix; at best it would need to (a) bust the cache AND (b) carry the fail-soft
  coercion, in which case the fail-soft parse alone already resolves it
  forward. A one-time BACKFILL to drain the existing 9 stranded rows is
  warranted (re-parse with coercion, or flip to a review lane), but a recurring
  sweeper is not — fix the parse and the strand stops at the source.

remaining_unknowns:
  - SEPARATE BUG (out of scope, flagged): 27/37 stage-3 failures in 24h are
    `createRun: null value in column "email_id"` — the coordinator is invoked
    with event.data.email_id=null (only a Graph message_id present). These fail
    at step 1 BEFORE any agent_runs row exists, so they are NOT "st2-resolved,
    stuck-classifying" strands — they are a distinct upstream emit-shape defect
    (a producer emitting pipeline/coordinator.requested without the canonical
    email_id). Worth a separate session. NOTE the local uncommitted changes on
    branch fix/sales-multi-brand-scope touch sales lookups/resolve-customer —
    not inspected here; if a shared producer helper started emitting null
    email_id, that is the likely link, but unconfirmed.
  - Not measured: how often the debtor agent goes out-of-enum (base rate) — only
    that it produced 9 strands in ~1h of this window. Prompt/model drift in the
    debtor intent agent could be raising the rate; not investigated.

files_involved:
  - web/lib/automations/debtor-email/coordinator/invoke-intent.ts:259-268 (the
    unconditional safeParse throw — the single fix site).
  - web/lib/automations/debtor-email/coordinator/types.ts:33-39,101,123
    (SUB_TYPE closed enum + document_reference max-64 on the debtor ranked entry).
  - web/lib/automations/sales-email/coordinator/types.ts:40-49 (sales ranked
    entry WITHOUT sub_type/document_reference — proves the structural immunity).
  - web/lib/automations/debtor-email/coordinator/intent-schema-registry.ts
    (the per-swarm schema map that makes the two schemas diverge).
  - web/lib/inngest/functions/debtor-email-coordinator.ts:90-93,217-353 (the
    classify-intent step.run whose throw strands the row; comment predicts it).
