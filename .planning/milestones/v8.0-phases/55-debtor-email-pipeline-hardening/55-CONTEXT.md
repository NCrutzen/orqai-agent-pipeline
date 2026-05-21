# Phase 55: Debtor-email pipeline hardening - Context

**Gathered:** 2026-04-23
**Status:** Ready for planning

<domain>
## Phase Boundary

Production-harden de debtor-email pipeline zodat het intent + copy-document swarm veilig alle debtor-mailboxen kan bedienen (swarm-launch blocker). Vier bundels in scope:

- **A) Multi-mailbox support** — vervang hardcoded `ICONTROLLER_COMPANY` in cleanup-worker, catchup en review-actions door per-row `mailbox_id` uit `debtor.labeling_settings`.
- **B) createIcontrollerDraft hardening** — idempotency, cleanup en operator marker.
- **C) Review-lane fixes** — whitelist intra-company forwards (Zapier), status hygiene, provenance chips, generieke verdict-route.
- **D) Self-training Phase 1 hooks** — `public.agent_runs` schema (generiek, swarm-type discriminator) + minimale 👍/👎 verdict-UI, vanaf dag 1 in place om retro data-engineering te voorkomen.

Phase 2 self-training loop (body-diff scan, wekelijkse Orq experiments), bulk-approve en filter-UI zijn expliciet out of scope en staan in `<deferred>`.

</domain>

<decisions>
## Implementation Decisions

### agent_runs schema & versioning

- **Nieuwe generieke table `public.agent_runs`** met `swarm_type` discriminator (`'debtor-email' | 'sales-email' | ...`). Sales-swarm komt over ~5 dagen; abstractie vanaf day 1.
- Kern-kolommen universeel: `id uuid pk, swarm_type text, email_id uuid, automation_run_id uuid, intent text, sub_type text, document_reference text, confidence text, tool_outputs jsonb, draft_url text, body_version text, intent_version text, human_verdict text null, human_notes text null, verdict_reason text null, verdict_set_at timestamptz null, context jsonb, created_at timestamptz default now()`.
- **Versioning = short git-sha** (bv. `body_version = "a1b2c3d"`). CI-check op bump bij prompt-edit optioneel als follow-up.
- Indexen: `(email_id, created_at desc)`, partial `where human_verdict is null`, `swarm_type` voor filter.
- FK: `email_id → email_pipeline.emails(id) on delete cascade`; `automation_run_id → public.automation_runs(id)` voor Zapier-ingest → swarm-bridge → agent-run join.
- Swarm-specifieke velden gaan in `context jsonb` (debtor-email: `{graph_message_id, icontroller_draft_url, entity}`).

### Review-UI surface

- **v7 Kanban card "Human review" kolom** behoudt bestaande `Open review` button pattern (zie screenshot 2026-04-23).
- **Generieke verdict-route `/automations/review/[runId]`** — polymorfe preview-component op basis van `swarm_type`. Debtor-email eerst, sales-email plugs-in zonder schema-wijziging.
- Layout per row: subject + sender + draft-preview (eerste 300 chars + link naar iController draft) + `👍 / 👎` buttons + **verplichte** reason-dropdown bij 👎 (`wrong_intent | wrong_attachment | wrong_language | wrong_tone | rejected_other`).
- Query: `SELECT * FROM agent_runs WHERE human_verdict IS NULL AND swarm_type = $1 ORDER BY created_at DESC LIMIT 50`. Geen pagination in MVP.
- Auth: bestaande Supabase-session. Geen bulk-approve in MVP.

### Whitelist policy & status hygiene

- **Primary = Zapier ingest Zap** (user-decision 2026-04-23). Extra filter-step: sender-domain ∈ `{smeba.nl, sicli-noord.be, sicli-sud.be, berki.nl, smeba-fire.be, firecontrol.*}` → laat door naar classifier (ipv `skipped_not_whitelisted`). Exacte FireControl-domain in planning vaststellen.
- Forward-header extractie in Zapier Formatter (regex op body) — originele externe sender wordt gebruikt voor classify wanneer forward-marker aanwezig.
- **Defense-in-depth in code (1-liner):** `web/lib/automations/swarm-bridge/configs.ts` `deriveEntityStage` map `status: "skipped_not_whitelisted" → stage: "skipped"` (nooit `"review"`).
- Log-waarschuwing als ingest-route alsnog `skipped_not_whitelisted` binnenkrijgt (Zap buggy indicator).

### Provenance chips

Chip-set (7 labels, persisted als `automation_run.result.review_reason` array bij write-tijd):

| Chip | Trigger |
|---|---|
| `regex:unknown` | `predicted.rule === "no_match"` |
| `regex:low-conf` | rule matched, `confidence < 0.8` |
| `llm:low-conf` | intent-agent `confidence < threshold` |
| `llm:no-intent` | intent-agent result `"other"` / unactionable |
| `ingest:skipped-leak` | `skipped_not_whitelisted` dat tóch review raakte |
| `forward:intra-company` | gevangen door Zapier whitelist-rule |
| `draft:pending` | copy-document sub-agent heeft draft in iController |

Render in `web/components/v7/kanban/kanban-job-card.tsx`:
- **Aparte dim-rij onder** bestaande tag-chips (`text-muted-foreground text-xs`)
- Max 2 chips + `+N` overflow (zelfde pattern als bestaande tags)
- Kleurcoderen: warning-tint voor `llm:low-conf` + `ingest:skipped-leak`; success voor `draft:pending`; rest neutraal

### createDraft idempotency & operator marker

- **Idempotency key:** `(graph_message_id, entity)` — géén body-hash.
- **Nieuwe table `debtor.icontroller_drafts`:** `id uuid, graph_message_id text, entity text, agent_run_id uuid fk, icontroller_draft_url text, icontroller_message_id text, created_at, deleted_at, operator_verdict text null` met `UNIQUE(graph_message_id, entity)`. Retry: `INSERT ... ON CONFLICT DO NOTHING RETURNING id` — lege return = skip Browserless.
- **Operator marker = HTML-comment in draft body:**
  ```html
  <!-- MR-AUTOMATION-DRAFT v1 run=<agent_runs.id> do-not-edit-above -->
  ```
  Onzichtbaar voor klant, findable bij body-diff scan (Phase 2 self-training), correleert aan `agent_runs.id`.
- iController custom field afgeschreven (per-tenant config niet wenselijk).

### Multi-mailbox refactor

- Vervang constant `ICONTROLLER_COMPANY` in 3 files door **`mailbox_id: number`** uit `debtor.labeling_settings.icontroller_mailbox_id`:
  - `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts:22,101`
  - `web/lib/debtor-email/icontroller-catchup.ts:22,180,204,222`
  - `web/app/(dashboard)/automations/debtor-email-review/actions.ts:15`
- URL-constructie: `/messages/index/mailbox/${mailbox_id}` — één iController-tenant (`walkerfire.icontroller.eu`), één credential-set, geen per-brand login.
- **Mailbox-IDs:** smeba=4, smeba-fire=5, firecontrol=12, sicli-noord=15, sicli-sud=16, berki=171.
- Functie-signatures accepteren `mailbox_id: number` — oude `company: string` parameter wordt volledig verwijderd.

### Rollout & fallback

- **Gefaseerde rollout**, expliciete volgorde:
  1. **Smeba** (mailbox_id=4) — direct live na merge.
  2. **Smeba-Fire** (mailbox_id=5) — dry_run eerst, flip na acceptance.
  3. **FireControl** (mailbox_id=12) — dry_run eerst, flip na acceptance.
  4. Berki (171) / Sicli-Noord (15) / Sicli-Sud (16) — dry_run, volgorde TBD.
- **Acceptance per mailbox voor flip:** ≥14 dagen clean cleanup-worker run + spot-check 20 samples dry-run label-decisions + expliciete go.
- **Default fallback bij NULL `icontroller_mailbox_id`: hard error** in ingest-route + cleanup-worker. Geen silent fallback naar Smeba — zou mislabel veroorzaken. Migratie moet alle 6 rijen vullen.

### Claude's Discretion

- Exacte schema-naam voor agent_runs (public vs eigen schema) — RLS-impact tijdens planning bepalen.
- Kolomtypes (text vs enum voor `swarm_type`, `human_verdict`).
- Verdict-UI styling consistent met v7 design tokens.
- Chip-kleurtokens uit bestaand v7 design-system.
- Indexen-finetuning (covering-index voor review-queue).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source todos (4 gebundelde werkstromen)
- `.planning/todos/pending/2026-04-23-cleanup-worker-multi-mailbox.md` — Multi-mailbox refactor (3 files, callsites, fallback beleid)
- `.planning/todos/pending/2026-04-23-create-draft-idempotency-and-cleanup.md` — createIcontrollerDraft idempotency + cleanup + operator marker
- `.planning/todos/pending/2026-04-23-debtor-review-pipeline-provenance-and-scoping.md` — Whitelist forwards, status hygiene, provenance chips, multi-mailbox bulk review
- `.planning/todos/pending/2026-04-23-self-training-loop-debtor-email-swarm.md` §Phase 1 — agent_runs schema + Phase 1 hooks (BLOCKING subset)

### Codebase hotspots
- `web/lib/inngest/functions/debtor-email-icontroller-cleanup-worker.ts:22,101` — ICONTROLLER_COMPANY constant + callsite
- `web/lib/debtor-email/icontroller-catchup.ts:22,180,204,222` — idem, 3 callsites
- `web/app/(dashboard)/automations/debtor-email-review/actions.ts:15` — idem
- `web/lib/automations/swarm-bridge/configs.ts` — `deriveEntityStage` + `deriveTags` (status hygiene + chip derivation)
- `web/lib/automations/swarm-bridge/sync.ts` — sync pipeline
- `web/components/v7/kanban/kanban-job-card.tsx` — chip rendering + Open review button
- `web/app/(dashboard)/automations/debtor-email-review/page.tsx` — bestaande bulk-review page (context voor nieuwe verdict-route)
- `web/lib/debtor-email/classify.ts` — regex classifier (ongemoeid; levert `predicted.rule` + `confidence` voor chips)
- `web/lib/automations/icontroller/session.ts` — iController session layer (één credential-set, ongemoeid)

### Project-level context
- `CLAUDE.md` — Stack (Browserless via `playwright-core`, Zapier-first, test credentials default)
- `docs/browserless-patterns.md` — Playwright/Browserless patronen
- `docs/orqai-patterns.md` §9 — Inngest-per-step vs agent-as-tool
- `docs/inngest-patterns.md` — step.run semantics, idempotency pattern
- `docs/supabase-patterns.md` — Service-role writes, RLS, JSONB double-encoding
- `.planning/STATE.md` — Outstanding verifications, swarm-launch sequencing
- `.planning/ROADMAP.md` §Phase 55 — Goal + dependencies

### Supabase schema
- `supabase/migrations/20260422_enable_rls_email_tables.sql` — RLS baseline
- `supabase/migrations/20260423_mailbox_settings_expansion.sql` — `debtor.labeling_settings` met `icontroller_mailbox_id`, `source_mailbox`, `entity`
- Nieuwe migraties (planner schrijft): `public.agent_runs`, `debtor.icontroller_drafts`

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Swarm-bridge architectuur** — `deriveEntityStage` + `deriveTags` zijn natuurlijke uitbreidingspunten voor provenance chips + status-hygiene. Eén file edit dekt beide.
- **v7 kanban card component** — heeft al chip-overflow pattern (`+N`). Nieuwe review-reason dim-rij hergebruikt overflow-logic.
- **iController session layer** — één credential-set bestaand. Multi-mailbox refactor raakt alleen URL-constructie, niet login.
- **Bestaande `/automations/debtor-email-review/` page** — blijft voor regex-training flow. Nieuwe `/automations/review/[runId]` is separate route.
- **automation_runs.result jsonb** — accepteert `review_reason: string[]` zonder schema-wijziging.

### Established Patterns

- **Zapier-first** voor ingest/whitelist-policy (CLAUDE.md). Code-layer defense is 1-liners.
- **Service-role writes** voor automation-schrijfpaden.
- **Status-driven swarm-bridge:** `automation_runs.status` → `stage` via `deriveEntityStage`.
- **Idempotency via unique constraint + ON CONFLICT DO NOTHING** (zie `email_pipeline.emails` upsert).
- **Git-sha als version-anchor** past bij bestaande commit-discipline.

### Integration Points

- `automation_runs.result` — uitbreiden met `review_reason: string[]` bij Zapier-ingest + intent-agent output
- `agent_runs` (nieuw) — geschreven door intent-agent + copy-document-body-agent (Phase 1 swarm, additive)
- `icontroller_drafts` (nieuw) — geschreven door Inngest createIcontrollerDraft pipeline; gelezen door Phase 2 self-training body-diff scan (out of scope)
- `kanban-job-card.tsx` — leest `SwarmJob.description.review_reason`, graceful fallback bij oude data
- Verdict-route `/automations/review/[runId]` — onder `(dashboard)` layout, erft auth + nav

</code_context>

<specifics>
## Specific Ideas

- **"Open review"-button pattern in v7 Kanban** (screenshot 2026-04-23) is de referentie — card toont `unknown` + `needs-review` chips + `Open review` knop; wij voegen review_reason dim-rij toe onder, knop linkt naar `/automations/review/[runId]`.
- Sales-swarm landt ~5 dagen na Phase 55 — `public.agent_runs` met `swarm_type` discriminator vanaf day 1, niet debtor-specific.
- **Mailbox-IDs** (één iController-tenant `walkerfire.icontroller.eu`): smeba=4, smeba-fire=5, firecontrol=12, sicli-noord=15, sicli-sud=16, berki=171. **6 entities totaal** (FireControl 2026-04-23 bevestigd als aparte entity naast Smeba-Fire).
- 👎 verplicht een reden — binary signaal is onbruikbaar voor gerichte prompt-iteratie.
- HTML-comment marker met `run=<uuid>` als brug tussen draft-in-iController en `agent_runs.id` — hook moet vanaf day 1 staan voor Phase 2 self-training.

</specifics>

<deferred>
## Deferred Ideas

- **Self-training Phase 2** — iController body-diff scan, wekelijkse Orq experiments, prompt-iteratie. Blijft todo, bouwt op hooks uit deze phase.
- **Bulk-approve in verdict-UI** — te veel false-positive risico in MVP. Overwegen na ≥200 labeled rows met <5% disagreement.
- **Filter-UI op review_reason chips** — add als volume groeit.
- **Pagination op verdict-queue** — add bij consistent >50 backlog.
- **Retro-active verdict-seeding** voor pre-review-UI drafts — skip in MVP.
- **CI-check op version-bumps** — optioneel via git-hook.
- **Custom iController-field voor operator marker** — HTML-comment goed genoeg.
- **Bulk-review page scope-uitbreiding** (intent-approval type, todo #10 Part 3) — future werk (Phase 57 of later).

</deferred>

---

*Phase: 55-debtor-email-pipeline-hardening*
*Context gathered: 2026-04-23*
