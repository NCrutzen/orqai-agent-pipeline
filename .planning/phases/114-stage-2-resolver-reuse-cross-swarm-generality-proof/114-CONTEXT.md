# Phase 114: Stage 2 Resolver Reuse — cross-swarm generality proof - Context

**Gathered:** 2026-06-04
**Status:** Ready for planning

<domain>
## Phase Boundary

Sales-email Stage 2 resolves customers by reusing the v8.2 NXT resolver via per-swarm config (`swarms.stage2_entity_resolver` + `resolution_config`) — the concrete cross-swarm generality proof (STAGE2-01: zero Engine code changes for the sales onboarding, verified by a no-Engine-diff check). The debtor-only self-auth tier degrades to a no-op for sales (STAGE2-02); customer-less prospects fall through to Stage 3 without blocking.

**Re-sequenced 2026-06-04: this phase executes BEFORE Phase 113** — the customer-resolved corpus feeds Stage 3 intent seeding (customer-vs-prospect axis). The v8.2 RESL dependency therefore sits on the critical path and is resolved by decision D-01 below.

**Data ground (2026-06-04 corpus analysis, 1,273 inbound verkoop@):** 32% offerte-subjects, 27% number references, 75% business domains (2% freemail), ≥44% external-domain overlap with debiteuren@ senders (lower bound), 23% own-tenant forwards carrying the real customer in the quoted body.

</domain>

<decisions>
## Implementation Decisions

### Seam-landing strategy (the critical-path decision)
- **D-01:** **Enabler-PR to main.** Cherry-pick the RESL-03 subset from `origin/workspace/v8.2-resolution-recall` (Phase 90, commits `a5fcc921` + supporting): `web/lib/swarms/dynamic.ts` (loadStage2Resolver, static dispatch map, 60s TTL cache, kill-switch via registry column), `web/lib/agentic-pipeline/resolve/engine.ts` + `config.ts` (generic engine), and the `resolve-debtor.ts` config+adapter refactor (behaviour-neutral, 28/28 tests green on that branch). The v8.2 SQL-substrate cutover (zapier.dbo procs, cutover migration — HELD on that branch) stays in the debtor track and is NOT part of the enabler-PR.
- **D-02:** Coordination: operator self-coordinates (author of both tracks). The enabler-PR MUST leave a note/todo in the v8.2 workspace STATE that `workspace/v8.2-resolution-recall` (39 ahead / 233 behind main) must rebase after the enabler merge — the cherry-picked subset becomes a no-op on rebase.
- **D-03 (Claude's discretion):** Whether the seam lands dormant (debtor worker keeps its static import; sales = first dispatch consumer) or the debtor Stage 2 worker rewire (commit `803eee0d`) comes along. Default recommendation: dormant — lowest risk to the live debtor path. IF planning chooses the full rewire: the 90-06 equality dry-run harness + a debtor regression gate are MANDATORY in the same PR.

### Sales resolution layers
- **D-04:** Identifier set is **data-driven, not hand-curated** (extends the locked 2026-05-19 "vocabulary emerges from data" principle to identifiers). Research/first plan includes a corpus-mining task over the 1,273 mails: which identifier kinds actually occur, at what frequency, and which NXT lookups exist per kind.
- **D-05:** Confirmed starting identifier kinds: **offertenummer** (quote → account), **ordernummer** (order → account), **factuurnummer** (invoice → paying customer — lookup already exists in debtor layer 3, reusable), **postcode/adres → NXT Sites** (installation addresses are called "Sites" in NXT; CTO-confirmed). Candidates for mining: klant-/debiteurnummer, customer PO number, project/werkbon.
- **D-06:** **Multi-match corroboration** (CTO requirement): multiple independent signals (e.g., sender domain + offertenummer + Site postcode) corroborate to raise confidence. ⚠️ The current engine is precedence-order + single-hit short-circuit. RESEARCH QUESTION: can `resolution_config` express corroboration, or does the engine need a generic corroboration capability? If engine work is needed, it MUST land in/right-after the enabler-PR — BEFORE the no-Engine-diff measurement for the sales onboarding starts, so STAGE2-01 stays intact.
- **D-07:** **Internal forwards (23%): quoted-sender extraction.** When the sender is an own-tenant domain, extract the original sender address from the quoted body and feed THAT to sender_match. Conforms to the locked principle that internal forwards carry context — never filter them.
- **D-08 (Claude's discretion):** thread_inheritance for sales — generically reusable once prior sales resolutions exist; planner decides whether it's in iteration 1.
- **D-09:** Prospects with no NXT match → `unresolved`, fall through to Stage 3 without blocking (roadmap-locked, STAGE2-02).

### NXT lookup transport
- **D-10:** New sales lookups (offerte, order, Sites) go through the **`nxtRequest` REST proxy** (`web/lib/automations/nxt-zapier/nxt-client.ts`, docs/nxt-rest-access.md) — no new Zap per lookup kind, faster iteration on identifier types, one auth path. **Prereq: PR #63 (feat/nxt-rest-proxy-mcp) merged + prod-deployed** (open as of 2026-06-04).
- **D-11:** Existing debtor lookups (sender_match, factuurnummer via nxt-zap-client/Zapier SQL) are reused as-is where the engine config points at them — no forced migration of working lookups.

### Audit target & review surface
- **D-12:** Sales Stage 2 resolutions land in a **new generic, swarm-agnostic resolution table** (NOT a mirror of debtor.email_labels, which is debtor-specific). Schema choice (sales vs email_pipeline vs other) at planner discretion. Ships as migration + RLS (per CLAUDE.md pattern: ENABLE RLS + service_role policy minimum) + `npm run codegen` atomically. Every subsequent swarm reuses this table — registry principle extended to resolution audit.
- **D-13 (Claude's discretion):** Bulk Review Stage 2-tab wiring for sales rows — the tab exists (Phase 110); planner decides how the generic table feeds it.

### Prereq fixes (folded todos)
- **D-14:** Ingest gaps are in-phase prereq work, fix-forward minimum; backfill decisions per todo acceptance criteria:
  - `has_attachments` never captured (false on all 1,273; raw_json null) — attachment presence/metadata must be ingested for new mail.
  - 28% of rows missing `sender_email` (354/1,273) — root cause + fix forward; resolution-denominator metrics MUST correct for this gap while it exists.

### Claude's Discretion
- D-03 (dormant seam vs full rewire), D-08 (thread_inheritance in iteration 1), D-13 (Stage 2-tab wiring), generic-table schema placement (D-12).

### Folded Todos
- `2026-06-04-sales-ingest-attachments-gap.md` — attachment capture gap; fits as Stage 2 input-quality prereq (PO's/offertes in bijlagen zijn resolutie-signaal).
- `2026-06-04-sales-ingest-sender-email-gap.md` — sender_email null on 28%; blocks sender_match layer and any honest resolution-rate measurement.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Architecture (locked RFC — always wins over code-shape inference)
- `docs/agentic-pipeline/README.md` — v8.0 5-stage funnel, Stage 2→3 contract index, swarm shapes
- `docs/agentic-pipeline/context-shape-contract.md` — `PipelineStageContext` Stage 2→3 contract (`context_version: 1`); the resolved customer must flow to Stage 3 in this shape
- `docs/debtor-email-pipeline-architecture.md` — debtor implementation map (the donor swarm for reuse)

### v8.2 donor code (on `origin/workspace/v8.2-resolution-recall`, NOT in this worktree)
- `web/lib/swarms/dynamic.ts` @ commit `a5fcc921` — loadStage2Resolver seam (static dispatch map; fully-dynamic import() breaks on Vercel bundlers)
- `web/lib/agentic-pipeline/resolve/engine.ts` + `config.ts` @ same branch — generic engine + debtorP0Config
- `web/lib/agentic-pipeline/resolve/__tests__/self-auth-noop.test.ts` @ same branch — existing no-op degradation test pattern (STAGE2-02 acceptance test seed)
- Commits `803eee0d` (worker rewire — D-03 scope question), `c2c9d3cf` (90-06 equality dry-run harness)

### NXT access
- `docs/nxt-rest-access.md` — nxtRequest, token-harvest, env-split secrets, read-only prod (POST-reads need allowWrite:true)
- `web/lib/automations/nxt-zapier/nxt-client.ts` — in-process client (D-10 transport)
- `web/lib/automations/debtor-email/nxt-zap-client.ts` — existing Zapier SQL lookups (D-11 reuse)

### Current Stage 2 implementation (this worktree)
- `web/lib/inngest/functions/stage-2-customer-resolver.ts` — current debtor-coupled worker (event name, debtor.email_labels write, dry-run gate pattern)
- `web/lib/automations/debtor-email/resolve-debtor.ts` — 4-layer pipeline pre-refactor (the contract types are the LOCKED public surface)
- `web/lib/swarms/registry.ts` — loadSwarm cache discipline that dynamic.ts mirrors

### Planning state
- `.planning/ROADMAP.md` Phase 114 section (re-sequenced 2026-06-04) — success criteria + critical-path note
- `.planning/REQUIREMENTS.md` STAGE2-01/02

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- v8.2 branch: complete seam + generic engine + adapter refactor (D-01 donor — cherry-pick, don't rebuild)
- `resolveDebtor` 4-layer pipeline incl. llm-tiebreaker + resolver-trace: becomes config+adapter post-enabler; sales gets its own `resolution_config`-driven EngineConfig
- `nxtRequest` REST proxy + MCP server (`tools/nxt-mcp/`): transport for new lookups (D-10)
- Factuurnummer lookup (`lookupIdentifierToAccount`): reusable for sales invoice-question mail (D-05)
- Dry-run gating (`isStageBlocked`, `swarms.dry_run_config`): sales row already has all stages blocked — Stage 2 needs its own gate key decision at planning time
- Bulk Review per-stage tabs (Phase 110): Stage 2 tab exists for sales rows

### Established Patterns
- Registry-as-source-of-truth + migration + codegen atomically; never hand-edit `*.generated.ts`
- Zero per-swarm branches in shared workers (SWARM-02 static guard exists since 110-01)
- Inngest replay-safety: non-deterministic values inside step.run; never destructure inngest.send
- RLS mandatory on every new table (migration template `supabase/migrations/_template.sql`)

### Integration Points
- `classifier-screen-worker` / classifier-verdict flow emits the Stage 2 request event (currently debtor event name `debtor-email/stage-2.customer-resolve.requested` — event naming for sales is a planning decision under the Phase 88.1 stage-named convention)
- Stage 2 → Stage 3 hand-off via `PipelineStageContext` (context-shape-contract.md)
- `email_pipeline.emails` is the corpus source (mailbox=verkoop@smeba.nl, direction=inbound)

</code_context>

<specifics>
## Specific Ideas

- CTO: "multi matchen om de zekerheid te verhogen" — corroboration across independent signals is an explicit wish, not an optimization afterthought (D-06)
- CTO: installation addresses are **Sites** in NXT — postcode/address → Site → account lookup (D-05)
- Operator: identifier discovery must mirror the intent-vocabulary principle — mine the corpus, don't hand-curate (D-04)

</specifics>

<deferred>
## Deferred Ideas

- **Sales Stage 4 Handler: concept-draft in Outlook** — sales-equivalent of createIcontrollerDraft; carry the idempotency lesson from todo `2026-04-23-create-draft-idempotency-and-cleanup.md` (side-effect idempotency, not just LLM determinism). Belongs in V11.0 (Stage 4 handlers are explicitly out of V9.0 scope).

### Reviewed Todos (not folded)
- `2026-04-23-create-draft-idempotency-and-cleanup.md` — debtor/iController territory; matched on keywords only. For sales, the eventual analog is the deferred Outlook-draft handler above.

</deferred>

---

*Phase: 114-stage-2-resolver-reuse-cross-swarm-generality-proof*
*Context gathered: 2026-06-04*
