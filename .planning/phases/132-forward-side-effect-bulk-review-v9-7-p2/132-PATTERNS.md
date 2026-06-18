# Phase 132: Forward side-effect + Bulk Review (V9.7 P2) - Pattern Map

**Mapped:** 2026-06-17
**Files analyzed:** 9 (6 new / 3 modified)
**Analogs found:** 9 / 9 (every new primitive is a near-clone of an existing, tested helper)

> Source of truth: 132-CONTEXT.md (D-01..D-08) + 132-RESEARCH.md (FWD-01..FWD-10, Patterns 1-4).
> The genuinely new code is small; almost everything is a copy-with-rename of a Phase-117 / Phase-131 / Phase-110 analog. Hard SWARM-02 rule: **zero `if swarm_type === 'info-routing'`** in any shared worker/dispatch path — gate on `routingDestinations.length > 0` + the per-bucket release flag.

## File Classification

| New/Modified File | New/Mod | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|---------|------|-----------|----------------|---------------|
| `web/lib/outlook/client.ts` (add `forwardMessage`) | modify | utility (Graph helper) | request-response | `categorizeEmail`/`archiveEmail` in same file | exact (same boundary) |
| `web/lib/outlook/routing-category.ts` | new | utility (pure mapper) | transform | `web/lib/outlook/intent-category.ts` (Phase 117) | exact |
| `web/lib/inngest/functions/stage-4-info-routing-forward.ts` | new | service (Inngest worker) | event-driven | `web/lib/inngest/functions/stage-3-intent-label-worker.ts` (Phase 117) | exact (skeleton clone) |
| `web/lib/pipeline-gating/dry-run-gate/index.ts` (add `isForwardBucketReleased`) | modify | utility (gate helper) | request-response | `isHandlerBlocked` / `isStage3RoutingGated` in same file | exact |
| `web/lib/automations/info-routing/forward-state.ts` | new | model (idempotency store) | CRUD | `web/lib/outlook/written-category-store.ts` (Phase 117) | exact |
| `web/lib/inngest/functions/debtor-email-coordinator.ts` (add forward-request emit) | modify | service (coordinator) | event-driven | the routing block lines 252-454 (Phase 131) | exact (extend in place) |
| `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-4-decide.tsx` (+ routing pane block) | modify | component | request-response | same file (Stage4Decide) + stage-3-decide.tsx | exact |
| `web/app/(dashboard)/automations/[swarm]/_shell/actions/override-actions.ts` (+ re-route / forward-now actions) | modify | controller (server actions) | request-response | `submitStage4Handler` in same file | exact |
| `supabase/migrations/2026XXXX_phase132_forward_buckets.sql` (+ optional `info_routing_forwards` table) | new | migration | batch | `20260615_phase117_intent_label_store_and_gate.sql` | exact |

## Pattern Assignments

### `web/lib/outlook/client.ts` — add `forwardMessage()` (utility, request-response)

**Analog:** same file — `categorizeEmail` (lines 484-513), `archiveEmail` (lines 519-540). Both route through the single `graphFetch` boundary (lines 31-82) and return `OutlookActionResult` (lines 86-89).

**Imports / boundary pattern** (lines 1-7, 84): module-level Zapier SDK boundary; `graphFetch` is the ONLY way to reach Graph (built-in 504/socket retry). Reuse `const enc = encodeURIComponent` (line 84) and the `OutlookActionResult` shape.

**Core pattern — the D-01 three-call draft flow** (RESEARCH Pattern 1; Graph single-shot `/forward` cannot set `replyTo`):
```typescript
// createForward (POST) → 201 draft {id, isDraft:true} → PATCH replyTo → POST /send.
// Recipient rule: pass ONLY message.toRecipients (NOT the top-level toRecipients param)
// and comment OR message.body — never both (Pitfall 1 → 400).
export async function forwardMessage(args: {
  mailbox: string;        // info@ SOURCE mailbox (owns the message) — see Pitfall 3
  messageId: string;      // Graph immutable id == emails.source_id
  toMailbox: string;      // verdict.target_mailbox (departmental box) — toRecipients value ONLY
  originalSender: string; // replyTo target (the customer) — from raw_json.from→sender fallback
  comment?: string;
}): Promise<OutlookActionResult> { /* createForward → PATCH replyTo → send, each non-ok → {success:false} */ }
```

**Error handling** (copy `categorizeEmail` lines 494-512): every `graphFetch` non-ok returns `{ success: false, error: \`...${res.status}: ${await res.text()}\` }` — never throws. Fallback if a tenant blocks replyTo-PATCH: single-shot `POST /messages/{id}/forward` with `comment` surfacing `Van: <customer>` (RESEARCH Pattern 1 note + A1 — gate behind a live smoke).

**Pitfall 3 (mailbox id space):** the Graph path uses `emails.mailbox` (the info@ source), `verdict.target_mailbox` is ONLY the `toRecipients` value. Forwarding against the target 404s.

---

### `web/lib/outlook/routing-category.ts` — NEW (utility, transform)

**Analog:** `web/lib/outlook/intent-category.ts` (Phase 117) — exact mechanics, new vocabulary.

**Core pattern** (copy lines 22-47 of intent-category.ts):
```typescript
export const AI_CATEGORY_PREFIX = "AI: "; // SAME prefix as Phase 117 (112.5 delta-detect treats it uniformly)
// Vocabulary (D-05 — PIN exact strings in 132-SPEC; Phase 134 parses them):
//   forwarded → `AI: routed → <bucket>`   held → `AI: held → <bucket>`
//   unrouted  → `AI: triage`              algemeen → `AI: algemeen`
//   dedup     → `AI: routed → <bucket> (dup)`
export function buildRoutingCategory(status: "forwarded"|"held"|"triage"|"algemeen"|"dedup", bucket?: string): string { /* pure */ }
```

**Strip-merge pattern** (copy `mergeIntentCategory` lines 42-47): strip EVERY entry starting with `AI_CATEGORY_PREFIX`, keep user categories in order, append the single new label. Idempotent — a verdict change replaces rather than accumulates. Pure, no IO, no swarm literal.

**Pitfall 4 (category clobber):** Phase-117's intent-label worker also strip-`AI:`-writes. info-routing has NO `swarm_intents` and is NOT onboarded to `stage_3_intent_label`, so they never touch the same mail. **Pin a test asserting info-routing is not onboarded to `stage_3_intent_label`.**

---

### `web/lib/inngest/functions/stage-4-info-routing-forward.ts` — NEW (service, event-driven)

**Analog:** `web/lib/inngest/functions/stage-3-intent-label-worker.ts` (Phase 117) — the canonical swarm-agnostic gated side-effect worker. The forward worker mirrors its skeleton step-for-step.

**Function decl + imports** (copy lines 32-56): `inngest.createFunction({ id: "...", retries: 0 }, { event: "pipeline/forward.requested" }, async ({ event, step }) => {...})`. `retries: 0` — failures surface as a coded decision, never a cascading retry. Import `graphFetch`, `loadSwarm`, the new gate helper, `emitPipelineEvent`, `createAdminClient`, `buildRoutingCategory`.

**Gate-first step** (copy lines 60-68, swap helper): `step.run("check-bucket-release", ...)` → `isForwardBucketReleased(swarmRow, bucket)`; if not released return `{ decision: "held" }` (no Graph call). Fail-closed.

**Resolve message step** (copy lines 73-91): read `email_pipeline.emails` `source_id, mailbox, raw_json`; `source_id` → Graph id, `mailbox` → source info@ box. Read `originalSender` from `raw_json.from.emailAddress.address` with `sender` fallback (RESEARCH A3 / Pitfall 2 — flat `recipients` is NULL for info-routing rows). Legacy row missing either → fail-soft `{ decision: "unresolved" }`.

**The three hard skips** (RESEARCH Code Examples — NO bucket-name literal, all verdict-field-driven):
```typescript
const v = routing as RoutingVerdict;            // from coordinator_runs.decision_details.routing
if (v.unrouted) return { decision: "skip:unrouted" };
if (v.target_mailbox === null) return { decision: "skip:stays" };   // algemeen / no-forward
if (v.dedup.status === "already_addressed") return { decision: `skip:dedup:${v.dedup.matched_layer}` };
```

**Idempotency short-circuit** (mirror lines 118-126 + write-state below): read `forward-state` for `email_id`; if already `'sent'` short-circuit BEFORE `createForward`. The Graph draft id is server-generated — persist it INSIDE the same `step.run` that creates it (CLAUDE.md replay rule; Phase 65 footgun).

**Side-effect steps** (each its own `step.run`, replay-safe): createForward→PATCH replyTo→send via `forwardMessage` → persist `forward_state='sent'` → category stamp (next) → audit emit.

**Category stamp step** (copy lines 132-144 — GET-then-merge-PATCH):
```typescript
const getRes = await graphFetch(`/users/${enc(mailbox)}/messages/${enc(graphId)}?$select=categories`);
const { categories = [] } = (await getRes.json()) as { categories?: string[] };
const next = [...categories.filter(c => !c.startsWith("AI: ")), buildRoutingCategory("forwarded", v.bucket)];
await graphFetch(`/users/${enc(mailbox)}/messages/${enc(graphId)}`, { method: "PATCH", body: { categories: next } });
```

**Audit step** (copy lines 160-178, stage 4):
```typescript
await emitPipelineEvent(admin, {
  swarm_type, stage: 4, email_id,
  decision: "forwarded",  // or "forward_held" / "forward_skipped"
  decision_details: { bucket: v.bucket, brand: v.brand, target_mailbox: v.target_mailbox, category: cat },
  triggered_by: "pipeline",
}); // wrapped in try/catch — audit is best-effort, never dead-letters a successful forward
```

**Anti-pattern guards (RESEARCH):** never alias `inngest.send` (use `(inngest.send as unknown as SendFn)({...})` inline — Phase 65 `dae6276`); generate any DB-key id inside `step.run`; no `swarm_type === 'info-routing'` branch (extend the Phase-110 SWARM-02 static guard to cover this worker).

---

### `web/lib/pipeline-gating/dry-run-gate/index.ts` — add `isForwardBucketReleased()` (utility, request-response)

**Analog:** same file — `isHandlerBlocked` (lines 105-110, reads `stage_4_handlers` jsonb map) and `isStage3RoutingGated` (lines 95-99).

**DryRunConfig extension** (mirror the `stage_4_handlers?: Record<string, boolean>` field line 60): add `stage_4_forward_buckets?: Record<string, boolean>`.

**Helper** (RESEARCH Pattern 2 — fail-closed, mirror `isHandlerBlocked` polarity):
```typescript
// RECOMMEND mirroring stage_4_handlers semantics to avoid a second mental model:
// keep ONE polarity and pin it in a test matching what the migration seeds.
// Fail-closed: missing map / missing bucket entry → NOT released (held).
export function isForwardBucketReleased(swarm: SwarmLikeForGate | null | undefined, bucket: string): boolean {
  const map = swarm?.dry_run_config?.stage_4_forward_buckets;
  return map?.[bucket] === true;
}
```

**Convention comment:** document the polarity in the JSDoc exactly like lines 11-15 / 36-47 do (TRUE/FALSE/MISSING semantics). Extend `__tests__/dry-run-gate*` (FWD-03/D-04: held → no call, released → forward, missing entry = held).

---

### `web/lib/automations/info-routing/forward-state.ts` — NEW (model, CRUD)

**Analog:** `web/lib/outlook/written-category-store.ts` (Phase 117) — exact admin-select + upsert-on-conflict shape.

**Pattern** (copy lines 22-77): `const TABLE = "info_routing_forwards"`; `recordForwardState(admin, {email_id, status, draft_id?, target_mailbox})` upserts `{ onConflict: "email_id" }`; `readForwardState(admin, email_id)` returns null (NOT throw) when absent. Service-role client passed in as a param; no swarm literal. RECOMMEND a dedicated table (RESEARCH OQ-2 — gives Phase 134 a clean correction-event join + UNIQUE(email_id) idempotency); mirror `forward_state` into `decision_details.routing` for cheap Bulk Review reads.

> Discretion (RESEARCH OQ-2): co-locating state in `coordinator_runs.decision_details.routing.forward_state` (no migration) is the lower-cost alternative. Planner decides; if a table is chosen this file backs it.

---

### `web/lib/inngest/functions/debtor-email-coordinator.ts` — add forward-request emit (service, event-driven)

**Analog:** the Phase-131 routing block in this same file (lines 252-454). The verdict, dedup, persistence, and held gate ALREADY exist — Phase 132 adds ONE emit.

**Trigger topology (RESEARCH Pitfall 5 / A4 — STRONG recommendation):** keep `stage_3_routing` HELD permanently (it gates the intent dispatcher, irrelevant to routing — routing through `stage-3-dispatcher.ts` would hit its empty-`ranked[]` throw). Instead emit a DEDICATED `pipeline/forward.requested` event AFTER `persist-routing-verdict` (lines 372-390), gated solely by `isForwardBucketReleased`. The existing `predicted_held` return (line 420) stays; add the forward-request emit before it when the verdict's bucket is released.

**Emit pattern** (copy the `emit-predicted-routing` step lines 436-453, rename event + payload): inside `step.run`, `inngest.send({ name: "pipeline/forward.requested", data: { swarm_type, run_id, email_id, ... } })`. `run_id` is the replay-safe id resolved at lines 192-197 — reuse it, do NOT regenerate.

---

### `web/app/(dashboard)/automations/[swarm]/_shell/components/stage-4-decide.tsx` — add routing pane block (component, request-response)

**Analog:** same file (`Stage4Decide` lines 59-202) + `stage-3-decide.tsx` for the override/decide widget shape.

**Patterns to copy:**
- Client-component shell: `"use client"`, `useState`/`useTransition`, `useSelection()` → `markPendingRemoval` (lines 21-66).
- `slot === null` placeholder branch (lines 90-98) → render the routing 6-field verdict (bucket/brand/target_mailbox/confidence/dedup/unrouted) + forward status (held / forwarded / unrouted / dedup-skipped) read from the hydrated row's `decision_details.routing` (FWD-08).
- Submit pattern (lines 105-133): `startTransition(async () => { const result = await <action>(...); if (result.ok) markPendingRemoval(...) else setError(...) })`. Reuse for the D-08 operator controls: re-route (bucket override), forward-now, don't-forward.
- The route surface (`review/page.tsx`) is ALREADY swarm-generic (un-404'd for info-routing in Phase 110, lines 71-79) and hydrates `decision_details` per row — no page change needed beyond surfacing the routing pane.

> Layout reference: `.planning/todos/pending/2026-05-19-stage-4-layout-parity-and-detail-pane-width.md` (chip-strip + 540px detail-pane parity) + Skill `sketch-findings-bulk-review-flow-ux`.

---

### `web/app/(dashboard)/automations/[swarm]/_shell/actions/override-actions.ts` — add re-route / forward-now / don't-forward (controller, request-response)

**Analog:** same file — `submitStage4Handler` (referenced by stage-4-decide.tsx lines 113-125).

**Patterns to copy:** server action signature returning `{ ok: true } | { ok: false; error }`; service-role admin client; the out-of-band guarantee (Stage-4 actions do NOT import `@/lib/inngest/*` — enforced by the static grep guard in `override-actions.test.ts`). EXCEPTION for 132: "forward now" must trigger the forward — RESEARCH OQ-3 recommends it bypasses the per-bucket gate but STILL honors dedup; a manual re-route writes a new operator-sourced verdict. **Pin this in 132-SPEC** and reconcile with the out-of-band static guard (the forward action may need to live in a path the guard exempts, or emit via a server-side route — planner decides).

---

### `supabase/migrations/2026XXXX_phase132_forward_buckets.sql` — NEW (migration, batch)

**Analog:** `20260615_phase117_intent_label_store_and_gate.sql` (the two-part store+gate-seed migration) + `supabase/migrations/_template.sql`.

**Part 1 — seed `stage_4_forward_buckets` (jsonb `||` merge, NOT replace)** — copy lines 64-79:
```sql
UPDATE public.swarms
   SET dry_run_config = dry_run_config || jsonb_build_object('stage_4_forward_buckets', '{}'::jsonb),
       updated_at = now()
 WHERE swarm_type = 'info-routing';   -- empty map = everything HELD (D-04). Releasing a bucket = one jsonb UPDATE, no codegen.
```

**Part 2 (OPTIONAL — only if a dedicated `info_routing_forwards` table is chosen)** — copy the full table+RLS block lines 33-62:
1. `CREATE TABLE IF NOT EXISTS ... (email_id uuid PRIMARY KEY, ...)`
2. `ALTER TABLE ... ENABLE ROW LEVEL SECURITY;`
3. `..._service_all FOR ALL TO service_role USING(true) WITH CHECK(true);`
4. `..._auth_select FOR SELECT TO authenticated USING(true);` (Bulk Review reads it)
5. anon — intentionally NO policy.

`BEGIN; ... COMMIT;` wrapper. NO codegen needed (jsonb-map gate, not a registry column — RESEARCH A2). If a table is added: `npm run check:supabase` must be 0-ERROR before merge.

## Shared Patterns

### Graph credential boundary (apply to: `forwardMessage`, worker category stamp)
**Source:** `web/lib/outlook/client.ts` `graphFetch` (lines 31-82) — single Zapier-SDK connection `56014785` + 504/socket retry. NEVER hand-roll a second Graph client (CLAUDE.md "één credential-grens").

### Inngest replay-safety (apply to: forward worker, coordinator emit)
**Source:** `debtor-email-coordinator.ts` `resolve-run-id` step (lines 192-197) + CLAUDE.md. All side-effects in `step.run`; any DB-key id generated INSIDE `step.run`; never alias `inngest.send` (Phase 65 `dae6276`).

### Fail-closed dry-run gate (apply to: `isForwardBucketReleased`, worker gate step)
**Source:** `dry-run-gate/index.ts` (lines 72-110). Missing swarm / config / flag → blocked/held. `dry_run_config` jsonb `||` merge for seeds (preserve existing flags).

### Strip-`AI:`-then-set category write (apply to: routing-category.ts, worker stamp step)
**Source:** `intent-category.ts` `mergeIntentCategory` (lines 42-47) + `stage-3-intent-label-worker.ts` write step (lines 132-144). GET-then-merge-PATCH preserves user categories, strips stale `AI:`.

### RLS-mandatory new table (apply to: migration if `info_routing_forwards` chosen)
**Source:** `20260615_phase117_intent_label_store_and_gate.sql` (lines 33-62) + `supabase/migrations/_template.sql`. CREATE → ENABLE RLS → service_role FOR ALL → authenticated FOR SELECT → no anon. `npm run check:supabase` gate.

### SWARM-02 zero-literal (apply to: worker, coordinator emit, all dispatch)
**Source:** `debtor-email-coordinator.ts` routing block keys off `routingDestinations.length > 0` (line 252), never a `swarm_type` literal. Extend the Phase-110 SWARM-02 static guard to cover the forward worker (FWD-07).

## No Analog Found

None. Every Phase-132 primitive has a direct, recent, tested in-repo analog. The single net-new Graph capability (`forwardMessage` createForward→PATCH→send) has no in-repo forward helper but reuses the established `graphFetch` boundary + `OutlookActionResult` shape, and is validated against the official Graph `message-createforward` doc (RESEARCH Sources). The one unverified runtime capability is **Graph send-scope on connection `56014785`** — a BLOCKING Wave-0 live smoke (RESEARCH Environment Availability + A1), not a missing pattern.

## Metadata

**Analog search scope:** `web/lib/outlook/`, `web/lib/inngest/functions/`, `web/lib/pipeline-gating/dry-run-gate/`, `web/lib/automations/info-routing/`, `web/app/(dashboard)/automations/[swarm]/{review,_shell}/`, `supabase/migrations/`.
**Files scanned (read in full or targeted):** client.ts, stage-3-intent-label-worker.ts, dry-run-gate/index.ts, verdict.ts, dedup.ts, debtor-email-coordinator.ts (routing block 180-455), written-category-store.ts, intent-category.ts, stage-4-decide.tsx, review/page.tsx, 20260615_phase117 migration.
**Project skills present:** `sketch-findings-bulk-review-flow-ux` (Bulk Review UX — relevant to D-07 pane), `sketch-findings-agent-workforce`, `spike-findings-agent-workforce`, `supabase-postgres-best-practices`.
**Pattern extraction date:** 2026-06-17
