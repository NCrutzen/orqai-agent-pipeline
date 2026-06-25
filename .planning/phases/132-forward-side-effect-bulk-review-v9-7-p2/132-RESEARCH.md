# Phase 132: Forward side-effect + Bulk Review (V9.7 P2) - Research

**Researched:** 2026-06-17
**Domain:** Microsoft Graph mail forward + category write (Stage-4 side-effect) · Inngest replay-safe side-effects · registry-driven per-bucket dry-run gating · swarm-generic Bulk Review surface reuse
**Confidence:** HIGH (Graph forward/category-write paths and the entire Phase-131 verdict/coordinator/dedup substrate verified directly in this repo; only the per-bucket-release storage mechanism and the exact category vocabulary are open design choices)

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Forward mechanism**
- **D-01:** Inline Outlook **forward** from info@ to the resolved departmental mailbox, with **reply-to set to the ORIGINAL sender** so the department can reply directly to the customer (not bounce through info@). *Research must validate Graph supports setting reply-to / `replyTo` on a forwarded message; if not feasible, fall back to inline forward that surfaces the original sender's address for one-click reply — capture the original sender either way.*
- **D-02:** Forward is **idempotent** — it MUST honor the Phase-131 two-layer dedup guard (ROUTE-05); re-runs never double-forward (no-op on replay / re-process). Forward only fires for `unrouted=false` verdicts that resolve to a non-null `target_mailbox`.

**Release / dry-run gating**
- **D-03:** **Per-bucket graduated release** — forwarding is gated per destination bucket (e.g. release `storingen` first, then `verkoop`, …), NOT a single global switch. Builds on the existing held gate (ROUTE-07 `swarms.dry_run_config.stage_3_routing`) + the `granular-dry-run-gating` pattern. Registry/config-driven — **zero `swarm_type` literal** (SWARM-02).
- **D-04:** **Default = held/observe.** A bucket forwards only once it is explicitly released; until then the verdict is persisted + visible in Bulk Review but no side-effect fires.

**Category stamp-back**
- **D-05:** On **successful forward**, stamp the source mail in info@ with a single Outlook category encoding **routed-status + bucket** (e.g. `AI: routed → storingen`). Non-forward outcomes get their own distinct markers (e.g. `AI: held`, `AI: triage` for unrouted, `AI: algemeen` for stays-in-info@). Keep the scheme **stable + machine-parseable** — it is the V10 ambient-loop signal.
- **D-06:** Brand-aware: the category reflects the resolved (bucket × brand) where relevant; `env_id='BX'` hard filter respected.

**Bulk Review surface**
- **D-07:** **Reuse** the swarm-generic `[swarm]/review` Stage-3 surface; add a **routing detail pane** showing the 6-field verdict (bucket/brand/target_mailbox/confidence/dedup/unrouted) + **forward status** (held / forwarded / unrouted / dedup-skipped). No dedicated routing-only view.
- **D-08:** Operator **actions**: manual **override / re-route** to a different bucket, plus explicit **"forward now" / "don't forward"** controls. `algemeen` + `unrouted` appear in the queue for human handling (they never auto-forward).

### Claude's Discretion
Idempotency-key shape/storage; the exact Inngest `step.run` structure for the forward side-effect (replay-safe ids per CLAUDE.md); the precise category string format within the stable scheme; UI component reuse for the routing detail pane; how the per-bucket release flag is stored (config vs registry column) — research/planning decide.

### Deferred Ideas (OUT OF SCOPE)
- **NL routing-config UI + `verkoop@→order@` routing** → Phase 133 (P3).
- **Ambient-loop coupling** (clicked-away / moved mail → `correction_event` → V10 loop) → Phase 134 (P4).
- **Mis-forward recipient feedback loop** → V10.
- **Cross-swarm routing generalization** → spike when router #2 lands.
- **Rename the generic coordinator** off its legacy `debtor-email-coordinator` name → separate todo.
- `algemeen@smeba.nl` mailbox verification — **resolved** (mailbox does not exist; algemeen is a no-forward outcome).
</user_constraints>

<phase_requirements>
## Phase Requirements

> The `FWD-xx` group is provisional (locked by a future `132-SPEC.md`). The IDs below are the concrete sub-requirements this research implies, mapped to the Phase-132 success criteria in ROADMAP.md. The planner should treat these as the requirement skeleton and reconcile with the SPEC when it lands.

| ID | Description | Research Support |
|----|-------------|------------------|
| FWD-01 | A routable verdict (`unrouted=false`, `dedup.status='routable'`, non-null `target_mailbox`) triggers an idempotent Outlook forward to the resolved target mailbox. | `verdict.ts` already yields exactly this shape; Graph `createForward`→PATCH→`send` validated below; idempotency via persisted forward-state + Inngest `step.run` replay-safety. |
| FWD-02 | The forward sets reply-to to the ORIGINAL customer sender so the department replies directly to the customer. | Graph `createForward` returns a draft `message` with a writable `replyTo[]`; PATCH it then `/send` (validated). Fallback: inline forward + sender surfaced in body. |
| FWD-03 | Forwarding is per-bucket dry-run-gated; default held/observe; a bucket forwards only after explicit release. | Extends `dry_run_config` + `isStageBlocked`/`isStage3RoutingGated` pattern; per-bucket flag mechanism recommended below (jsonb map). |
| FWD-04 | `algemeen` (matched null-target "stays") and `unrouted` verdicts NEVER forward. | `verdict.ts` already encodes: `algemeen`→matched+`target_mailbox=null`; `unrouted`→`unrouted=true`. The forwarder skips both by reading these fields — no bucket-name literal. |
| FWD-05 | The forward honors the Phase-131 two-layer dedup guard; `dedup.status='already_addressed'` never forwards. | `dedup.ts` + the coordinator's `check-duplicate-delivery` step persist `dedup` into the verdict; forwarder reads it. |
| FWD-06 | On successful forward, stamp the source info@ mail with a stable machine-parseable Outlook category (routed-status + bucket, brand-aware); non-forward outcomes get distinct markers. | `categorizeEmail`/`mergeIntentCategory` (Phase 117) + `routing_destinations.outlook_category` source; PATCH-categories append semantics confirmed. |
| FWD-07 | The Stage-4 forward path is registry-driven — zero `if swarm_type==='info-routing'` branch in the shared dispatcher/handler. | Phase 131 already runs the routing capability purely via `routingDestinations.length > 0`; the forward worker keys off the same registry + per-bucket flag. |
| FWD-08 | An info-routing Bulk Review surface shows each email's 6-field verdict + forward status for operator verification. | `[swarm]/review` is already swarm-generic and un-404'd for info-routing (Phase 110); add a routing detail-pane block + read `decision_details.routing`. |
| FWD-09 | Operators can override/re-route to a different bucket and explicitly force/suppress a forward. | Reuse stage-3 decide/override widget pattern; new server actions for re-route + forward-now/don't-forward. |
| FWD-10 | `env_id='BX'` hard brand filter respected throughout forward + category resolution. | Inherited from the destination registry resolution; carried through `resolveRoutingDestination`. |
</phase_requirements>

## Summary

Phase 131 left a clean, fully-wired seam: every actionable info@ email runs through the **shared** coordinator (`web/lib/inngest/functions/debtor-email-coordinator.ts`), which — purely because `loadRoutingDestinations('info-routing')` returns rows — invokes the routing classifier, builds the **6-field verdict** (`buildRoutingVerdict`), runs the **two-layer dedup guard** (`checkDuplicateDelivery`), persists everything to `coordinator_runs.decision_details.routing` + a `pipeline_events` dual-write (TELE-01), and then **withholds the predicted-emit** because info-routing is seeded `stage_3_routing=true` (held). The result is `decision: "predicted_held"` and a row marked `routing_held: true`. **Phase 132 releases this gate per-bucket and attaches the actual Stage-4 side-effects (forward + category stamp) plus the operator-facing review surface.** No new verdict logic is needed — the verdict already carries `bucket / brand / target_mailbox / confidence / dedup{status,matched_layer} / unrouted`, which is precisely the forward contract.

The Graph capability the codebase scout reported "missing" is partially present: `web/lib/outlook/client.ts` exposes `graphFetch` (the single Zapier-SDK credential boundary with 504/socket retry), `categorizeEmail` (GET-then-PATCH `categories`, append semantics), and `archiveEmail` (POST `/move`). There is **no forward** helper yet — that is the one net-new Graph primitive. The validated forward path is **`POST /users/{mailbox}/messages/{id}/createForward`** (returns a draft `message` with a writable `replyTo[]` and `isDraft:true`) → **`PATCH /users/{mailbox}/messages/{draftId}`** to set `replyTo` to the original sender → **`POST /users/{mailbox}/messages/{draftId}/send`**. This three-call draft flow is the only Graph-supported way to set `replyTo` on a forward (the single-shot `/forward` cannot), which directly satisfies D-01. The category stamp reuses the Phase-117 `categorizeEmail`/`mergeIntentCategory` pattern with `routing_destinations.outlook_category` as the per-(bucket×brand) label source.

**Primary recommendation:** Build a swarm-agnostic Stage-4 forward worker (Inngest function) triggered the same way Phase 131's OPEN path would emit `pipeline/predicted`, but gated **per-bucket** via a new `dry_run_config.stage_4_forward_buckets` jsonb map (bucket→boolean, default-missing = held). The worker (a) reads the persisted verdict, (b) hard-skips `unrouted` / null-target / `already_addressed`, (c) checks the per-bucket release flag, (d) does `createForward`→PATCH-replyTo→`send` inside replay-safe `step.run` boundaries with a persisted `forward_state` idempotency record, (e) stamps the category. Reuse `[swarm]/review` for the surface by adding a routing block to the existing detail pane reading `decision_details.routing`.

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Verdict→forward trigger | API/Backend (Inngest coordinator) | — | The coordinator already produces the verdict + (today) holds the emit; releasing it fires the Stage-4 worker. Pipeline orchestration is backend-only. |
| Outlook forward (createForward/PATCH/send) | API/Backend (Inngest Stage-4 worker) | External (MS Graph via Zapier SDK) | Side-effect with retries + replay-safety → must be inside `step.run`; Graph reached only through the `graphFetch` credential boundary. |
| Category stamp-back | API/Backend (same worker) | External (MS Graph) | Same boundary; append-merge semantics already proven by Phase 117. |
| Per-bucket release gate | Database/Registry (`swarms.dry_run_config`) | API/Backend (gate helper) | SWARM-02: release state is registry data read by a swarm-agnostic helper, never code. |
| Idempotency / dedup | API/Backend (verdict `dedup` + forward_state) | Database (persisted state) | Replay-safe ids + persisted forward record keyed off `coordinator_runs.run_id` / `email_id`. |
| Bulk Review routing pane | Frontend Server (RSC `[swarm]/review`) | API/Backend (server actions) | Read-only SSR hydration of `decision_details.routing`; operator actions are server actions. |
| Operator override / forward-now | API/Backend (server actions) | Frontend (decide widget) | Mutations belong server-side; the widget only dispatches. |

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@zapier/zapier-sdk` | (already installed) `web/lib/outlook/client.ts` | Microsoft Graph access via Outlook connection `56014785` | CLAUDE.md: "NXT-documenten op S3 ook via Zapier SDK… één credential-grens". All Graph traffic already routes through `graphFetch`. `[VERIFIED: repo web/lib/outlook/client.ts]` |
| `inngest` | (already installed) | Durable Stage-4 worker, retries, replay-safe `step.run` | Project stack — all side-effects are Inngest functions. `[VERIFIED: repo]` |
| `zod` | (already installed) | Validate Graph responses + any new event payloads | CLAUDE.md Orq/Graph boundary convention. `[VERIFIED: repo]` |
| Supabase (`createAdminClient`) | (already installed) | Persist forward_state, read verdict, write category baseline | Project stack; service-role for automation writes. `[VERIFIED: repo]` |

**No new external packages are required.** This phase is built entirely on the existing stack. The only net-new code primitives are: a `forwardMessage` Graph helper in `web/lib/outlook/client.ts`, a Stage-4 forward Inngest worker, a per-bucket gate helper, a category builder for the routing vocabulary, and the Bulk Review routing pane.

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `web/lib/pipeline-events/emit` (`emitPipelineEvent`) | repo | Stage-4 audit row (`stage:4, decision:'forwarded'/'forward_held'/...`) | Mirror Phase 117's `intent_label_written` audit emit. `[VERIFIED: repo]` |
| `web/lib/outlook/written-category-store` (`readWrittenCategory`/`recordWrittenCategory`) | repo | Anti-churn baseline for the stamped category | Reuse if the routing category needs the same never-re-PATCH idempotency Phase 117 uses. `[VERIFIED: repo]` |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `createForward` + PATCH `replyTo` + `send` (3 calls) | single-shot `POST /forward` | `/forward` is 1 call but **cannot set `replyTo`** → fails D-01. The 3-call draft flow is mandatory to make the department reply land on the original customer. `[CITED: learn.microsoft.com/.../message-createforward]` |
| Per-bucket flag as `dry_run_config` jsonb map | new `routing_destinations.forward_released` boolean column | A registry column is cleaner per-row but requires migration + codegen on every release flip and couples release-state to the taxonomy table. A `dry_run_config.stage_4_forward_buckets` jsonb map keeps release-state with the other gates, flips with a single jsonb UPDATE (no codegen), and matches the established `stage_4_handlers` map shape. **Recommended: jsonb map.** See Pattern 2. |
| New Stage-4 forward worker | extend `stage-3-dispatcher.ts` | The dispatcher is the intent→handler/Kanban router for `swarm_intents`; routing has no `swarm_intents` rows (the routing capability returns early before the ranked-intent path). A dedicated forward worker subscribed to a routing-specific event keeps the dispatcher's hard-separation intact. **Recommended: dedicated worker.** |

**Installation:** none (no new packages).

**Version verification:** No new packages added, so no registry/version verification applies. The `@zapier/zapier-sdk` + `inngest` + `zod` + `@supabase/*` deps are pre-existing and unchanged by this phase.

## Package Legitimacy Audit

> Not applicable — this phase installs **no external packages**. All work is on the pre-existing, already-vetted stack (`@zapier/zapier-sdk`, `inngest`, `zod`, Supabase client). Slopcheck gate skipped: no new dependencies to audit.

## Architecture Patterns

### System Architecture Diagram

```
                         (existing, Phase 131 — UNCHANGED)
 Zapier ingest ─▶ /api/automations/info-routing/ingest
   (writes email_pipeline.emails: source_id=Graph immutable id, raw_json, mailbox, env_id)
                         │
                         ▼
            shared coordinator (debtor-email-coordinator.ts)
              loadRoutingDestinations('info-routing') → rows  ⇒ routing capability runs
                         │
        classify-routing → buildRoutingVerdict (6-field) ─┐
        check-duplicate-delivery (two-layer) ─────────────┤
        persist-routing-verdict → coordinator_runs.decision_details.routing
                                  + pipeline_events (stage 3, TELE-01)
                         │
        isStage3RoutingGated? ──TRUE (today)──▶ mark routing_held ▶ return "predicted_held"   ◀── 131 STOPS HERE
                         │
        ════════════════ PHASE 132 RELEASES + ADDS BELOW ════════════════
                         │
        per-bucket release check (dry_run_config.stage_4_forward_buckets[bucket])
                         │
            HELD ────────┴──────── RELEASED
              │                       │
       no side-effect          emit  pipeline/forward.requested {swarm_type, email_id, run_id}
       (verdict visible              │
        in Bulk Review)              ▼
                          ┌──────────────────────────────────────────┐
                          │  Stage-4 forward worker (NEW, swarm-agnostic) │
                          │  step.run guards (replay-safe):            │
                          │   1 read verdict + forward_state           │
                          │   2 skip unrouted / null-target / dedup    │
                          │   3 skip if per-bucket held (re-check)     │
                          │   4 skip if forward_state already 'sent'   │
                          │   5 createForward → draft.id               │
                          │   6 PATCH draft replyTo = original sender  │
                          │   7 POST draft/send                        │
                          │   8 persist forward_state='sent'           │
                          │   9 categorizeEmail(source, AI: routed→X)  │
                          │  10 emitPipelineEvent(stage 4, 'forwarded')│
                          └──────────────────────────────────────────┘
                         │
                         ▼  (read path)
        [swarm]/review (RSC, swarm-generic) ─▶ detail-pane routing block
            reads decision_details.routing (6 fields) + forward_state
            operator actions: re-route / forward-now / don't-forward (server actions)
```

### Recommended Project Structure
```
web/lib/outlook/
├── client.ts                       # ADD forwardMessage() (createForward→PATCH→send)
├── routing-category.ts             # NEW: buildRoutingCategory(status, bucket) — the D-05 vocabulary
web/lib/inngest/functions/
├── stage-4-info-routing-forward.ts # NEW: swarm-agnostic forward worker (or generic name)
web/lib/pipeline-gating/dry-run-gate/
├── index.ts                        # ADD isForwardBucketReleased(swarm, bucket) helper
web/lib/automations/info-routing/
├── forward-state.ts                # NEW: idempotency record read/write (or reuse coordinator_runs)
web/app/(dashboard)/automations/[swarm]/_shell/components/
├── stage-4-decide.tsx              # EXTEND or add routing-forward block
├── (routing detail pane block)     # reads decision_details.routing + forward status
supabase/migrations/
├── 2026XXXX_phase132_forward_buckets.sql  # dry_run_config.stage_4_forward_buckets seed (all held)
```

### Pattern 1: Set `replyTo` on a forward (the D-01 three-call draft flow)
**What:** Graph's single-shot `/forward` cannot set `replyTo`. To make the department's reply go to the original customer, create a forward *draft*, PATCH its `replyTo`, then send.
**When to use:** Every routable forward in this phase.
```typescript
// Source: https://learn.microsoft.com/en-us/graph/api/message-createforward?view=graph-rest-1.0
//         + message-update (replyTo is a writable message property) + message-send
// Add to web/lib/outlook/client.ts, routed through the existing graphFetch boundary.
const enc = encodeURIComponent;

export async function forwardMessage(args: {
  mailbox: string;           // the info@ source mailbox (owns the message)
  messageId: string;         // Graph immutable id == emails.source_id
  toMailbox: string;         // resolved target_mailbox (departmental box)
  originalSender: string;    // address to set as replyTo (the customer)
  comment?: string;          // optional prepend note
}): Promise<OutlookActionResult> {
  const { mailbox, messageId, toMailbox, originalSender, comment } = args;

  // 1) createForward → 201 with a draft message {id, isDraft:true, replyTo:[]}
  const fwdRes = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(messageId)}/createForward`,
    {
      method: "POST",
      body: {
        message: { toRecipients: [{ emailAddress: { address: toMailbox } }] },
        ...(comment ? { comment } : {}),
      },
    },
  );
  if (!fwdRes.ok) return { success: false, error: `createForward ${fwdRes.status}: ${await fwdRes.text()}` };
  const draft = (await fwdRes.json()) as { id: string };

  // 2) PATCH the draft to set replyTo = original customer sender.
  const patchRes = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(draft.id)}`,
    { method: "PATCH", body: { replyTo: [{ emailAddress: { address: originalSender } }] } },
  );
  if (!patchRes.ok) return { success: false, error: `patch replyTo ${patchRes.status}: ${await patchRes.text()}` };

  // 3) Send the draft.
  const sendRes = await graphFetch(
    `/users/${enc(mailbox)}/messages/${enc(draft.id)}/send`,
    { method: "POST" },
  );
  if (!sendRes.ok) return { success: false, error: `send ${sendRes.status}: ${await sendRes.text()}` };
  return { success: true };
}
```
> Note: `createForward` requires **exactly one** of `toRecipients`-parameter OR `message.toRecipients` (both/neither → 400). Above uses `message.toRecipients`. Also: specify `comment` OR `message.body`, never both (400). `[CITED: learn.microsoft.com/.../message-createforward]`
> **Fallback (if a tenant policy blocks draft-PATCH-of-replyTo):** single-shot `POST /messages/{id}/forward` with a `comment` that surfaces the original sender (`Van: <customer>`) so the department can one-click reply-to-original via the inline-forwarded thread. Capture `originalSender` in the verdict/forward_state either way per D-01.

### Pattern 2: Per-bucket release gate (jsonb map, SWARM-02-conform)
**What:** Release forwarding one bucket at a time, registry-driven, no code branch.
**When to use:** Every forward; the default-missing entry is held.
```typescript
// Add to web/lib/pipeline-gating/dry-run-gate/index.ts.
// dry_run_config.stage_4_forward_buckets: Record<bucket, boolean>
//   value TRUE  = RELEASED (live forward)   value FALSE/MISSING = HELD (no side-effect)
// (Inverse polarity from the held-flags is OK as long as it's documented; OR
//  keep held-polarity for consistency: TRUE=held. Pick ONE and pin it in a test,
//  matching the convention the migration seeds. Recommended: mirror stage_4_handlers
//  semantics — flag present+true = blocked — to avoid a second mental model.)
export function isForwardBucketReleased(
  swarm: SwarmLikeForGate | null | undefined,
  bucket: string,
): boolean {
  const map = swarm?.dry_run_config?.stage_4_forward_buckets;
  // fail-closed: missing map or missing bucket entry → NOT released (held).
  return map?.[bucket] === true;
}
```
Seed migration sets `dry_run_config = dry_run_config || '{"stage_4_forward_buckets":{}}'` (empty map = everything held — D-04). Releasing `storingen` is one jsonb UPDATE: `... || '{"stage_4_forward_buckets":{"storingen":true}}'`. No codegen, no deploy.

### Pattern 3: Replay-safe forward with persisted idempotency (D-02 / CLAUDE.md)
**What:** Each Graph side-effect lives in its own `step.run`; a persisted `forward_state` makes re-runs/replays a no-op.
**When to use:** The whole forward worker.
```typescript
// Idempotency record options (Discretion — pick in planning):
//  (A) coordinator_runs.decision_details.routing.forward_state = 'sent'|'held'|'skipped:<reason>'
//      — co-locates with the verdict the Bulk Review pane already reads. Lowest schema cost.
//  (B) a dedicated info_routing_forwards table keyed (email_id) UNIQUE — cleanest audit.
// Either way: the "did I already send?" read + the send + the state write are
// sequenced so a replay sees state='sent' and short-circuits BEFORE createForward.
//
// CLAUDE.md replay rule: any non-deterministic id used as a DB key (e.g. a new
// forward_id) MUST be generated INSIDE step.run. The draft id from createForward
// is server-generated by Graph, so persist it inside the same step that creates it.
```
Idempotency key recommendation: `email_id` (one source mail → at most one forward). The dedup `already_addressed` short-circuit happens earlier (it's baked into the verdict), so the forward_state guard only defends against pipeline re-process / Inngest replay.

### Pattern 4: Category stamp-back vocabulary (D-05/D-06)
**What:** A stable, parseable category string written to the **source** info@ mail.
```typescript
// web/lib/outlook/routing-category.ts — pure, no IO, no swarm literal.
// Mirrors Phase 117 buildIntentCategory/mergeIntentCategory exactly.
export const AI_CATEGORY_PREFIX = "AI: "; // SAME prefix as Phase 117 so 112.5 delta-detect treats it uniformly
// Recommended vocabulary (Discretion — pin in SPEC):
//   forwarded:  `AI: routed → <bucket>`   (e.g. "AI: routed → storingen")
//   held:       `AI: held → <bucket>`     (verdict produced, bucket not yet released)
//   unrouted:   `AI: triage`              (human triage)
//   algemeen:   `AI: algemeen`            (stays in info@, no forward)
//   dedup:      `AI: routed → <bucket> (dup)`  (already addressed — informational)
export function buildRoutingCategory(status: "forwarded"|"held"|"triage"|"algemeen"|"dedup", bucket?: string): string { /* ... */ }
```
Write via the Phase-117 `mergeIntentCategory`-style strip-stale-then-append so a verdict change replaces rather than accumulates `AI:` labels. Use `categorizeEmail`'s GET-then-PATCH (append) only if you must coexist with a Phase-117 intent label on the same mail — but info-routing has no `swarm_intents`, so the strip-`AI:`-and-set approach is clean. **Caution:** if both Phase-117 (intent label) and Phase-132 (routing label) ever target the same mailbox, the two strip-`AI:` writers would clobber each other; info-routing has no intent labeling today, so this is safe — but pin a test asserting info-routing is not onboarded to `stage_3_intent_label`.

### Anti-Patterns to Avoid
- **`if (swarm_type === 'info-routing')` anywhere in the forward/dispatch path.** SWARM-02 hard gate. The forward capability must key off `routingDestinations.length > 0` + the per-bucket flag, exactly like Phase 131's routing block. A grep/static guard should assert this (Phase 110 already has a SWARM-02 static check to extend).
- **Generating the forward/idempotency id outside `step.run`.** Phase-65 replay footgun (INSERT on key-A, UPDATE on key-B). Persist the Graph draft id inside the same step that creates it.
- **Aliasing `inngest.send`.** Phase-65 `dae6276` — call `(inngest.send as unknown as SendFn)({...})` inline; never `const send = inngest.send`.
- **Single-shot `/forward` for the routable path.** Cannot set `replyTo` → breaks D-01. Use the draft flow.
- **Hand-rolling a second Graph client.** Always route through `graphFetch` (the single credential boundary + 504/socket retry). CLAUDE.md "één credential-grens".
- **PATCHing categories without GET-merge.** A bare `PATCH {categories:[...]}` overwrites; Phase 117 + `categorizeEmail` GET-then-merge to preserve user categories.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Graph auth/token | A new Graph OAuth client | `graphFetch` in `web/lib/outlook/client.ts` | Single Zapier-SDK credential boundary (connection `56014785`) + built-in 504/socket retry. CLAUDE.md mandates one credential grens. |
| 6-field verdict | Re-deriving bucket/brand/target | `coordinator_runs.decision_details.routing` | Phase 131 persists it; the forward only reads it. |
| Dedup / double-forward defense | New dedup logic | `verdict.dedup.status` (already computed) + a forward_state idempotency record | `checkDuplicateDelivery` already ran in the coordinator; re-running it is wasteful and risks drift. |
| Dry-run gate | A new boolean column / env var | `dry_run_config` jsonb + `isStageBlocked`/new `isForwardBucketReleased` | Established per-stage gate pattern; flips with a jsonb UPDATE, fail-closed. |
| Category strip/merge | Custom string surgery | Phase 117 `mergeIntentCategory` pattern | Idempotent strip-stale-`AI:`-then-append already solved + tested. |
| Bulk Review surface | A new info-routing-only page | `[swarm]/review` (already swarm-generic, un-404'd for info-routing in Phase 110) | D-07 explicitly says reuse; the page already hydrates `decision_details` per row. |
| Category dropdown / ground-truth label | Hardcoded label map | `routing_destinations.outlook_category` (per bucket×brand) | Registry already holds the human-applied ground-truth label name (ROUTE-08). |

**Key insight:** Phase 131 was deliberately engineered as the "verdict factory" and Phase 132 as the "side-effect + surface" — almost everything Phase 132 needs already exists as persisted data or reusable helpers. The genuinely new code is small: one Graph `forwardMessage` helper, one Inngest worker, one gate helper, one category builder, one detail-pane block + its server actions.

## Runtime State Inventory

> This is a side-effect-activation phase, not a rename/refactor. Still, the new forward side-effect introduces runtime state that must be enumerated so re-runs and operator actions are coherent.

| Category | Items Found | Action Required |
|----------|-------------|------------------|
| Stored data | `coordinator_runs.decision_details.routing` (verdict, written by 131) — Phase 132 ADDS a `forward_state` (and optionally a `info_routing_forwards` table). | New migration if a dedicated table is chosen (RLS + policy required per CLAUDE.md). If co-located in jsonb, no migration. |
| Live service config | `swarms.dry_run_config` (info-routing row) — held gate lives here; Phase 132 adds `stage_4_forward_buckets` map. This is DB config, in git as a migration. | One seed migration (all buckets held) + per-bucket release is a runtime jsonb UPDATE (operator-driven, NOT in git unless captured as a follow-up migration). |
| OS-registered state | None — no cron/OS registration. The forward worker is event-triggered (`pipeline/forward.requested` or the released `pipeline/predicted` path). | None — verified: no new Inngest cron, no Task Scheduler. |
| Secrets/env vars | `ZAPIER_CREDENTIALS_CLIENT_ID/SECRET` (Graph via Zapier SDK) — already set for ingest/category writes. No new secret. | None — verified: forward uses the same connection `56014785`. |
| Build artifacts | `web/lib/swarms/routing-destinations.generated.ts` (codegen). Phase 132 does NOT change the taxonomy, so no codegen change UNLESS a release is modeled as a registry column (not recommended). | None if using the jsonb-map gate; one `npm run codegen` only if `routing_destinations` schema changes. |

**Outlook-side runtime state created by the forward:** a sent forward in the target mailbox (irreversible) + a category on the source mail. The dedup guard + per-bucket held-by-default default (D-04) are the controls that keep this from firing prematurely. There is **no un-send** — hence the dry-run-first / per-bucket graduated release is the safety mechanism, not a rollback.

## Common Pitfalls

### Pitfall 1: `createForward` 400 on recipient/body ambiguity
**What goes wrong:** Passing both `toRecipients` parameter and `message.toRecipients`, or both `comment` and `message.body`, returns HTTP 400.
**Why it happens:** Graph requires exactly one of each pair.
**How to avoid:** Use only `message.toRecipients` and (optionally) `comment`. Zod-validate the 201 draft response. `[CITED: learn.microsoft.com/.../message-createforward]`
**Warning signs:** `400 Bad Request` from createForward in the worker logs.

### Pitfall 2: `recipients` column is NULL for info-routing rows
**What goes wrong:** Reading the flat `emails.recipients` for the original sender / To-CC returns null.
**Why it happens:** info-routing ingest writes `raw_json` (Graph shape) but not the flat `recipients` column (documented in `dedup.ts` Pitfall 2).
**How to avoid:** Read the original sender from `raw_json.from.emailAddress.address` (or `sender`), exactly as `dedup.ts` `extractRecipientAddresses` reads `raw_json.toRecipients/ccRecipients`. The verdict/forward must source `originalSender` from `raw_json`, not `recipients`.
**Warning signs:** `replyTo` set to empty / forward with no usable reply target. `[VERIFIED: repo dedup.ts + ingest route.ts]`

### Pitfall 3: Forwarding from the wrong mailbox id space
**What goes wrong:** `createForward` issued against the target mailbox or with a stale id 404s.
**Why it happens:** The Graph message id (`emails.source_id`) is the **info@ source mailbox's** immutable id; the forward must be `POST /users/{INFO@ mailbox}/messages/{source_id}/createForward`, not the target.
**How to avoid:** Use `emails.mailbox` (source) for the Graph path and `verdict.target_mailbox` only as the `toRecipients` value. (Phase 117's worker already resolves `mailbox` from `emails` for exactly this reason.)
**Warning signs:** 404 from createForward.

### Pitfall 4: Category clobber between Phase 117 and Phase 132
**What goes wrong:** Two strip-`AI:`-then-set writers on the same mail erase each other's label.
**Why it happens:** Both use the `AI: ` prefix and strip-stale semantics.
**How to avoid:** info-routing has no `swarm_intents` and is not onboarded to `stage_3_intent_label`, so Phase 117's worker never touches info@ mail. Pin a test asserting this. If a future phase onboards info-routing to intent labeling, switch to append-merge (keep both `AI:` labels) or namespace the prefixes.
**Warning signs:** routing category disappears after an intent-label write (won't happen today).

### Pitfall 5: Releasing a bucket also needs the held-emit path live
**What goes wrong:** Flipping a per-bucket forward flag but leaving `stage_3_routing=true` means the predicted-emit is still withheld, so the forward worker never triggers (if it's wired to the released `pipeline/predicted` path).
**Why it happens:** Two independent gates (`stage_3_routing` held-emit vs per-bucket forward release).
**How to avoid:** Decide the trigger topology in planning. **Recommended:** keep `stage_3_routing` HELD permanently for info-routing (it gates the *intent dispatcher*, irrelevant to routing) and trigger the forward worker from a **dedicated** `pipeline/forward.requested` event the coordinator emits *after persisting the verdict*, gated solely by `isForwardBucketReleased`. This decouples the two and avoids re-purposing the intent-dispatch emit. The coordinator's existing `predicted_held` return stays; add the forward-request emit before it when at least one bucket is released.
**Warning signs:** Bucket "released" but zero forwards fire.

## Code Examples

### Reading the persisted verdict + skipping non-forward outcomes (worker step 2)
```typescript
// Source: repo web/lib/automations/info-routing/verdict.ts (RoutingVerdict shape)
// The forward worker reads coordinator_runs.decision_details.routing and applies
// the three hard skips — NO bucket-name literal, all driven by verdict fields.
const v = routing as RoutingVerdict;
if (v.unrouted) return { decision: "skip:unrouted" };            // → human triage
if (v.target_mailbox === null) return { decision: "skip:stays" }; // algemeen / no-forward bucket
if (v.dedup.status === "already_addressed")                       // ROUTE-05 honored
  return { decision: `skip:dedup:${v.dedup.matched_layer}` };
```

### Category append/merge against the source (worker step 9)
```typescript
// Source: repo web/lib/outlook/client.ts categorizeEmail + Phase 117 mergeIntentCategory
const getRes = await graphFetch(`/users/${enc(sourceMailbox)}/messages/${enc(sourceId)}?$select=categories`);
const { categories = [] } = (await getRes.json()) as { categories?: string[] };
const next = [...categories.filter(c => !c.startsWith("AI: ")), buildRoutingCategory("forwarded", v.bucket)];
await graphFetch(`/users/${enc(sourceMailbox)}/messages/${enc(sourceId)}`, { method: "PATCH", body: { categories: next } });
```

### Stage-4 audit emit (worker step 10)
```typescript
// Source: repo stage-3-intent-label-worker.ts emit-audit step (Phase 117)
await emitPipelineEvent(admin, {
  swarm_type, stage: 4, email_id,
  decision: "forwarded",            // or "forward_held" / "forward_skipped"
  decision_details: { bucket: v.bucket, brand: v.brand, target_mailbox: v.target_mailbox, category: cat },
  triggered_by: "pipeline",
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Per-swarm side-effect workers with `if swarm===…` | Registry-gated capability that runs iff registry rows exist (`routingDestinations.length > 0`) | v8.0 SWARM-02 / Phase 131 | The forward worker must follow this: no swarm literal, gate on data. |
| Single `labeling_settings.dry_run` boolean | Per-stage `dry_run_config` jsonb (`stage_1_*`, `stage_3_routing`, `stage_3_intent_label`, `stage_4_handlers`) | Phase 110 / 113 / 117 | Per-bucket forward release is the next granularity step on the same column. |
| `/forward` single-shot | `createForward`→PATCH `replyTo`→`send` draft flow | this phase (to satisfy D-01) | 3 Graph calls instead of 1; required for reply-to-original. |
| Outlook category = intent (`AI: <intent>`) | Outlook category = routing outcome (`AI: routed → <bucket>`) for info-routing | this phase | Same `AI:` prefix + strip-merge mechanics as Phase 117; new vocabulary. |

**Deprecated/outdated:** Nothing to deprecate. The legacy filename `debtor-email-coordinator.ts` is the generic cross-swarm coordinator (rename tracked in a separate todo — do NOT rename in Phase 132).

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A tenant policy does NOT block PATCHing `replyTo` on a forward draft before send. Validated that Graph *supports* it (createForward returns a draft with writable `replyTo`); not validated against this specific tenant's mail-flow rules. | Pattern 1 / FWD-02 | If blocked, fall back to single-shot `/forward` + sender surfaced in comment (D-01 fallback). Add a live smoke as a Wave-0 gate. |
| A2 | The recommended per-bucket gate storage is a `dry_run_config.stage_4_forward_buckets` jsonb map (vs a registry column). | Standard Stack / Pattern 2 | If planning prefers a registry column, codegen + migration cost per release; functionally equivalent. Explicitly left to Discretion. |
| A3 | `originalSender` for `replyTo` is available from `raw_json.from.emailAddress.address` on every info-routing row. | Pitfall 2 | Some Graph message classes omit `from` (use `sender` fallback, as `getMessageMeta`/`fetchMessageBody` already do). Worker must apply the same from→sender fallback. |
| A4 | Triggering the forward via a dedicated `pipeline/forward.requested` event (decoupled from `stage_3_routing`) is cleaner than releasing the held predicted-emit. | Pitfall 5 / Pattern 3 | If planning instead releases `stage_3_routing`, the intent-dispatch path would also activate — but info-routing has no `swarm_intents`, so the dispatcher would throw on empty `ranked[]`. The dedicated-event approach avoids this entirely. STRONG recommendation. |
| A5 | The category vocabulary strings (`AI: routed → <bucket>`, etc.) are stable/parseable enough for the V10 ambient loop. | Pattern 4 / FWD-06 | Phase 134 reads these; the exact format is Discretion but MUST be pinned in 132-SPEC so Phase 134 can parse it. Low risk if pinned now. |
| A6 | No un-send / rollback exists for a forwarded mail; per-bucket graduated release + dedup are the only safety controls. | Runtime State Inventory | Correct by Graph design; the safety model is "observe in Bulk Review, release one bucket, watch, release next." |

## Open Questions

1. **Forward trigger topology — dedicated event vs released predicted-emit?**
   - What we know: the coordinator currently returns `predicted_held` and withholds `pipeline/predicted` because `stage_3_routing=true`. The OPEN path (flip to false) emits `pipeline/predicted` which the Stage-3 *intent* dispatcher consumes.
   - What's unclear: whether to (a) add a dedicated `pipeline/forward.requested` emit gated by `isForwardBucketReleased`, or (b) release `stage_3_routing` and add a forward branch to the dispatcher.
   - Recommendation: **(a) dedicated event.** info-routing has no `swarm_intents`, so routing through the intent dispatcher (`stage-3-dispatcher.ts`) would hit its `empty ranked[]` throw. A dedicated forward worker keeps hard-separation intact. (A4)

2. **Idempotency record — jsonb on the verdict vs a dedicated `info_routing_forwards` table?**
   - What we know: either works; the verdict jsonb is already read by Bulk Review.
   - What's unclear: audit/query needs for forward history (Phase 134 may want a queryable forward log).
   - Recommendation: a dedicated `info_routing_forwards` table (RLS + service-role policy per CLAUDE.md) gives Phase 134 a clean correction-event join target and a UNIQUE(email_id) idempotency key; mirror the verdict's `forward_state` into the jsonb for cheap Bulk Review reads. Decide in planning.

3. **Override/re-route semantics (D-08) — does an operator re-route re-run dedup + re-resolve the target?**
   - What we know: the stage-3 decide widget pattern exists; routing override is new.
   - What's unclear: whether a manual bucket override should re-run `resolveRoutingDestination` (to get the new target_mailbox) and whether "forward now" bypasses the per-bucket release gate.
   - Recommendation: a manual re-route writes a new verdict (operator-sourced) and "forward now" is an explicit operator action that bypasses the per-bucket gate but STILL honors dedup. Pin in SPEC.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Microsoft Graph (via Zapier SDK conn `56014785`) | forward + category PATCH | ✓ | Graph v1.0 | — (single credential boundary already used by ingest + Phase 117) |
| Inngest | Stage-4 forward worker | ✓ | project stack | — |
| Supabase service-role | verdict read, forward_state, category baseline | ✓ | project stack | — |
| info@ mailbox `Mail.ReadWrite` (forward/send permission) | createForward + send | ✓ (assumed — ingest already reads these mailboxes; send permission is the delta) | — | If send is not granted, the forward 403s → smoke must verify send scope on conn `56014785` before go-live. |

**Missing dependencies with no fallback:** none confirmed.
**Missing dependencies with fallback:** A1 (replyTo PATCH) and the `Mail.ReadWrite`/send scope on the Outlook connection — both must be confirmed by a Wave-0 live smoke against an info@ test mailbox before any bucket is released. The codebase reads these mailboxes today (ingest), so read scope is proven; **send scope is the one unverified capability** and should be the first thing the plan validates.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest (repo standard; `web/` has `*.test.ts` + `__tests__/` dirs throughout) |
| Config file | `web/vitest.config.*` (existing; info-routing already has `web/lib/automations/info-routing/__tests__/`) |
| Quick run command | `cd web && npx vitest run lib/automations/info-routing lib/outlook lib/pipeline-gating` |
| Full suite command | `cd web && npm run test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| FWD-01 | routable verdict → forward fired | unit (worker w/ mocked graphFetch) | `npx vitest run lib/inngest/functions/__tests__/stage-4-info-routing-forward.test.ts` | ❌ Wave 0 |
| FWD-02 | createForward→PATCH replyTo→send sequence with original sender | unit (graphFetch call-order assertion) | same file | ❌ Wave 0 |
| FWD-04 | `unrouted` + null-target(`algemeen`) NEVER forward (no Graph call) | unit | same file | ❌ Wave 0 |
| FWD-05 | `dedup.status='already_addressed'` → no forward | unit | same file | ❌ Wave 0 |
| FWD-03/D-04 | held bucket → no Graph call; released bucket → forward; missing entry = held | unit (gate helper) | `npx vitest run lib/pipeline-gating/dry-run-gate` | partial (extend existing dry-run-gate tests) |
| FWD-06 | category strip-merge produces `AI: routed → <bucket>`, brand-aware; preserves user categories | unit (pure) | `npx vitest run lib/outlook` | ❌ Wave 0 |
| FWD-07 | grep/static: no `swarm_type==='info-routing'` literal in forward/dispatch path | static guard | extend Phase 110 SWARM-02 static check | exists (extend) |
| FWD-08 | Bulk Review renders routing 6-field block + forward status from `decision_details.routing` | RTL | `npx vitest run app/(dashboard)/automations` | ❌ Wave 0 |
| FWD-09 | re-route / forward-now / don't-forward server actions | unit (action w/ mocked admin) | new action test | ❌ Wave 0 |
| idempotency/D-02 | replay/re-run → forward_state='sent' short-circuits (no 2nd Graph call) | unit | worker test | ❌ Wave 0 |
| A1/send-scope | LIVE: createForward→PATCH→send succeeds on info@ test mailbox | manual smoke | runbook (Wave 0 gate) | ❌ Wave 0 (BLOCKING) |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run lib/automations/info-routing lib/outlook lib/pipeline-gating lib/inngest/functions/__tests__/stage-4-info-routing-forward.test.ts`
- **Per wave merge:** `cd web && npm run test && npm run typecheck`
- **Phase gate:** full suite green + `npm run check:supabase` (RLS 0 ERROR if a new table is added) + `npm run codegen && git diff --exit-code` (no drift) before `/gsd:verify-work`.

### Wave 0 Gaps
- [ ] `lib/inngest/functions/__tests__/stage-4-info-routing-forward.test.ts` — worker: forward fires / skips / replay no-op (FWD-01/02/04/05, D-02)
- [ ] `lib/outlook/__tests__/routing-category.test.ts` — vocabulary builder + strip-merge (FWD-06)
- [ ] extend `lib/pipeline-gating/dry-run-gate/__tests__/*` — `isForwardBucketReleased` (FWD-03/D-04)
- [ ] extend the Phase-110 SWARM-02 static guard to cover the forward worker (FWD-07)
- [ ] Bulk Review routing-pane RTL test (FWD-08) + server-action tests (FWD-09)
- [ ] **BLOCKING live smoke:** createForward→PATCH replyTo→send + category PATCH on an info@ **test** mailbox to confirm send scope (A1) before any release migration ships.
- [ ] If a `info_routing_forwards` table is chosen: migration + RLS policy + `_template.sql` (CLAUDE.md), `npm run check:supabase` green.

## Security Domain

> `security_enforcement` not explicitly false in config → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | yes (Graph) | Zapier-SDK connection `56014785` (single credential boundary); no token handling in worker. |
| V4 Access Control | yes | `env_id='BX'` hard brand filter + per-bucket release gate; RLS on any new table (service-role only). |
| V5 Input Validation | yes | Zod-validate the createForward 201 draft response + any new event payload; verdict already Zod-gated upstream. |
| V6 Cryptography | no | No new crypto; secrets stay in env vars (Zapier client id/secret). |
| V7 Errors/Logging | yes | Fail-soft (return coded decision, never dead-letter a verdict — mirror Phase 117 `retries:0` + decision returns). Audit via `emitPipelineEvent` stage 4. |

### Known Threat Patterns for {Stage-4 Outlook forward}
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Double-forward on replay/re-process | Repudiation/Tampering | Persisted `forward_state` idempotency + verdict `dedup` + replay-safe ids inside `step.run` (D-02). |
| Premature forward of unproven bucket | Tampering (unwanted side-effect) | Default-held per-bucket gate (D-04); release one bucket at a time; live smoke first. |
| Mis-route leaking customer mail to wrong department | Information Disclosure | ≥85% precision gate inherited from ROUTE-08 shadow measurement; `env_id='BX'` filter; brand-aware target resolution; operator override/don't-forward (D-08). |
| replyTo set to wrong address (info@ instead of customer) | Tampering | from→sender fallback from `raw_json`; unit test asserts `replyTo` == original sender, not info@. |
| Category clobber erasing operator/AI labels | Tampering | GET-then-merge (preserve user categories); strip only `AI:` prefix; never-clobber operator edits (Phase 117 D-4.2 pattern available). |

## Project Constraints (from CLAUDE.md)

- **READ-FIRST pipeline architecture:** the RFCs (`docs/agentic-pipeline/README.md`, `stage-3-coordinator.md`) win over code inference. Stage 4 = side-effect/handler. Hard separation: a row is in exactly one of `swarm_noise_categories` (Stage 1) or `swarm_intents` (Stage 3) — routing uses neither (its own `routing_destinations` registry).
- **Inngest replay-safety:** all side-effects in `step.run`; any non-deterministic id used as a DB key generated INSIDE `step.run` (Phase 65 `dd2583a`); never alias `inngest.send` (Phase 65 `dae6276` — inline `(inngest.send as unknown as SendFn)`).
- **Supabase:** RLS mandatory on any new PostgREST-exposed table (`CREATE TABLE` + `ENABLE ROW LEVEL SECURITY` + ≥1 explicit policy; backend-only → `FOR ALL TO service_role`); never `TO anon`/`TO public USING(true)`; migrations via `supabase/migrations/` + `_template.sql`; pre-push runs `npm run check:supabase` (fails on ERROR-level advisor lint). New SECURITY DEFINER functions need `SET search_path`.
- **Registry as source of truth / codegen:** never hand-edit `*.generated.ts`; if `routing_destinations` schema changes, `npm run codegen` + `git diff --exit-code` CI gate. (This phase should NOT need codegen if the per-bucket gate is a `dry_run_config` jsonb map — A2.)
- **SWARM-02:** zero `if swarm_type==='info-routing'` branches in shared workers; variance is registry data.
- **Outlook/Graph:** all Graph calls via the single `graphFetch` boundary (Zapier SDK conn `56014785`); SPA/Graph patterns per `docs/`.
- **Workspace gate:** Phase work must run in a `/gsd-new-workspace` worktree, not on `main` (this research session is read-only and exempt; the plan/execute steps are not).
- **Test-first + environment banner** for any production-touching action; forward to a real departmental mailbox is a production write → dry-run/canary discipline (screenshots / explicit confirmation) applies to the live smoke.

## Sources

### Primary (HIGH confidence)
- Repo: `web/lib/outlook/client.ts` — `graphFetch`, `categorizeEmail` (GET-then-PATCH categories), `archiveEmail` (`/move`), `getMessageMeta`/`fetchMessageBody` (from→sender fallback). No forward helper exists yet.
- Repo: `web/lib/automations/info-routing/verdict.ts` + `dedup.ts` — the 6-field verdict + two-layer dedup (raw_json recipients, message-id/conversation cross-mailbox).
- Repo: `web/lib/inngest/functions/debtor-email-coordinator.ts` (lines 201-455) — the routing capability, verdict persist, dedup step, `isStage3RoutingGated` held path, the OPEN `pipeline/predicted` emit.
- Repo: `web/lib/inngest/functions/stage-3-intent-label-worker.ts` (Phase 117) — the canonical swarm-agnostic gated category-writer (gate → resolve message → never-clobber → idempotency → merge-PATCH → audit). The forward worker mirrors this skeleton.
- Repo: `web/lib/pipeline-gating/dry-run-gate/index.ts` — `DryRunConfig`, `isStageBlocked`, `isStage3RoutingGated`, `isHandlerBlocked` (`stage_4_handlers` jsonb map = the model for `stage_4_forward_buckets`).
- Repo: `web/lib/swarms/registry.ts` + `types.ts` + `routing-destinations.generated.ts` — `resolveRoutingDestination`, `UNROUTED_BUCKET`, `routing_destinations.outlook_category`, the 8 frozen buckets.
- Repo: `web/lib/inngest/functions/stage-3-dispatcher.ts` — why routing must NOT go through the intent dispatcher (empty `ranked[]` throw).
- Repo: `web/app/(dashboard)/automations/[swarm]/review/page.tsx` + `_shell/components/stage-*-decide.tsx` — the swarm-generic surface to extend.
- Repo: `web/app/api/automations/info-routing/ingest/route.ts` — writes `source_id` (Graph immutable id) + `raw_json` + `mailbox`; flat `recipients` NOT written (Pitfall 2).
- `.planning/phases/131-.../131-SPEC.md` — ROUTE-04/05/06/07 the forward acts on.
- `learn.microsoft.com/en-us/graph/api/message-createforward?view=graph-rest-1.0` — createForward returns a draft `message` (writable `replyTo[]`, `isDraft:true`); recipient/body 400 rules; send in a subsequent operation. `[CITED]`

### Secondary (MEDIUM confidence)
- `.planning/todos/pending/2026-05-18-granular-dry-run-gating-per-stage-and-handler.md` — per-stage/per-handler jsonb gating + review-pane dry-run chip rationale (informs D-03 + the Bulk Review chip).
- `.planning/todos/pending/2026-05-19-stage-4-layout-parity-and-detail-pane-width.md` — Stage-4 chip-strip + 540px detail-pane parity (informs D-07 layout).

### Tertiary (LOW confidence)
- WebSearch summary of createForward replyTo guidance (superseded by the WebFetch of the official doc above).

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — every helper/table already exists in-repo; the one new Graph primitive is validated against official docs.
- Architecture: HIGH — the coordinator seam, held gate, and verdict contract are read directly from Phase-131 code; the forward worker is a near-clone of the Phase-117 worker skeleton.
- Forward replyTo (D-01): MEDIUM-HIGH — Graph *supports* the draft-PATCH-send replyTo path (official doc); tenant send-scope + replyTo-PATCH policy need a live smoke (A1).
- Per-bucket gate storage (D-03): MEDIUM — jsonb-map recommended, registry-column is a viable alternative (Discretion).
- Category vocabulary (D-05): MEDIUM — mechanics proven (Phase 117); exact strings are Discretion and must be pinned in 132-SPEC for Phase 134.

**Research date:** 2026-06-17
**Valid until:** 2026-07-17 (stable — internal substrate; Graph forward API is GA/stable). Re-verify the Outlook connection send-scope if the Zapier connection `56014785` is rotated.
