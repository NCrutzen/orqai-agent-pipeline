// Phase 80 Plan 03 — coordinator refactored to a thin Stage 3 classifier.
//
// Per docs/agentic-pipeline/stage-3-coordinator.md and 80-CONTEXT.md
// `<decisions>` Classifier Refactor Boundaries, the classifier's locked
// 9-step responsibility list:
//   1. Resolve agent_run_id (caller-provided OR fresh).
//   2. Insert coordinator_runs row.
//   3. Invoke Intent Agent (cache-aware).
//   4. Write tool_outputs.intent_first_pass via mergeToolOutputs.
//   5. Hoist top-1 onto agent_runs back-compat columns.
//   6. Persist ranked_intents on coordinator_runs (+ pipeline_events TELE-01).
//   7. Flip agent_runs.status 'classifying' → 'predicted' (race-guarded).
//   8. Emit `<swarm_type>/predicted` for the cross-swarm Stage 3.5 dispatcher.
//   9. Return.
//
// Hard separation rule (Stage 1 vs Stage 3): this file ONLY consults Stage 3
// (intent classification). Stage 1 noise registries are never read here.
//
// Dispatch logic (escalation gate, swarm_intents lookup, handler_event emit,
// Kanban no_handler/low_confidence writes) MOVED to stage-3-dispatcher.ts in
// Phase 80 Plan 02. The dispatcher subscribes to `*/predicted` events.
//
// retries: 0 — Bulk Review retry button is the recovery path.
// concurrency: entity-key 4 + run_id-key 1.

import { inngest } from "@/lib/inngest/client";
import { recordWorkerFailure } from "@/lib/inngest/on-worker-failure";
import { createAdminClient } from "@/lib/supabase/admin";
import { invokeIntentAgent } from "@/lib/automations/debtor-email/coordinator/invoke-intent";
import { assembleInput } from "@/lib/automations/debtor-email/coordinator/assemble-input";
// Phase 113 Plan 02 (Q1 seam) — the per-swarm Stage 3 OUTPUT-schema lookup.
// This is the swarm-agnostic map that replaces a literal swarm branch: the
// coordinator names NO swarm — it looks the schema up by the derived
// swarm_type key. The sales schema is imported by THIS registry file, never
// by the coordinator, so the coordinator carries zero sales import/literal.
import { intentSchemaForSwarm } from "@/lib/automations/debtor-email/coordinator/intent-schema-registry";
import {
  loadSwarm,
  loadRoutingDestinations,
  resolveRoutingDestination,
} from "@/lib/swarms/registry";
// Phase 131 Plan 03 (ROUTE-04 / ROUTE-06) — the registry-gated Stage-3 ROUTING
// capability. Runs iff loadRoutingDestinations(swarm_type) returns rows
// (info-routing today; debtor/sales get [] → block skipped → byte-neutral).
// Invokes the per-swarm Orq agent (stage3AgentKey, e.g. 'info-routing-
// coordinator'), Zod-gates its output via parseAgentOutputOrUnrouted (invalid/
// empty → unrouted, never throws), resolves (bucket×brand)→target_mailbox from
// the registry, builds the 6-field verdict, and persists it to
// coordinator_runs.decision_details.routing + a TELE-01 pipeline_events
// dual-write. The no-forward guarantee (ROUTE-07) is FREE: info-routing is
// seeded stage_3_routing=true → the existing held path withholds the
// predicted-emit. NO swarm_type literal — purely registry-gated.
import { invokeOrqAgent } from "@/lib/automations/orq-agents/client";
import { parseAgentOutputOrUnrouted, unroutedFromError } from "@/lib/automations/info-routing/coordinator-schema";
import { buildRoutingVerdict } from "@/lib/automations/info-routing/verdict";
// Phase 132.1 Plan 01 Task 2 (D-01) — held-path routing-category stamp + 112.5
// baseline building blocks (all existing swarm-agnostic helpers, no literal).
import {
  mergeRoutingCategory,
  buildRoutingCategory,
} from "@/lib/outlook/routing-category";
import { recordWrittenCategory } from "@/lib/outlook/written-category-store";
import { graphFetch } from "@/lib/outlook/client";
// Phase 131 Plan 04 (ROUTE-05) — the two-layer duplicate-delivery guard. Runs
// after (bucket×brand)→target_mailbox resolution, inside step.run (the layer-b
// DB read must be replay-safe). Its { status, matched_layer } result feeds the
// verdict's optional dedup arg so Phase 132 honors already_addressed (no
// double-forward). Pure layer (a) To/CC + opportunistic layer (b) cross-mailbox
// id match for ingested targets only (graceful skip + coverage-gap log otherwise).
import {
  checkDuplicateDelivery,
  type DedupAdmin,
  type RoutingDedup,
} from "@/lib/automations/info-routing/dedup";
// Phase 113 Plan 05 (D-08 / D-09) — the swarm-agnostic Stage-3 ROUTING gate.
// Read BEFORE the predicted-emit; when gated, persist the verdict (already done
// by persist-ranked) but withhold flip-status-predicted + emit-predicted so the
// dispatcher never fires (routing held in dry-run observation). Registry-driven,
// fail-closed, NO swarm-name literal. Seeded debtor=open (live emit preserved) /
// sales=gated. The dispatcher (stage-3-dispatcher.ts) is NEVER edited — the hold
// is achieved by the coordinator withholding the emit, the classifier-owned seam.
// Phase 132 Plan 02 (FWD-01..FWD-07, D-03) — the per-bucket forward RELEASE gate.
// Read AFTER persist-routing-verdict to decide whether to emit the dedicated
// `pipeline/forward.requested` event that drives the swarm-agnostic Stage-4
// forward worker. INDEPENDENT of the stage_3_routing held gate below (RESEARCH
// A4 / Pitfall 5): stage_3_routing keeps the intent-dispatch path held
// permanently (info-routing has no swarm_intents → the dispatcher throws on
// empty ranked[]), while this forward emit drives ONLY the forward worker.
// Fail-closed (inverse polarity): a bucket is released ONLY on an explicit TRUE.
import {
  isStage3RoutingGated,
  isForwardBucketReleased,
} from "@/lib/pipeline-gating/dry-run-gate";
import {
  createRun,
  findCachedOutput,
  mergeToolOutputs,
  updateRun,
} from "@/lib/automations/debtor-email/coordinator/agent-runs";
import {
  INTENT_VERSION_V2,
  INTENT_VERSION_V3,
  type IntentAgentOutputV2,
  type IntentAgentOutputV3,
} from "@/lib/automations/debtor-email/coordinator/types";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";
import { emitPipelineEvent } from "@/lib/pipeline-events/emit";
import { numericConfidence } from "@/lib/pipeline-events/types";
import { TENANT_DOMAINS_BY_SWARM } from "@/lib/automations/debtor-email/coordinator/tenant-domains.generated";

// Phase 110 Plan 03 (SWARM-02) — the module-level swarm-type constant was
// retired. swarm_type now derives per-invocation from the event payload
// (event.data.swarm_type, with the event-name prefix as fallback), mirroring
// the already-generic stage-3-dispatcher.ts. This makes the coordinator the
// shared cross-swarm Stage 3 runner: 113's sales-intent-agent dispatches
// through it with zero further edits. Tenant domains + the
// `<swarm_type>/predicted` emit + coordinator_runs.swarm_type are all keyed
// off the derived value inside the handler body below.

// Phase 83 Plan 06 (D-09) — hard cap on the Stage 3 assembled input.
const STAGE_3_INPUT_CAP_CHARS = 8000;

// Stage 3 now emits the canonical typed `pipeline/predicted` event (a literal
// key in Events), so `inngest.send` is called directly — no dynamic-name cast
// needed. CLAUDE.md / Phase 65 dae6276: never alias inngest.send (loses
// `this`-binding); always call inngest.send(...) inline.

// Phase 132 Plan 02 — `pipeline/forward.requested` is NOT a typed Events key
// (it is consumed only by the Stage-4 forward worker), so the emit needs a
// dynamic-name cast. SendFn mirrors the pattern used by the override-handler /
// stage-3-dispatcher. NEVER alias inngest.send (Phase 65 dae6276) — the cast is
// applied INLINE at the call site so `this`-binding is preserved.
type SendFn = (p: { name: string; data: Record<string, unknown> }) => Promise<unknown>;

export const debtorEmailCoordinator = inngest.createFunction(
  {
    id: "automations/debtor-email-coordinator",
    name: "Debtor Email Coordinator (Stage 3)",
    // retries:3 (was 0) — handoff-resilience fix (2026-06-16). A transient
    // throw (Orq intent-agent timeout, load-context DB read, emit-predicted /
    // emit-intent-label send) left an orphan intent=null agent_run and never
    // advanced to Stage 3.5/4. run_id is generated inside
    // step.run("resolve-run-id") and coordinator_runs/agent_runs writes are
    // keyed on it, so retries replay safely. Terminal failures surface via
    // onFailure. NOTE: a DETERMINISTIC schema-mismatch throw (e.g. the debtor
    // intent-agent returning an out-of-enum sub_type) will exhaust all retries
    // and then surface via onFailure — see the open follow-up to fail-soft the
    // intent-agent parse to a review lane rather than throw.
    retries: 3,
    concurrency: [
      { key: "event.data.entity", limit: 4 },
      { key: "event.data.run_id", limit: 1 },
    ],
    onFailure: async ({ error, event }) => {
      await recordWorkerFailure({
        stage: 3,
        stageLabel: "debtor-email-coordinator",
        event,
        error,
      });
    },
  },
  // Phase 110 Plan 03 — wildcard trigger, mirroring stage-3-dispatcher.ts:51.
  // Fan-in from every swarm's Stage 2 producer (`<swarm>/coordinator.requested`).
  // Canonical cross-swarm fan-in. Inngest matches event names EXACTLY — the
  // former `*/coordinator.requested` glob never matched `<swarm>/coordinator.
  // requested`, so the coordinator silently received ZERO events (debtor + sales
  // Stage 3 dead since the glob shipped). Every ranked-intent swarm's Stage 2
  // producer now emits the single `pipeline/coordinator.requested` event with
  // `swarm_type` in the payload; a new swarm needs no change here.
  { event: "pipeline/coordinator.requested" },
  async ({ event, step }) => {
    // The canonical event carries the coordinator payload + a REQUIRED
    // swarm_type (the routing discriminator). No event-name fallback: the
    // shared event name ("pipeline/...") is no longer swarm-bearing.
    const email = event.data;
    const { email_id } = email;
    // swarm_type is authoritative from the payload (SWARM-02 — data-driven, not
    // a literal branch). Deterministic, safe to derive outside step.run.
    const swarm_type = email.swarm_type;
    // Phase 110 Plan 03 — tenant domains keyed by the DERIVED swarm_type, with
    // a fail-closed empty default (T-110-07): an unknown swarm_type yields an
    // empty domain list rather than throwing. Spread to a fresh mutable
    // string[] because the generated map value is `readonly` (`as const`) and
    // assembleInput expects string[].
    const TENANT_DOMAINS: string[] = [
      ...(TENANT_DOMAINS_BY_SWARM[
        swarm_type as keyof typeof TENANT_DOMAINS_BY_SWARM
      ] ?? []),
    ];
    // Phase 66: event shape widened entity to `string | null | undefined`
    // (the new coordinator.requested event is producer-agnostic). Coerce to
    // the strict ENTITY union here — the debtor producer (label-resolver)
    // reads entity from labeling_settings.entity which is the same union, and
    // a missing value defaults to "smeba" (debiteuren-mailbox baseline). Phase
    // 110 Plan 03: sales ingest writes entity:null — the `?? "smeba"` default
    // preserves debtor behavior; downstream consumers that don't need entity
    // (sales) simply ignore it. Widen the cast target to accept the union; the
    // debtor default is NOT dropped.
    const sender_domain = email.sender_domain ?? "";
    const supabase = createAdminClient();

    // Phase 132.1 Plan 01 Task 1 (D-fix) — resolve email_id from message_id when
    // absent (info-routing skips Stage 2 → email_id null → createRun NOT-NULL
    // crash). Generic `??` fallback inside step.run (replay-safe write key);
    // byte-neutral when email_id is present. NO swarm-name branch.
    const resolvedEmailId: string | null =
      email_id ??
      (await step.run("resolve-email-id", async () => {
        const messageId = email.message_id;
        if (!messageId) return null;
        const { data } = await supabase
          .from("emails")
          .select("id")
          .or(`source_id.eq.${messageId},internet_message_id.eq.${messageId}`)
          .maybeSingle();
        return (data as { id?: string } | null)?.id ?? null;
      }));
    if (!resolvedEmailId) {
      throw new Error(
        `coordinator: unresolved email_id for message_id=${email.message_id ?? "<none>"}`,
      );
    }
    const inngest_run_id = event.id ?? `local-${resolvedEmailId}`;

    // Multi-brand sales: debtor threads email.entity from labeling_settings;
    // sales ingest writes entity=null, so fall back to the swarm's per-mailbox
    // entity map (resolution_config.scope.entity_by_mailbox), then the smeba
    // baseline. Registry-driven, no swarm-name branch — debtor is unchanged
    // (email.entity is set → the fallback never runs). The cast is the codegen
    // Entity union (now includes inprevo); the DB column is text.
    const entityByMailbox = await step.run("load-swarm-entity-map", async () => {
      const swarmRow = await loadSwarm(supabase, swarm_type);
      const scope = (
        swarmRow?.resolution_config as
          | { scope?: { entity_by_mailbox?: Record<string, string> } }
          | null
      )?.scope;
      return scope?.entity_by_mailbox ?? null;
    });
    const entity = (email.entity ??
      (email.mailbox ? entityByMailbox?.[email.mailbox] : undefined) ??
      "smeba") as
      | "smeba"
      | "berki"
      | "fire-control"
      | "inprevo"
      | "sicli-noord"
      | "sicli-sud"
      | "smeba-fire";

    // ---- Phase 113 Plan 02 (Q1 seam) — per-swarm Stage 3 dispatch -----------
    // Resolve the per-swarm Orq agent KEY from the DB registry
    // (swarms.stage3_coordinator_agent_key) and the per-swarm output SCHEMA from
    // the swarm-keyed map. Both are looked up by the DERIVED swarm_type — the
    // coordinator names NO swarm. This realizes the per-swarm classifier
    // dispatch as a registry + map lookup (Phase 110 D-07), NOT a dispatcher
    // edit and NOT a literal `if (swarm_type === ...)` branch. Debtor is
    // byte-neutral: its registry key is "debtor-intent-agent" (or the fail-safe
    // default) and its schema is the V2/V3 tolerant union — identical to the
    // pre-parameterization invoke. A third swarm onboards with a schema-map
    // entry + a registry row and ZERO coordinator edits.
    const stage3AgentKey = await step.run("load-swarm-agent-key", async () => {
      const swarmRow = await loadSwarm(supabase, swarm_type);
      // Fail-safe to the debtor agent when the registry row is missing or the
      // key column is null — a misconfiguration must not cross-dispatch.
      return swarmRow?.stage3_coordinator_agent_key ?? "debtor-intent-agent";
    });
    // Pure lookup (no DB) — resolve OUTSIDE step.run. Fail-safe to the debtor
    // schema for an unknown/misconfigured swarm_type (the codegen invariant
    // guarantees sales always has an entry post-Plan-03).
    const stage3Schema = intentSchemaForSwarm(swarm_type);

    // CLAUDE.md / Inngest pitfall: any non-deterministic value used inside
    // step.run side-effects (DB writes keyed on it) MUST be generated inside
    // step.run, otherwise replays regenerate it and INSERT/UPDATE race onto
    // different keys. run_id is the coordinator_runs PK and joins every
    // downstream step — has to be stable across replays.
    const run_id = await step.run("resolve-run-id", async () =>
      email.run_id ??
        (typeof crypto !== "undefined" && "randomUUID" in crypto
          ? (crypto as { randomUUID(): string }).randomUUID()
          : `local-${email_id}-${Date.now()}`),
    );
    const automation_run_id = email.automation_run_id;
    const budget_run_id = email.budget_run_id;

    // ---- Phase 131 (ROUTE-04) — load the routing destinations for this swarm.
    // [] for debtor/sales (no routing_destinations rows) → the routing
    // capability block below is skipped → byte-neutral. Returns the active
    // (bucket×brand) rows for info-routing. Registry read, replay-safe inside
    // step.run. NO swarm_type literal — purely data-gated.
    const routingDestinations = await step.run(
      "load-routing-destinations",
      async () => loadRoutingDestinations(supabase, swarm_type),
    );

    // ---- 1) Resolve agent_run_id (caller-provided OR create a fresh row) ----
    const agent_run_id = await step.run("create-agent-run", async () => {
      if (email.agent_run_id) return email.agent_run_id;
      return createRun(supabase, {
        swarm_type,
        email_id: resolvedEmailId,
        inngest_run_id,
        entity,
      });
    });

    // ---- 2) Insert coordinator_runs row early -------------------------------
    // Phase 80: escalation_decision moved to the dispatcher; we keep the
    // legacy 'single_shot' default here to avoid a schema touch.
    await step.run("create-coordinator-run", async () => {
      const { error } = await supabase.from("coordinator_runs").insert({
        run_id,
        automation_run_id: automation_run_id ?? null,
        email_id: resolvedEmailId,
        swarm_type,
        ranked_intents: [],
        escalation_decision: "single_shot",
        expected_handlers: 1,
        budget_run_id: budget_run_id ?? null,
      });
      if (error) {
        throw new Error(`coordinator_runs insert: ${error.message}`);
      }
      await emitAutomationRunStale(supabase, "debtor-email-review");
    });

    try {
      // ---- Phase 131 (ROUTE-04 / ROUTE-06 / ROUTE-07) — additive Stage-3
      // ROUTING capability. Runs iff the swarm has routing_destinations rows
      // (info-routing today). This is an INDEPENDENT registry-gated capability
      // (D-03): it invokes the per-swarm classifier (info-routing-coordinator),
      // resolves (bucket×brand)→mailbox, builds the 6-field verdict, and
      // persists it via the SAME Stage-3 persistence path (decision_details
      // .routing + TELE-01 dual-write, D-02 — NO routing_verdicts table). It
      // then routes through the existing held gate (below): info-routing is
      // seeded stage_3_routing=true so the predicted-emit is withheld → the
      // dispatcher never fires → no Stage 4 forward, no Stage-2 invoke (ROUTE-07
      // is free — no new gating code here). For routing swarms the intent
      // ranked-list path does NOT run (the routing agent returns a routing-
      // shaped output, not a ranked-intent list). debtor/sales get [] →
      // skip → the intent path below is byte-unchanged.
      if (routingDestinations.length > 0) {
        // Invoke the per-swarm routing classifier (resolved registry agent key,
        // e.g. info-routing-coordinator) and Zod-gate its output. Invalid/empty
        // output → unrouted marker (parseAgentOutputOrUnrouted never throws).
        const classifyOut = await step.run("classify-routing", async () => {
          // BUG 2 (CR-01) — invokeOrqAgent THROWS on empty output text, non-JSON
          // body, or timeout BEFORE returning raw; parseAgentOutputOrUnrouted only
          // guards valid-JSON-but-schema-invalid. Wrap BOTH in try/catch so ANY
          // transport/parse throw degrades to the SAME unrouted marker (→ human
          // triage, the safe fallback) instead of escaping to the outer catch →
          // mark-failed → terminal coordinator FAILURE. Preserves ROUTE-04/ROUTE-06
          // "invalid/empty → unrouted, never crash." The valid path is unchanged.
          try {
            const { raw } = await invokeOrqAgent(stage3AgentKey, {
              subject: email.subject ?? "",
              body_text: email.body_text ?? "",
              sender_email: email.sender_email ?? null,
              sender_domain,
              mailbox: email.mailbox ?? null,
            });
            const parsedOk = parseAgentOutputOrUnrouted(raw);
            // ponytail: TEMP instrumentation (V9.7 routing 0-routed diag). Capture
            // the raw agent output + parse outcome so the swallowed unrouted cause
            // is queryable in decision_details.routing_debug. REMOVE after smoke.
            return {
              parsed: parsedOk,
              debug: { threw: false, parsed_unrouted: parsedOk.unrouted, raw },
            };
          } catch (err) {
            const reason = err instanceof Error ? err.message : String(err);
            return {
              parsed: unroutedFromError(reason),
              debug: { threw: true, reason },
            };
          }
        });
        const parsed = classifyOut.parsed;

        // The unrouted threshold is a single swarm-level knob (Discretion 1):
        // swarms.resolution_config.routing_unrouted_threshold (default 0.6 =
        // require >= medium). Read via the already-cached loadSwarm.
        const threshold = await step.run(
          "load-routing-threshold",
          async () => {
            const swarmRow = await loadSwarm(supabase, swarm_type);
            const raw = (
              swarmRow?.resolution_config as
                | { routing_unrouted_threshold?: unknown }
                | null
                | undefined
            )?.routing_unrouted_threshold;
            return typeof raw === "number" ? raw : 0.6;
          },
        );

        // ---- Phase 131 Plan 04 (ROUTE-05) — two-layer duplicate-delivery
        // guard. Resolve the target mailbox the SAME way buildRoutingVerdict
        // does (so the dedup target matches the verdict's), then run the
        // two-layer check inside step.run (the layer-b DB read must be
        // replay-safe). The set of ingested target mailboxes is derived from the
        // routing_destinations rows (RESEARCH A7 — order@ ingested today);
        // non-ingested targets skip layer (b) gracefully. For an unrouted parse
        // (no bucket/brand) the target resolves to null → dedup is a no-op
        // routable, so we skip the DB read entirely. The result feeds the
        // verdict's optional dedup arg → Phase 132 honors already_addressed.
        const dedup: RoutingDedup = await step.run(
          "check-duplicate-delivery",
          async () => {
            // unrouted parse → no target → routable (no read).
            if (parsed.unrouted) {
              return { status: "routable", matched_layer: null } as RoutingDedup;
            }
            const { target_mailbox: targetMailbox } = resolveRoutingDestination(
              routingDestinations,
              parsed.value.bucket,
              parsed.value.brand,
            );
            // No resolved mailbox (no-match OR a matched no-forward "stays"
            // bucket like algemeen) → nothing to forward → dedup is a no-op.
            if (!targetMailbox) {
              return { status: "routable", matched_layer: null } as RoutingDedup;
            }
            // The known-ingested target mailboxes: every non-null target_mailbox
            // in the active routing_destinations is a candidate, but layer (b)
            // only meaningfully covers ingested mailboxes (order@). We pass the
            // full set; checkDuplicateDelivery logs a coverage gap + skips
            // layer (b) for any target whose rows aren't actually ingested. The
            // dedup helper is conservative — a coverage gap never blocks.
            const ingestedTargetMailboxes = [
              ...new Set(
                routingDestinations
                  .map((d) => d.target_mailbox)
                  .filter((m): m is string => !!m),
              ),
            ];
            // Read the source email's recipients + raw_json for layer (a) and
            // the source message/conversation ids for layer (b). The flat
            // `recipients` column is NULL for info-routing ingest rows — layer
            // (a) reads raw_json (handled inside extractRecipientAddresses).
            const { data: emailRow } = await supabase
              .from("emails")
              .select("recipients, raw_json")
              .eq("id", resolvedEmailId)
              .maybeSingle();
            return checkDuplicateDelivery({
              emailRow: {
                recipients:
                  (emailRow as { recipients?: unknown } | null)?.recipients ?? null,
                raw_json:
                  (emailRow as { raw_json?: unknown } | null)?.raw_json ?? {},
              },
              targetMailbox,
              admin: supabase as unknown as DedupAdmin,
              ingestedTargetMailboxes,
            });
          },
        );

        // Build the 6-field verdict with the REAL two-layer dedup result.
        const verdict = buildRoutingVerdict(
          parsed,
          routingDestinations,
          threshold,
          dedup,
        );

        // Persist the verdict via the Stage-3 persistence path (D-02): update
        // coordinator_runs.decision_details.routing THEN emitPipelineEvent
        // (TELE-01) inside the SAME step.run — single replay boundary, keyed off
        // the replay-safe run_id. Bulk Review (Phase 132) reads decision_details
        // .routing for free.
        await step.run("persist-routing-verdict", async () => {
          const { error } = await supabase
            .from("coordinator_runs")
            .update({
              decision_details: { routing: verdict, routing_debug: classifyOut.debug },
            })
            .eq("run_id", run_id);
          if (error) throw new Error(`persist-routing-verdict: ${error.message}`);

          await emitPipelineEvent(supabase, {
            swarm_type,
            stage: 3,
            email_id: resolvedEmailId,
            decision: verdict.bucket,
            confidence: numericConfidence(verdict.confidence),
            decision_details: { routing: verdict },
            agent_run_id,
            automation_run_id: automation_run_id ?? null,
            triggered_by: "pipeline",
          });
        });

        // ---- Phase 132 Plan 02 (FWD-01..FWD-07, D-03) — forward-request emit.
        // After the verdict is persisted (above) and BEFORE the stage_3_routing
        // held gate (below), emit the dedicated `pipeline/forward.requested`
        // event that drives the swarm-agnostic Stage-4 forward worker — but ONLY
        // when the verdict is forwardable (routable, non-null target, not a
        // duplicate) AND the verdict's bucket is RELEASED for this swarm.
        //
        // This emit is INDEPENDENT of and ADDITIVE to the stage_3_routing held
        // gate below (RESEARCH A4 / Pitfall 5): the held gate keeps the
        // intent-dispatch path held permanently (info-routing has no
        // swarm_intents → the dispatcher would throw on empty ranked[]), while
        // this emit drives only the forward worker. The worker re-checks
        // isForwardBucketReleased + the dedup/idempotency guards (defence in
        // depth, T-132-08). NO swarm_type literal — gated purely on the verdict
        // fields + the enclosing routingDestinations.length>0 condition + the
        // per-bucket release flag.
        await step.run("emit-forward-request", async () => {
          const forwardable =
            !verdict.unrouted &&
            verdict.target_mailbox !== null &&
            verdict.dedup.status === "routable";
          if (!forwardable) return;
          const swarmRow = await loadSwarm(supabase, swarm_type);
          if (!isForwardBucketReleased(swarmRow, verdict.bucket)) return;
          // `pipeline/forward.requested` is not a typed Events key → dynamic-name
          // cast applied INLINE (never alias inngest.send; Phase 65 dae6276).
          // Reuse the replay-safe run_id (resolved above) — do NOT regenerate.
          await (inngest.send as unknown as SendFn)({
            name: "pipeline/forward.requested",
            data: { swarm_type, run_id, email_id: resolvedEmailId },
          });
        });

        // No-forward gate (ROUTE-07): info-routing is seeded stage_3_routing=true
        // → held → withhold the predicted-emit so the Stage 3.5 dispatcher never
        // fires (no Stage 4, no forward). The verdict is already visible above.
        // We mark routing_held + completed_at and return — agent_runs stays
        // 'classifying' (the predicted-emit is the flip's only consumer; holding
        // it holds routing). A green-light flip (stage_3_routing→false) lets a
        // future phase emit. Fail-closed: a missing flag → held.
        const routingGatedForRouting = await step.run(
          "load-stage3-routing-gate-routing",
          async () => {
            const swarmRow = await loadSwarm(supabase, swarm_type);
            return isStage3RoutingGated(swarmRow);
          },
        );

        if (routingGatedForRouting) {
          // ---- Phase 132.1 Plan 01 Task 2 (D-01) — held-path category stamp +
          // 112.5 baseline. During the dry-run window the held routing verdict
          // gets `AI: held → <bucket>` (routable) or `AI: triage` (unrouted)
          // stamped onto the SOURCE info@ mail via Graph GET+PATCH, and the SAME
          // category string seeds the swarm_written_categories baseline so the
          // 112.5 delta-sync has a row to diff against (D-01 chicken-and-egg).
          // This is what gives the operator an AI label to CORRECT and 112.5 a
          // baseline to compare — the precondition for Plan 04's shadow gate.
          //
          // D-04: an `algemeen` verdict (matched, target_mailbox null — "stays"
          // in info@) is NOT stamped/baselined — no forward measurement axis.
          // The unrouted verdict (no bucket) IS triaged (AI: triage) so the
          // operator still sees a routing decision. Guard: skip only the matched
          // no-forward "stays" case (target_mailbox null AND NOT unrouted).
          //
          // Best-effort + isolated in its OWN step.run (mirrors the forward
          // worker's stamp isolation): a Graph failure must NOT abort the
          // held-verdict persist below — the try/catch swallows it. Replay-safe:
          // the source mailbox/graphId are read from the emails row keyed by the
          // replay-safe resolvedEmailId. NO swarm-name literal — purely verdict-
          // field driven inside the registry-gated routing block.
          const stamps3Algemeen =
            !verdict.unrouted && verdict.target_mailbox === null;
          if (!stamps3Algemeen) {
            await step.run("stamp-held-routing-category", async () => {
              try {
                const aiCategory = buildRoutingCategory(
                  verdict.unrouted ? "triage" : "held",
                  verdict.bucket,
                );
                // Resolve the SOURCE info@ mailbox + Graph immutable id the same
                // way the forward worker does (source_id = Graph id; mailbox =
                // the source box — stamp against the SOURCE, never the target).
                const { data: srcRow } = await supabase
                  .from("emails")
                  .select("source_id, mailbox")
                  .eq("id", resolvedEmailId)
                  .maybeSingle();
                const src = srcRow as {
                  source_id?: string | null;
                  mailbox?: string | null;
                } | null;
                const sourceId = src?.source_id ?? null;
                const sourceMailbox = src?.mailbox ?? email.mailbox ?? null;
                if (sourceId && sourceMailbox) {
                  const getRes = await graphFetch(
                    `/users/${encodeURIComponent(sourceMailbox)}/messages/${encodeURIComponent(sourceId)}?$select=categories`,
                  );
                  if (getRes.ok) {
                    const msg = (await getRes.json()) as {
                      categories?: string[];
                    };
                    const next = mergeRoutingCategory(
                      msg.categories ?? [],
                      verdict.unrouted ? "triage" : "held",
                      verdict.bucket,
                    );
                    await graphFetch(
                      `/users/${encodeURIComponent(sourceMailbox)}/messages/${encodeURIComponent(sourceId)}`,
                      { method: "PATCH", body: { categories: next } },
                    );
                  }
                  // Seed the 112.5 baseline with the SAME category string. Keyed
                  // by resolvedEmailId so 112.5 can join source_id → email_id →
                  // baseline and diff the operator's live edit against it.
                  await recordWrittenCategory(supabase, {
                    email_id: resolvedEmailId,
                    swarm_type,
                    source_mailbox: sourceMailbox,
                    ai_category: aiCategory,
                  });
                }
              } catch {
                // Best-effort (D-01): a stamp/baseline failure must never abort
                // the held-verdict persist below. Swallow + continue.
              }
            });
          }

          await step.run("mark-routing-verdict-held", async () => {
            const { error } = await supabase
              .from("coordinator_runs")
              .update({
                decision_details: {
                  routing: verdict,
                  routing_held: true,
                  routing_debug: classifyOut.debug,
                },
                completed_at: new Date().toISOString(),
              })
              .eq("run_id", run_id);
            if (error) {
              throw new Error(`mark-routing-verdict-held: ${error.message}`);
            }
          });
          return {
            run_id,
            email_id: resolvedEmailId,
            decision: "predicted_held" as const,
          };
        }

        // OPEN path (a future phase flips stage_3_routing→false): emit predicted
        // so the dispatcher routes the verdict. Held this phase, so unreached
        // today — but kept so the capability is reversible without a code change.
        await step.run("flip-status-predicted-routing", async () => {
          const { error } = await supabase
            .from("agent_runs")
            .update({ status: "predicted" })
            .eq("id", agent_run_id)
            .eq("status", "classifying");
          if (error) {
            throw new Error(`flip-status-predicted-routing: ${error.message}`);
          }
        });
        await step.run("emit-predicted-routing", async () => {
          await inngest.send({
            name: "pipeline/predicted",
            data: {
              swarm_type,
              run_id,
              agent_run_id,
              email_id: resolvedEmailId,
              automation_run_id: automation_run_id ?? null,
              budget_run_id: budget_run_id ?? null,
              ranked: [],
              language: "",
              urgency: "",
              entity,
              routing: verdict,
            },
          });
        });
        return {
          run_id,
          email_id: resolvedEmailId,
          decision: "predicted" as const,
        };
      }

      // ---- 3) Classify intent (V2 ranked output, idempotent cache) ---------
      // Inngest's step.run wraps the return type in JsonifyObject which strips
      // zod-derived literal unions. Cast back to the v2 shape after the await
      // — the value is already validated by intentAgentOutputSchemaV2 inside
      // invokeIntentAgent (or originated from a previously validated cache row).
      //
      // Phase 83 D-06: the side-effects below (email row select for
      // body_full_text, conversation_context select for priors, and the
      // pure assembleInput call) live inside this same step.run boundary
      // so Inngest replay re-derives the assembled input deterministically.
      const classifyResult = await step.run("classify-intent", async () => {
          // Phase 83 D-10 reader switch — fetch body_full_text with body_text
          // fallback. The event payload still carries body_text (legacy emit
          // shape) but Plan 83-03 dual-writes body_full_text; we prefer the
          // wider field. If neither column is populated yet on a not-yet-
          // backfilled row, fall back to event.data.body_text.
          const { data: emailRow } = await supabase
            .from("emails")
            .select("body_full_text, body_text")
            .eq("id", resolvedEmailId)
            .maybeSingle();
          const bodyFull =
            (emailRow as { body_full_text?: string | null } | null)
              ?.body_full_text
            ?? (emailRow as { body_text?: string | null } | null)?.body_text
            ?? email.body_text
            ?? "";

          // Phase 83 D-04 — conversation_context priors, ordered position ASC.
          const { data: priorsRows } = await supabase
            .from("conversation_context")
            .select("position, sender_email, subject, received_at, body_text")
            .eq("email_id", resolvedEmailId)
            .order("position", { ascending: true });
          const priors = (priorsRows ?? []).map(
            (r: Record<string, unknown>) => ({
              position: Number(r.position),
              senderEmail: (r.sender_email as string | null) ?? null,
              subject: (r.subject as string | null) ?? null,
              receivedAt: (r.received_at as string | null) ?? null,
              bodyText: (r.body_text as string | null) ?? null,
            }),
          );

          const assembled = assembleInput({
            subject: email.subject ?? "",
            bodyFull,
            priors,
            tenantDomains: TENANT_DOMAINS,
            capChars: STAGE_3_INPUT_CAP_CHARS,
          });

          // Phase 85 D-07 — cache-key flips to V3. Version-literal flip
          // automatically invalidates V2 cache rows (findCachedOutput filters
          // on `intent_version = INTENT_VERSION_V3`). Transient window: until
          // Plan 03 deploys the V3 agent prompt, cache-miss → V2 output stored
          // under V3 cache key. The discriminated union accepts both shapes
          // so no run breaks; rows naturally re-key once V3 ships (PATTERNS §A).
          const cached = await findCachedOutput<Record<string, unknown>>(
            supabase,
            resolvedEmailId,
            "intent_version",
            INTENT_VERSION_V3,
            "tool_outputs",
          );
          const cachedFirst = cached?.intent_first_pass as
            | IntentAgentOutputV2
            | IntentAgentOutputV3
            | undefined;

          // Cache hit reuses the prior LLM output but MUST still hoist it
          // onto THIS agent_run_id — otherwise duplicate triggers for the
          // same email_id (manual replay scripts, upstream redelivery) leave
          // the new agent_runs row with intent=null + tool_outputs={}.
          const output: IntentAgentOutputV2 | IntentAgentOutputV3 = cachedFirst
            ?? (await invokeIntentAgent(
              {
                email_id: resolvedEmailId,
                inngest_run_id,
                subject: email.subject,
                body_text: email.body_text,
                assembled_input: assembled.text,
                sender_email: email.sender_email,
                sender_domain,
                mailbox: email.mailbox,
                entity,
                received_at: email.received_at,
              },
              // Phase 113 Plan 02 (Q1 seam) — the SINGLE parameterized invoke.
              // Per-swarm agent key (from the DB registry) + per-swarm output
              // schema (from the swarm-keyed map). For debtor these resolve to
              // "debtor-intent-agent" + the V2/V3 union — byte-neutral. Sales
              // dispatches through THIS same call with no second code path.
              { agent_key: stage3AgentKey, schema: stage3Schema },
            )).output;

          // mergeToolOutputs requires JsonValue. The IntentAgentOutputV2 shape
          // is JSON-serialisable by construction (zod-validated literals +
          // strings/numbers/null), so the unknown cast is sound at runtime.
          await mergeToolOutputs(
            supabase,
            agent_run_id,
            "intent_first_pass",
            output as unknown as Parameters<typeof mergeToolOutputs>[3],
          );

          // Hoist top-1 onto agent_runs back-compat columns. v1 columns
          // (intent, confidence, sub_type, document_reference, language,
          // urgency, reasoning, intent_version) still exist on agent_runs
          // and are read by Bulk Review; the row is the back-compat surface
          // until later migrations push queries to coordinator_runs.ranked_intents.
          const top = output.ranked[0];
          await updateRun(supabase, agent_run_id, {
            intent: top.intent,
            sub_type: top.sub_type,
            document_reference: top.document_reference,
            language: output.language,
            confidence: top.confidence,
            urgency: output.urgency,
            // Phase 85 D-07 — provenance sourced from the LLM response, not
            // a hardcoded constant. Audit trail now records the actual
            // intent_version the agent returned (V2 or V3).
            intent_version: output.intent_version,
            reasoning: top.reasoning,
          });
          // Phase 83 D-09 telemetry: surface input_chars + truncated so the
          // persist-ranked step writes coordinator_runs.decision_details.input_size.
          return {
            output,
            inputSize: {
              input_chars: assembled.inputChars,
              truncated: assembled.truncated,
            },
          };
        },
      );
      const output = (classifyResult as unknown as {
        output: IntentAgentOutputV2 | IntentAgentOutputV3;
        inputSize: { input_chars: number; truncated: boolean };
      }).output;
      const inputSize = (classifyResult as unknown as {
        output: IntentAgentOutputV2 | IntentAgentOutputV3;
        inputSize: { input_chars: number; truncated: boolean };
      }).inputSize;

      // ---- 4) Persist ranked_intents on coordinator_runs --------------------
      await step.run("persist-ranked", async () => {
        const { error } = await supabase
          .from("coordinator_runs")
          .update({ ranked_intents: output.ranked })
          .eq("run_id", run_id);
        if (error) throw new Error(`persist-ranked: ${error.message}`);

        // Phase 70 — TELE-01 dual-write. One pipeline_events row per Stage 3
        // decision. Lives inside the SAME step.run as the coordinator_runs
        // UPDATE per CONTEXT D-09 (single replay boundary). event.data.email_id
        // IS the canonical email_pipeline.emails.id (uuid).
        const top = output.ranked[0];
        await emitPipelineEvent(supabase, {
          swarm_type,
          stage: 3,
          email_id: resolvedEmailId,
          decision: top.intent,
          confidence: numericConfidence(top.confidence),
          decision_details: {
            ranked: output.ranked,
            language: output.language,
            urgency: output.urgency,
            // 2026-05-19 — Stage 3 audit-panel evidence expansion.
            // Persist the model/prompt version + the classifier inputs so the
            // audit UI can render an INPUTS section without a JOIN back to
            // agent_runs. Subject is excerpted to ≤140 chars (the panel uses
            // it as a "you sent the classifier THIS" reminder, not a full
            // body view — the existing Show full email link covers that).
            // Phase 85 D-07 — intent_version reflects the actual agent output
            // shape (V2 or V3), not a hardcoded constant.
            intent_version: output.intent_version,
            inputs: {
              sender_email: email.sender_email ?? null,
              sender_domain: sender_domain || null,
              mailbox: email.mailbox ?? null,
              entity,
              subject_excerpt: (email.subject ?? "").slice(0, 140) || null,
              received_at: email.received_at ?? null,
            },
            // Phase 83 D-09 telemetry — assembled-input size + truncation
            // flag for post-deploy monitoring of token-bloat / R-01 watch.
            input_size: {
              input_chars: inputSize.input_chars,
              truncated: inputSize.truncated,
            },
            // Phase 85 D-04 — additive telemetry, only present on V3 outputs.
            // Phase 86 reads from this JSONB to build the proposal-capture
            // surface. Closed-list path (proposal=null) still emits the keys
            // for shape stability; open-set path carries the snake_case
            // candidate + reason. NO `swarm_intents` write — intents live
            // only in JSONB telemetry per V9.0 promotion gating.
            ...(output.intent_version === INTENT_VERSION_V3 && {
              intent_proposal: output.intent_proposal,
              proposal_reason: output.proposal_reason,
            }),
            // Phase 113 Plan 02 (Q1 seam) — additive, swarm-agnostic axis.
            // The sales schema sets entity_relationship; the debtor schema
            // lacks the field so it reads `undefined` and is omitted. No schema
            // migration, no swarm name — a pure `!= null` guard on JSONB.
            ...((output as { entity_relationship?: unknown }).entity_relationship !=
              null && {
              entity_relationship: (output as { entity_relationship?: unknown })
                .entity_relationship,
            }),
          },
          agent_run_id,
          automation_run_id: automation_run_id ?? null,
          triggered_by: "pipeline",
        });
      });

      // ---- 4.25) Stage-3 intent-label emit (Phase 117 Plan 02, D-2) --------
      // Swarm-agnostic: emit `pipeline/intent-label.requested` carrying the
      // top-1 intent so the shared intent-label worker can write `AI: <intent>`
      // back onto the source Outlook message (behind its OWN dedicated
      // stage_3_intent_label gate, independent of the routing gate below). The
      // emit fires on BOTH the routing-GATED/held path AND the OPEN path — a
      // held-routing verdict can still be labelled if the swarm opted into
      // labelling. Skipped only when there is no top-1 intent (nothing to
      // label). NO `if (swarm_type === ...)` branch: swarm_type + intent_key are
      // pure data. CLAUDE.md/Phase 65: inngest.send called inline (no alias),
      // inside step.run (replay-safe — the payload carries no non-deterministic
      // id we generate here; run_id is already resolved deterministically).
      const topIntent = output.ranked[0]?.intent;
      async function emitIntentLabel() {
        if (!topIntent) return;
        // resolvedEmailId is non-null past the line-219 guard, but TS re-widens
        // it to string|null inside this closure — re-narrow before the emit.
        if (!resolvedEmailId) return;
        await step.run("emit-intent-label", async () => {
          await inngest.send({
            name: "pipeline/intent-label.requested",
            data: {
              swarm_type,
              email_id: resolvedEmailId,
              intent_key: topIntent,
              source_mailbox: email.mailbox ?? null,
              run_id,
            },
          });
        });
      }

      // ---- 4.5) Stage-3 ROUTING gate (Phase 113 Plan 05, D-08 / D-09) -------
      // Swarm-agnostic, registry-driven, fail-closed. Sits BETWEEN persist-ranked
      // (the verdict is already on coordinator_runs + pipeline_events → visible in
      // Bulk Review) and flip-status-predicted / emit-predicted. When ROUTING is
      // GATED for this swarm (dry_run_config.stage_3_routing=true), the
      // predicted-emit is WITHHELD so the Stage 3.5 dispatcher never fires and
      // Kanban routing is held — D-08 dry-run observation. The verdict stays
      // visible; routing is the only thing held. When OPEN (false), the
      // flip+emit run exactly as before (debtor's live path — seeded false).
      //
      // CRITICAL debtor-neutrality (T-113-10): this reads the DEDICATED
      // `stage_3_routing` key (NOT stage_3_labeling). debtor is seeded
      // stage_3_routing=false → OPEN → its predicted-emit fires every run,
      // byte-identical to today. NO `if (swarm_type === ...)` branch — the gate
      // is purely a registry read keyed by the derived swarm_type. The shared
      // dispatcher is untouched: the hold is achieved by the coordinator
      // (the per-swarm classifier dispatch point) withholding the emit.
      //
      // Held-state marker: when held we stamp coordinator_runs.decision_details
      // .routing_held=true so the dead-letter reconciliation (Plan 05 Task 2)
      // counts a HELD verdict as a TERMINAL, visible state — never a dead-letter.
      const routingGated = await step.run("load-stage3-routing-gate", async () => {
        const swarmRow = await loadSwarm(supabase, swarm_type);
        return isStage3RoutingGated(swarmRow);
      });

      if (routingGated) {
        // GATED — persist the held-state marker and SKIP flip+emit. The verdict
        // is already visible (persist-ranked). The dispatcher never fires.
        await step.run("mark-routing-held", async () => {
          const { error } = await supabase
            .from("coordinator_runs")
            .update({
              decision_details: { routing_held: true },
              completed_at: new Date().toISOString(),
            })
            .eq("run_id", run_id);
          if (error) throw new Error(`mark-routing-held: ${error.message}`);
        });
        // Phase 117: still emit the intent-label request — the category WRITE
        // gate (stage_3_intent_label) is independent of the routing gate, so a
        // held-routing verdict can still be labelled (the worker no-ops if the
        // swarm's label gate is also GATED). Fires before the held return.
        await emitIntentLabel();
        // Terminal, visible, NON-dead-letter outcome. agent_runs stays in
        // 'classifying' on purpose: the predicted-emit is the flip's only
        // consumer, and holding it means routing is held — Bulk Review reads
        // coordinator_runs.ranked_intents for the verdict regardless of the
        // agent_runs status. A green-light flip (stage_3_routing→false) lets
        // subsequent runs flip+emit normally (reversible per D-09).
        return {
          run_id,
          email_id: resolvedEmailId,
          decision: "predicted_held" as const,
        };
      }

      // ---- 5) Flip agent_runs.status: classifying → predicted -------------
      // First-class observable state per docs/agentic-pipeline/stage-3-coordinator.md.
      // Race guard via .eq("status", "classifying"): only flip from classifying,
      // idempotent against double-runs (a replay or duplicate trigger lands on a
      // status that is no longer 'classifying' and the UPDATE is a no-op).
      await step.run("flip-status-predicted", async () => {
        const { error } = await supabase
          .from("agent_runs")
          .update({ status: "predicted" })
          .eq("id", agent_run_id)
          .eq("status", "classifying");
        if (error) throw new Error(`flip-status-predicted: ${error.message}`);
      });

      // ---- 6) Emit canonical `pipeline/predicted` for the Stage 3.5 dispatcher
      // Cross-swarm contract: the dispatcher subscribes to the single
      // `pipeline/predicted` event and routes via swarm_intents.handler_status,
      // reading swarm_type from the payload (the event name is swarm-agnostic).
      await step.run("emit-predicted", async () => {
        await inngest.send({
          name: "pipeline/predicted",
          data: {
            swarm_type,
            run_id,
            agent_run_id,
            email_id: resolvedEmailId,
            automation_run_id: automation_run_id ?? null,
            budget_run_id: budget_run_id ?? null,
            ranked: output.ranked,
            language: output.language,
            urgency: output.urgency,
            entity,
          },
        });
      });

      // Phase 117: ADDITIVE intent-label emit on the OPEN path, right after the
      // existing emit-predicted (which is byte-unchanged above).
      await emitIntentLabel();

      return {
        run_id,
        email_id: resolvedEmailId,
        decision: "predicted" as const,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await step.run("mark-failed", async () => {
        if (automation_run_id) {
          await supabase
            .from("automation_runs")
            .update({
              status: "failed",
              error_message: msg,
              completed_at: new Date().toISOString(),
            })
            .eq("id", automation_run_id);
        }
        await supabase
          .from("coordinator_runs")
          .update({ completed_at: new Date().toISOString() })
          .eq("run_id", run_id);
        await emitAutomationRunStale(supabase, "debtor-email-review");
      });
      throw err;
    }
  },
);
