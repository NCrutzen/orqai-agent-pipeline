# Phase 55: Debtor-email pipeline hardening - Research

**Researched:** 2026-04-24
**Domain:** Node/Next.js server code + Inngest workers + Supabase migrations + Playwright-on-Browserless + v7 Kanban UI
**Confidence:** HIGH (entirely repo-local domain; Context7/web search add no value here)

## Summary

This phase is a **production-hardening pass**, not a greenfield build. All affected code, schemas, patterns and agents already live in the repo. Research for planning is therefore primarily: (a) reconciling CONTEXT.md decisions with what is ALREADY in the codebase, (b) surfacing one real decision conflict the planner must resolve up-front, and (c) nailing the file-level inventory so the planner can write task-precise instructions.

Four bundles: **(A)** multi-mailbox refactor of 3 hardcoded call-sites, **(B)** `createIcontrollerDraft` idempotency + HTML-comment marker + cleanup-on-verdict, **(C)** review-lane provenance chips + Zapier whitelist + status hygiene + generic verdict-route, **(D)** `agent_runs` schema + 👍/👎 verdict-UI as Phase 1 self-training hooks.

**Primary recommendation:** Plan opens with a *Decision Reconciliation* task (Wave 0) to resolve the `public.agent_runs` vs already-shipped `debtor.agent_runs` conflict and the `mailbox_id: number` vs shipped `icontroller_company: string` ambiguity BEFORE any code task runs. Everything else is straightforward edit-in-place work along known call-sites.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**agent_runs schema & versioning**
- **Nieuwe generieke table `public.agent_runs`** met `swarm_type` discriminator (`'debtor-email' | 'sales-email' | ...`). Sales-swarm komt over ~5 dagen; abstractie vanaf day 1.
- Kern-kolommen universeel: `id uuid pk, swarm_type text, email_id uuid, automation_run_id uuid, intent text, sub_type text, document_reference text, confidence text, tool_outputs jsonb, draft_url text, body_version text, intent_version text, human_verdict text null, human_notes text null, verdict_reason text null, verdict_set_at timestamptz null, context jsonb, created_at timestamptz default now()`.
- **Versioning = short git-sha** (bv. `body_version = "a1b2c3d"`). CI-check op bump bij prompt-edit optioneel als follow-up.
- Indexen: `(email_id, created_at desc)`, partial `where human_verdict is null`, `swarm_type` voor filter.
- FK: `email_id → email_pipeline.emails(id) on delete cascade`; `automation_run_id → public.automation_runs(id)` voor Zapier-ingest → swarm-bridge → agent-run join.
- Swarm-specifieke velden gaan in `context jsonb` (debtor-email: `{graph_message_id, icontroller_draft_url, entity}`).

**Review-UI surface**
- v7 Kanban card "Human review" kolom behoudt bestaande `Open review` button pattern.
- **Generieke verdict-route `/automations/review/[runId]`** — polymorfe preview-component op basis van `swarm_type`.
- Layout: subject + sender + draft-preview (eerste 300 chars + link naar iController draft) + `👍 / 👎` + **verplichte** reason-dropdown bij 👎 (`wrong_intent | wrong_attachment | wrong_language | wrong_tone | rejected_other`).
- Query: `SELECT * FROM agent_runs WHERE human_verdict IS NULL AND swarm_type = $1 ORDER BY created_at DESC LIMIT 50`. Geen pagination in MVP.
- Auth: bestaande Supabase-session. Geen bulk-approve in MVP.

**Whitelist policy & status hygiene**
- **Primary = Zapier ingest Zap.** Extra filter-step: sender-domain ∈ `{smeba.nl, sicli-noord.be, sicli-sud.be, berki.nl, smeba-fire.be, firecontrol.*}` → door naar classifier (ipv `skipped_not_whitelisted`).
- Forward-header extractie in Zapier Formatter (regex op body).
- **Defense-in-depth in code (1-liner):** in `web/lib/automations/swarm-bridge/configs.ts` `deriveEntityStage` map `status: "skipped_not_whitelisted" → stage: "skipped"` (nooit `"review"`).
- Log-waarschuwing als ingest-route alsnog `skipped_not_whitelisted` binnenkrijgt.

**Provenance chips** (7 labels, persisted als `automation_run.result.review_reason` array bij write-tijd)

| Chip | Trigger |
|---|---|
| `regex:unknown` | `predicted.rule === "no_match"` |
| `regex:low-conf` | rule matched, `confidence < 0.8` |
| `llm:low-conf` | intent-agent `confidence < threshold` |
| `llm:no-intent` | intent-agent result `"other"` / unactionable |
| `ingest:skipped-leak` | `skipped_not_whitelisted` dat tóch review raakte |
| `forward:intra-company` | gevangen door Zapier whitelist-rule |
| `draft:pending` | copy-document sub-agent heeft draft in iController |

Render in `kanban-job-card.tsx`: aparte dim-rij onder bestaande tag-chips (`text-muted-foreground text-xs`); max 2 chips + `+N` overflow; warning-tint voor `llm:low-conf` + `ingest:skipped-leak`; success voor `draft:pending`; rest neutraal.

**createDraft idempotency & operator marker**
- **Idempotency key:** `(graph_message_id, entity)` — géén body-hash.
- **Nieuwe table `debtor.icontroller_drafts`:** `id uuid, graph_message_id text, entity text, agent_run_id uuid fk, icontroller_draft_url text, icontroller_message_id text, created_at, deleted_at, operator_verdict text null` met `UNIQUE(graph_message_id, entity)`. Retry: `INSERT ... ON CONFLICT DO NOTHING RETURNING id` — lege return = skip Browserless.
- **Operator marker = HTML-comment in draft body:** `<!-- MR-AUTOMATION-DRAFT v1 run=<agent_runs.id> do-not-edit-above -->`.
- iController custom field afgeschreven.

**Multi-mailbox refactor**
- Vervang constant `ICONTROLLER_COMPANY` in 3 files door **`mailbox_id: number`** uit `debtor.labeling_settings.icontroller_mailbox_id`:
  - `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts:22,101`
  - `web/lib/debtor-email/icontroller-catchup.ts:22,180,204,222`
  - `web/app/(dashboard)/automations/debtor-email-review/actions.ts:15`
- URL-constructie: `/messages/index/mailbox/${mailbox_id}` — één iController-tenant (`walkerfire.icontroller.eu`).
- **Mailbox-IDs:** smeba=4, smeba-fire=5, firecontrol=12, sicli-noord=15, sicli-sud=16, berki=171.
- Functie-signatures accepteren `mailbox_id: number` — oude `company: string` parameter volledig verwijderen.

**Rollout & fallback**
- Gefaseerd: Smeba (4) → Smeba-Fire (5) dry-run → FireControl (12) dry-run → Berki/Sicli-Noord/Sicli-Sud dry-run.
- Acceptance per mailbox voor flip: ≥14 dagen clean cleanup-worker run + spot-check 20 samples dry-run + expliciete go.
- Default fallback bij NULL `icontroller_mailbox_id`: **hard error** in ingest-route + cleanup-worker. Geen silent fallback naar Smeba.

### Claude's Discretion
- Exacte schema-naam voor agent_runs (public vs eigen schema) — RLS-impact tijdens planning bepalen.
- Kolomtypes (text vs enum voor `swarm_type`, `human_verdict`).
- Verdict-UI styling consistent met v7 design tokens.
- Chip-kleurtokens uit bestaand v7 design-system.
- Indexen-finetuning (covering-index voor review-queue).

### Deferred Ideas (OUT OF SCOPE)
- Self-training Phase 2 — iController body-diff scan, wekelijkse Orq experiments, prompt-iteratie.
- Bulk-approve in verdict-UI.
- Filter-UI op review_reason chips.
- Pagination op verdict-queue.
- Retro-active verdict-seeding voor pre-review-UI drafts.
- CI-check op version-bumps.
- Custom iController-field voor operator marker.
- Bulk-review page scope-uitbreiding (Phase 57+).
</user_constraints>

<phase_requirements>
## Phase Requirements

Phase 55 is outside the V7.0 requirement matrix in `.planning/REQUIREMENTS.md` (those are AUTH/NAV/GRAPH/KAN etc. — V7 dashboard scope). The phase's "requirements" are the four bundles A–D in CONTEXT.md, sourced from four todos. Mapping:

| Bundle | Source todo | Research support |
|---|---|---|
| **A) Multi-mailbox refactor** | `.planning/phases/55-.../todos/2026-04-23-cleanup-worker-multi-mailbox.md` | Exact call-sites inventoried below; `ICONTROLLER_MAILBOXES` constant already exists at `web/lib/automations/debtor-email/mailboxes.ts`; ingest-route pattern for reading `labeling_settings` already in place |
| **B) createDraft idempotency + marker + cleanup** | Referenced: `.planning/todos/pending/2026-04-23-create-draft-idempotency-and-cleanup.md` (NOT FOUND on disk — see Open Questions) | Idempotency-via-unique-constraint pattern precedent: `orqai-trace-sync.ts:25`; `debtor.automation_state` circuit-breaker already exists (migration 20260423) as sibling table |
| **C) Review-lane provenance + whitelist + status hygiene + verdict-route** | Referenced: `.planning/todos/pending/2026-04-23-debtor-review-pipeline-provenance-and-scoping.md` (NOT FOUND on disk — see Open Questions) | `deriveTags` + `deriveAgent` in `swarm-bridge/configs.ts` are the single edit-point; kanban card chip overflow pattern live at `kanban-job-card.tsx:218-238` |
| **D) agent_runs schema + verdict-UI (self-training Phase 1)** | `.planning/phases/55-.../todos/2026-04-23-self-training-loop-debtor-email-swarm.md` §Phase 1 | **Schema already partly shipped** in migration `20260423_debtor_agent_runs.sql` — but as `debtor.agent_runs`, NOT the `public.agent_runs` decided in CONTEXT.md. This is the #1 planner blocker. |

</phase_requirements>

## Standard Stack

All non-negotiable per `CLAUDE.md`. This phase touches only the layers below — no new dependency additions required.

### Core (already installed)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `next` | 16.1.6 | App Router for `/automations/review/[runId]` + server actions | Vercel-first stack |
| `@supabase/supabase-js` | ^2.99 | Service-role writes (ingest, agent_runs inserts) | `createAdminClient()` already helper-wrapped |
| `@supabase/ssr` | ^0.9 | Session auth on verdict page | Existing dashboard auth pattern |
| `inngest` | ^3.52 | Cleanup worker, per-step durability | Already powers cleanup-cron shard dispatcher |
| `playwright-core` | ^1.58 | iController browser automation (draft create + cleanup) | MUST be `playwright-core`, never `playwright` |
| `zod` | ^4.3 | Request validation (verdict endpoint + swarm-bridge payload shape) | Used across existing API routes |
| `vitest` | (devDep) | Test framework | `npm run test` = `vitest run` |

### Supporting
| Library | Purpose | When |
|---------|---------|------|
| `@dnd-kit/*` | Kanban drag-n-drop (unchanged) | Chips ride inside existing card; no dnd changes |
| `sonner` | Toast on verdict submit | Match existing optimistic UI pattern |
| `lucide-react` | Icons on verdict page (`ThumbsUp`, `ThumbsDown`, `ExternalLink`) | Matches existing kanban card `ExternalLink` import |

### Alternatives Considered (and rejected per CONTEXT.md)
| Instead of | Could Use | Why rejected |
|---|---|---|
| `public.agent_runs` discriminator | Separate `debtor.agent_runs` + future `sales.agent_runs` | Sales-swarm is 5 days out; abstracting later requires a painful migration |
| HTML-comment operator marker | iController custom field | Per-tenant custom-field config not wanted; HTML comment is tenant-free |
| Body-hash idempotency | `(graph_message_id, entity)` composite | Body can differ per prompt version; business identity = message+entity |
| Code-layer whitelist | Zapier Formatter step | CLAUDE.md Zapier-first mandate; code gets a defense-in-depth 1-liner only |

## Architecture Patterns

### Project Structure (existing — untouched)
```
web/
├── app/
│   ├── (dashboard)/automations/
│   │   ├── debtor-email-review/       # existing bulk-review (regex training)
│   │   └── review/[runId]/            # NEW — generic verdict route (Bundle C + D)
│   └── api/automations/
│       ├── debtor-email/ingest/       # ingest route (already reads labeling_settings)
│       └── debtor/verdict/            # NEW — POST verdict from UI
├── components/v7/kanban/
│   └── kanban-job-card.tsx            # EDIT — add review_reason chip dim-row + generic review link
├── lib/
│   ├── automations/
│   │   ├── debtor-email/mailboxes.ts  # existing ICONTROLLER_MAILBOXES constant
│   │   ├── debtor-email-cleanup/      # EDIT — browser.ts signature: mailbox_id
│   │   ├── icontroller/               # session layer (untouched)
│   │   └── swarm-bridge/configs.ts    # EDIT — deriveTags/deriveEntityStage
│   ├── debtor-email/
│   │   ├── classify.ts                # UNCHANGED (only read)
│   │   └── icontroller-catchup.ts     # EDIT — mailbox_id from per-row result
│   └── inngest/functions/
│       └── debtor-email-icontroller-cleanup-worker.ts  # EDIT — mailbox_id per row
└── supabase/migrations/
    └── 20260424_phase55_*.sql         # NEW — see Schema section
```

### Pattern 1: Idempotency via unique constraint + `ON CONFLICT DO NOTHING RETURNING id`

Repo precedent: `web/lib/inngest/functions/orqai-trace-sync.ts:25`.

```typescript
// createIcontrollerDraft guard (new table debtor.icontroller_drafts)
const { data } = await admin
  .from("icontroller_drafts")
  .insert({
    graph_message_id: msgId,
    entity,
    agent_run_id: runId,
  })
  .select("id")
  .maybeSingle();          // null = conflict hit, row exists, skip Browserless

if (!data) {
  return { skipped: "already_drafted" };
}
// proceed to Browserless create-draft, then UPDATE with icontroller_draft_url
```

**Key:** wrap the Browserless call so that failure AFTER the sentinel row is inserted sets `tool_outputs.draft_error`, not a duplicate row. On next retry, the sentinel row is found → skip. Requires a reconcile path (see Common Pitfalls).

### Pattern 2: Swarm-bridge tag derivation (single edit point)

`web/lib/automations/swarm-bridge/configs.ts` is the **only** place the UI-visible chips are derived. The current `deriveTags` returns one category tag. Extension: append `review_reason` values from `run.result.review_reason` (written by ingest-route + intent-agent). The kanban card reads `SwarmJob.tags` — no schema change to `automation_runs`.

### Pattern 3: Inngest per-step idempotency

`docs/inngest-patterns.md` + `docs/orqai-patterns.md` §9. All side-effects in `step.run()`. The create-draft flow should be ONE step that:
1. acquires sentinel row (idempotent)
2. opens Browserless
3. inserts HTML-comment marker in draft body
4. updates sentinel with `icontroller_draft_url`
5. UPDATEs `debtor.agent_runs` status to `copy_document_drafted`

### Pattern 4: v7 Kanban chip overflow

Existing card derives tags from priority + `job.tags[]` + `next:*` prefix. Overflow = `+N` pill (see `kanban-job-card.tsx:122-124, 218-238`). Provenance chips MUST render in a SECOND dim-row (per CONTEXT.md) — NOT inside the existing `visible` array. Strategy: add a `reviewReasonChips` array derived from `job.description` JSON blob (or a new `SwarmJob.reviewReason: string[]` field surfaced by `deriveTags` — planner to choose), render below existing row with `text-[11px] text-[var(--v7-faint)]`.

### Anti-Patterns to Avoid
- **Hand-rolled idempotency keys via in-memory sets** — lost on cold start. Always use unique constraint.
- **Writing verdicts directly from kanban card** — card is drag-handle; keep verdict flow on dedicated `/review/[runId]` page (prevents accidental click-through during drag).
- **Embedding reviewer email in HTML comment** — PII leak risk; use `agent_runs.id` UUID only.
- **Relying on `networkidle` when navigating `walkerfire.icontroller.eu`** — SPA; use `waitUntil: "domcontentloaded"` (see `docs/browserless-patterns.md`).

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Unique-insert race | App-level `SELECT then INSERT` | Postgres `UNIQUE` constraint + `ON CONFLICT DO NOTHING` | Atomic; cold-start-safe; already repo pattern |
| Prompt versioning | Semver + changelog file | Short git-sha from `git rev-parse --short HEAD` at build time | CONTEXT.md locks this; aligns with commit discipline |
| Draft body marker parsing | Regex over HTML body in UI | Parse on PHASE 2 (out of scope); just WRITE the HTML comment consistently in Phase 55 | Deferred |
| Whitelist in code | TypeScript `Set<string>` of domains | Zapier Formatter step; code has 1-line defense-in-depth only | CLAUDE.md Zapier-first |
| Review-queue pagination | Hand-rolled offset/limit | Skip entirely (CONTEXT.md "no pagination MVP") | Volume <50; add when justified |
| Schema migration via CLI | `supabase db push` | Supabase Management API (token in repo env) | STATE.md notes the CLI-less convention |

**Key insight:** Every problem in this phase has a repo-local precedent. No new third-party tooling.

## Common Pitfalls

### Pitfall 1: Sentinel row inserted but Browserless crashes mid-draft
**What goes wrong:** `debtor.icontroller_drafts` row exists with NULL `icontroller_draft_url` and no `deleted_at`. Next retry sees the sentinel, skips — but no draft exists in iController. Ghost row.
**Why it happens:** Idempotency via unique constraint is only half the pattern without a reconcile path.
**How to avoid:** Either (a) use a two-phase write — `created_at=null` placeholder then `UPDATE` after Browserless confirms, OR (b) add a "claimed_at older than 15 min AND draft_url IS NULL" expiry path in the cleanup-worker that DELETEs the sentinel so a later retry can re-create. Planner: pick one and task it explicitly.
**Warning sign:** `icontroller_drafts` rows with `icontroller_draft_url IS NULL` older than N minutes.

### Pitfall 2: `ICONTROLLER_COMPANY` removal breaks `browser.ts:EmailIdentifiers.company`
**What goes wrong:** `deleteEmailOnPage` takes `EmailIdentifiers { company, from, subject, receivedAt }`. If we replace `company: string` with `mailbox_id: number` at the top-level but keep the `company` field in the param object, half the files will still pass a string slug.
**Why it happens:** 3 files were the listed refactor targets, but `browser.ts:14-23` is the TYPE contract.
**How to avoid:** Plan a task that FIRST changes `EmailIdentifiers` (add `mailbox_id: number`, deprecate `company`), THEN cascades through the 3 callers. Screenshot label strings at `browser.ts:372,440` (`preview-before-delete-${email.company}`) must swap to `${email.mailbox_id}`.
**Warning sign:** tsc passes but screenshots land in wrong folders.

### Pitfall 3: `public.agent_runs` vs already-shipped `debtor.agent_runs` schema conflict
**What goes wrong:** Migration `20260423_debtor_agent_runs.sql` already created `debtor.agent_runs` with a DEBTOR-specific shape (no `swarm_type`, entity check-constraint limited to 5 debtor brands). CONTEXT.md locks a DIFFERENT schema in `public` with `swarm_type` discriminator. Blindly running a "create public.agent_runs" migration produces TWO tables.
**Why it happens:** CONTEXT gathering happened same-day as migration write-up; decisions out of sync.
**How to avoid:** Wave 0 decision task — either (a) drop+recreate `debtor.agent_runs` as `public.agent_runs` (data loss acceptable if not yet populated), (b) rename/view-alias, or (c) override CONTEXT.md and keep `debtor.agent_runs` debtor-only (reject genericization). Planner MUST get user confirmation before writing the migration.
**Warning sign:** `SELECT table_schema, table_name FROM information_schema.tables WHERE table_name LIKE '%agent_runs%'` returns both rows.

### Pitfall 4: `mailbox_id` vs `icontroller_company` column ambiguity
**What goes wrong:** The ingest route (route.ts:162-186) already reads `labeling_settings.icontroller_company` (string slug like `"smebabrandbeveiliging"`). CONTEXT.md says the refactor should use `labeling_settings.icontroller_mailbox_id` (integer). But that column does NOT exist yet in `labeling_settings` — only `icontroller_company` does.
**Why it happens:** The `ICONTROLLER_MAILBOXES` map lives in TypeScript (`mailboxes.ts`), not in Supabase.
**How to avoid:** Planner must either (a) add an `icontroller_mailbox_id int` column to `debtor.labeling_settings` via Phase 55 migration AND backfill all 6 rows, OR (b) derive `mailbox_id` in-app via the TS constant keyed on `source_mailbox`. Option (a) is cleaner and matches CONTEXT.md; option (b) is zero-migration but keeps mailbox IDs fragmented.
**Warning sign:** Search for `icontroller_mailbox_id` returns only TS files, no SQL.

### Pitfall 5: Shadow DOM + SPA navigation in iController draft creation
**What goes wrong:** Composing a draft in iController uses a rich-text editor in a shadow root. `.fill()` silently fails; `.evaluate()` is required. Navigation to `/messages/index/mailbox/{id}` with `waitUntil: "networkidle"` hangs indefinitely.
**Why it happens:** `docs/browserless-patterns.md` documents both traps — repeat offenders.
**How to avoid:** When inserting the HTML-comment operator marker, use `page.evaluate()` to set `innerHTML` on the editor contentEditable, NOT `fill()`. Always `waitUntil: "domcontentloaded"` on SPA URLs.
**Warning sign:** Draft created without marker / draft body empty in iController.

### Pitfall 6: Worker-index staggering regression in cleanup-worker
**What goes wrong:** `debtor-email-icontroller-cleanup-worker.ts:79-81` has a carefully-tuned 1.5s × workerIndex stagger to avoid Browserless thundering-herd. A refactor touching the same function can accidentally drop this.
**Why it happens:** Function body is ~100 lines; easy to refactor-overwrite.
**How to avoid:** Keep the `if (workerIndex > 0)` sleep block as-is; only swap the `company: ICONTROLLER_COMPANY` reference. Reviewer checks stagger still present.
**Warning sign:** Multiple `w0/w1/w2` Inngest runs failing within same millisecond timestamp.

### Pitfall 7: `skipped_not_whitelisted` leak → review lane
**What goes wrong:** If Zapier filter is buggy, a `skipped_not_whitelisted` row hits `automation_runs` and `deriveEntityStage` (if not mapped) may default to `review`. Clutters reviewer queue.
**Why it happens:** Default switch-case fallthrough in status mapping.
**How to avoid:** Explicit map entry in `swarm-bridge/configs.ts` AND a `console.warn("ingest:skipped-leak", {runId})` so we see if it's happening.
**Warning sign:** `ingest:skipped-leak` chip ever appearing on a review card (it shouldn't exist in steady state).

## Code Examples

### Multi-mailbox: reading `mailbox_id` per row in cleanup-worker

```typescript
// web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts
// BEFORE (line 22, 101):
const ICONTROLLER_COMPANY = "smebabrandbeveiliging";
// ...
const icRes = await deleteEmailOnPage(session.page, session.cfg, {
  company: ICONTROLLER_COMPANY,
  from: r.from, subject: r.subject, receivedAt: r.received_at,
});

// AFTER:
// `row.result` already carries `icontroller_company` from ingest route;
// add `icontroller_mailbox_id` alongside (needs migration + ingest update).
const mailboxId = r.icontroller_mailbox_id;
if (!mailboxId) {
  throw new Error(`row ${row.id} missing icontroller_mailbox_id — hard error per rollout policy`);
}
const icRes = await deleteEmailOnPage(session.page, session.cfg, {
  mailbox_id: mailboxId,
  from: r.from, subject: r.subject, receivedAt: r.received_at,
});
```

### HTML-comment operator marker injection

```typescript
// Inside Browserless page context, after composing draft body HTML:
const marker = `<!-- MR-AUTOMATION-DRAFT v1 run=${agentRunId} do-not-edit-above -->`;
const composedHtml = `${marker}\n${generatedBodyHtml}`;

// iController rich-text editor = shadow-root contentEditable.
// Fill() won't work — use evaluate().
await page.evaluate((html) => {
  const editor = document.querySelector<HTMLElement>(
    /* captured selector from 2026-04-22 probe */
  );
  if (!editor) throw new Error("editor not found");
  editor.innerHTML = html;
  editor.dispatchEvent(new InputEvent("input", { bubbles: true }));
}, composedHtml);
```

### Idempotent create-draft sentinel

```sql
-- supabase/migrations/20260424_phase55_icontroller_drafts.sql
create table if not exists debtor.icontroller_drafts (
  id uuid primary key default gen_random_uuid(),
  graph_message_id text not null,
  entity text not null,
  agent_run_id uuid references public.agent_runs(id) on delete set null,
  icontroller_draft_url text,
  icontroller_message_id text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  operator_verdict text,
  unique (graph_message_id, entity)
);
```

```typescript
// Idempotent entry point:
const { data, error } = await admin
  .from("icontroller_drafts")
  .insert({ graph_message_id, entity, agent_run_id })
  .select("id")
  .maybeSingle();
if (error && error.code !== "23505") throw error; // 23505 = unique_violation
if (!data) return { status: "skipped_already_drafted" };
// → proceed to Browserless; on failure, call reconcile path (delete sentinel)
```

### Provenance chip derivation in swarm-bridge

```typescript
// web/lib/automations/swarm-bridge/configs.ts
function deriveReviewReasons(runs: AutomationRun[]): string[] {
  const reasons = new Set<string>();
  for (const run of runs) {
    const r = run.result as Record<string, unknown> | null;
    const explicit = Array.isArray(r?.review_reason) ? r!.review_reason : [];
    for (const tag of explicit) if (typeof tag === "string") reasons.add(tag);

    // Derive from predicted if ingest-route didn't write them:
    const predicted = r?.predicted as { rule?: string; confidence?: number } | undefined;
    if (predicted?.rule === "no_match") reasons.add("regex:unknown");
    else if (typeof predicted?.confidence === "number" && predicted.confidence < 0.8) {
      reasons.add("regex:low-conf");
    }
    if (run.status === "skipped_not_whitelisted") reasons.add("ingest:skipped-leak");
  }
  return Array.from(reasons);
}
```

### Verdict page route shell

```typescript
// web/app/(dashboard)/automations/review/[runId]/page.tsx
export default async function VerdictPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = await params;
  const supabase = await createServerClient();
  const { data: run } = await supabase
    .from("agent_runs")
    .select("*")
    .eq("id", runId)
    .maybeSingle();
  if (!run) notFound();
  // polymorphic preview by run.swarm_type
  return <VerdictShell run={run} />;
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|---|---|---|---|
| Hardcoded `ICONTROLLER_COMPANY` at top of 3 files | Per-row `mailbox_id` from `labeling_settings` | Phase 55 (this phase) | Enables 6-mailbox rollout |
| `debtor.agent_runs` schema (shipped 2026-04-23) | `public.agent_runs` with `swarm_type` discriminator | Phase 55 decision | Planner must reconcile (see Pitfall 3) |
| iController custom field for draft marker (considered) | HTML-comment in draft body | Phase 55 CONTEXT | No per-tenant config |
| Body-hash idempotency (considered) | `(graph_message_id, entity)` composite UNIQUE | Phase 55 CONTEXT | Stable across prompt versions |
| Code-layer domain whitelist | Zapier Formatter step + 1-line code defense | Phase 55 CONTEXT | CLAUDE.md Zapier-first |
| Inline iController delete from review action | Deferred row → Inngest cleanup cron | Already shipped pre-Phase 55 | Keep untouched; just swap mailbox field |

**Deprecated/outdated:**
- `ICONTROLLER_COMPANY` constant (3 files) — remove entirely; do not keep as fallback (CONTEXT.md: hard error on NULL).
- `LEGACY_DEFAULT_ICONTROLLER_COMPANY` fallback at `ingest/route.ts:406` — should also go once all 6 rows have `icontroller_company` filled in.

## Open Questions

1. **Which `agent_runs` wins: `debtor.agent_runs` (shipped) or `public.agent_runs` (CONTEXT.md)?**
   - What we know: migration already shipped `debtor.agent_runs` on 2026-04-23 with debtor-specific constraints (entity enum, status state-machine enum). CONTEXT.md decided `public.agent_runs` with generic `swarm_type` discriminator.
   - What's unclear: whether user wants to (a) drop+migrate `debtor.agent_runs` → `public.agent_runs`, (b) keep `debtor.agent_runs` debtor-only and ADD `public.agent_runs` as generic parent, or (c) override CONTEXT.md and stay debtor-scoped.
   - Recommendation: Wave 0 decision-confirm task from planner. Default: drop `debtor.agent_runs` (no production data yet per STATE.md — swarm not launched) and create `public.agent_runs` per CONTEXT.md.

2. **`icontroller_mailbox_id` column — add to `labeling_settings` now or derive from TS map?**
   - What we know: `ICONTROLLER_MAILBOXES` TS map has all 6 IDs. `debtor.labeling_settings` has `icontroller_company` (string) but NOT `icontroller_mailbox_id` (int).
   - What's unclear: CONTEXT.md says "read `mailbox_id` from `debtor.labeling_settings.icontroller_mailbox_id`" — but that column needs to be created.
   - Recommendation: Phase 55 migration adds `icontroller_mailbox_id int` + backfills from TS map + marks ingest-route to read BOTH until legacy `icontroller_company` callers are gone.

3. **Two source todos referenced by CONTEXT.md are missing on disk:**
   - `2026-04-23-create-draft-idempotency-and-cleanup.md` and `2026-04-23-debtor-review-pipeline-provenance-and-scoping.md` are cited in CONTEXT.md §canonical_refs but are NOT in `.planning/todos/pending/` or `.planning/phases/55-.../todos/`.
   - What we know: CONTEXT.md fully encodes the decisions from those todos.
   - Recommendation: rely on CONTEXT.md as the source of truth; note the todos as "decision already captured, file missing" in the PLAN.

4. **Sales-swarm timing — does this phase need to ship before sales swarm starts?**
   - What we know: STATE.md says sales-swarm "~5 days out". `public.agent_runs` with `swarm_type` is the whole reason to generalize now.
   - What's unclear: if sales-swarm slips, do we still need to generalize? Answer is likely yes (reversing is worse), but worth confirming.
   - Recommendation: proceed with generalization regardless.

5. **HTML-comment marker — do ALL existing drafts-in-flight need backfill?**
   - CONTEXT.md explicitly defers "retro-active verdict-seeding" but is silent on retro-marker injection.
   - Recommendation: skip; Phase 2 body-diff scan can use `agent_run_id` FK on `icontroller_drafts` for post-hoc join.

## Validation Architecture

### Test Framework
| Property | Value |
|---|---|
| Framework | Vitest (configured in `web/package.json`) |
| Config file | `web/vitest.config.ts` (implied — confirmed test suite exists) |
| Quick run command | `cd web && npx vitest run <path>` |
| Full suite command | `cd web && npm test` (= `vitest run`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|---|---|---|---|---|
| A.1 | `deleteEmailOnPage` accepts `mailbox_id: number`, rejects old `company` key at type level | type-check | `cd web && npx tsc --noEmit` | ✅ (tsc run exists) |
| A.2 | cleanup-worker throws hard error when `row.result.icontroller_mailbox_id` is null | unit | `npx vitest run web/lib/inngest/__tests__/cleanup-worker-multi-mailbox.test.ts` | ❌ Wave 0 |
| A.3 | `icontroller-catchup.ts` reads per-row mailbox_id from `automation_runs.result` | unit | `npx vitest run web/lib/debtor-email/__tests__/catchup-multi-mailbox.test.ts` | ❌ Wave 0 |
| B.1 | `icontroller_drafts` unique constraint rejects duplicate (graph_message_id, entity) | integration (supabase) | `npx vitest run web/lib/automations/icontroller/__tests__/drafts-idempotency.test.ts` | ❌ Wave 0 |
| B.2 | `maybeSingle()` returns null on conflict → Browserless skipped | unit | same as B.1 | ❌ Wave 0 |
| B.3 | HTML-comment marker is inserted with correct `run=<uuid>` format | unit (string) | `npx vitest run web/lib/automations/icontroller/__tests__/draft-marker.test.ts` | ❌ Wave 0 |
| B.4 | Sentinel reconcile path: orphan sentinel >15min with NULL draft_url is reclaimable | integration | `npx vitest run web/lib/automations/icontroller/__tests__/drafts-reconcile.test.ts` | ❌ Wave 0 |
| C.1 | `deriveTags` emits correct provenance chips for each of 7 triggers | unit | `npx vitest run web/lib/automations/swarm-bridge/__tests__/provenance-chips.test.ts` | ❌ Wave 0 |
| C.2 | `deriveEntityStage` maps `skipped_not_whitelisted` → `skipped` (never `review`) | unit | same as C.1 | ❌ Wave 0 |
| C.3 | `/automations/review/[runId]` page loads for a debtor-email run-id with 200 status | integration | manual smoke (browser) + `npx vitest run web/app/.../__tests__/review-page.test.tsx` | ❌ Wave 0 |
| C.4 | Verdict POST endpoint rejects 👎 without reason (zod validation) | unit | `npx vitest run web/app/api/automations/debtor/verdict/__tests__/route.test.ts` | ❌ Wave 0 |
| D.1 | `public.agent_runs` migration creates table + indexes + RLS | migration-test | manual SQL via Management API — see `docs/supabase-patterns.md` | manual-only |
| D.2 | Inngest writes to `public.agent_runs` with `swarm_type='debtor-email'` on classify-intent | integration | `npx vitest run web/lib/inngest/functions/__tests__/debtor-agent-run-write.test.ts` | ❌ Wave 0 |
| D.3 | Kanban card renders provenance chip dim-row below existing tag row, max 2 visible + `+N` | component | `npx vitest run web/components/v7/kanban/__tests__/kanban-job-card.test.tsx` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd web && npx vitest run <nearest test file>`
- **Per wave merge:** `cd web && npm test && npx tsc --noEmit`
- **Phase gate:** Full suite green before `/gsd:verify-work` + manual smoke: run ONE draft end-to-end in `smeba` (mailbox_id=4) with a planted test email, verify idempotency on retry, confirm HTML-comment in iController draft.

### Wave 0 Gaps
- [ ] `web/lib/inngest/__tests__/cleanup-worker-multi-mailbox.test.ts` — covers A.2
- [ ] `web/lib/debtor-email/__tests__/catchup-multi-mailbox.test.ts` — covers A.3
- [ ] `web/lib/automations/icontroller/__tests__/drafts-idempotency.test.ts` — covers B.1 + B.2
- [ ] `web/lib/automations/icontroller/__tests__/draft-marker.test.ts` — covers B.3
- [ ] `web/lib/automations/icontroller/__tests__/drafts-reconcile.test.ts` — covers B.4
- [ ] `web/lib/automations/swarm-bridge/__tests__/provenance-chips.test.ts` — covers C.1 + C.2
- [ ] `web/app/(dashboard)/automations/review/[runId]/__tests__/review-page.test.tsx` — covers C.3
- [ ] `web/app/api/automations/debtor/verdict/__tests__/route.test.ts` — covers C.4
- [ ] `web/lib/inngest/functions/__tests__/debtor-agent-run-write.test.ts` — covers D.2
- [ ] `web/components/v7/kanban/__tests__/kanban-job-card.test.tsx` — covers D.3 (extend if exists)
- [ ] Shared fixture: minimal `debtor.labeling_settings` seed + `public.agent_runs` row factory in `web/lib/__tests__/fixtures/phase55.ts`

## Sources

### Primary (HIGH confidence — direct repo reads)
- `.planning/phases/55-debtor-email-pipeline-hardening/55-CONTEXT.md` — locked decisions
- `.planning/phases/55-debtor-email-pipeline-hardening/todos/2026-04-23-cleanup-worker-multi-mailbox.md`
- `.planning/phases/55-debtor-email-pipeline-hardening/todos/2026-04-23-self-training-loop-debtor-email-swarm.md`
- `supabase/migrations/20260423_debtor_agent_runs.sql` — already-shipped schema (decision conflict source)
- `supabase/migrations/20260423_mailbox_settings_expansion.sql` — current `labeling_settings` shape
- `web/lib/automations/debtor-email/mailboxes.ts` — `ICONTROLLER_MAILBOXES` constant
- `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts` — refactor target 1
- `web/lib/debtor-email/icontroller-catchup.ts` — refactor target 2
- `web/app/(dashboard)/automations/debtor-email-review/actions.ts` — refactor target 3
- `web/lib/automations/debtor-email-cleanup/browser.ts` — `EmailIdentifiers` type (must update)
- `web/lib/automations/swarm-bridge/configs.ts` — chip derivation edit point
- `web/app/api/automations/debtor-email/ingest/route.ts` — existing `icontroller_company` reader
- `web/components/v7/kanban/kanban-job-card.tsx` — UI edit point
- `web/package.json` — Vitest test framework confirmation
- `CLAUDE.md` — stack rules (Zapier-first, `playwright-core`, service-role writes)
- `docs/browserless-patterns.md` — SPA + shadow-DOM pitfalls
- `docs/inngest-patterns.md` — step.run semantics
- `docs/supabase-patterns.md` — service-role writes

### Secondary (MEDIUM — implied but not read in full this pass)
- `docs/orqai-patterns.md` §9 — Inngest-per-step vs agent-as-tool pattern
- `docs/swarm-bridge-contract.md` — stage/status mapping convention

### Tertiary (LOW)
- None. This phase is entirely repo-local; no external verification required.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all libraries already in `package.json`, versions locked
- Architecture: HIGH — every pattern has a repo precedent
- Pitfalls: HIGH — sourced from existing code comments and docs
- Schema reconciliation: MEDIUM — depends on user clarifying Pitfall 3 before planner writes migration

**Research date:** 2026-04-24
**Valid until:** 2026-05-08 (14 days — fast-moving sub-project; sales-swarm may reshape abstractions)
