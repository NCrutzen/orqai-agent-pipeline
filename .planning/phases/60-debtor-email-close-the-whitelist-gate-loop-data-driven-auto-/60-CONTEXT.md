# Phase 60: Debtor email — close the whitelist-gate loop - Context

**Gathered:** 2026-04-28
**Status:** Ready for planning

<domain>
## Phase Boundary

Sluit de whitelist-gate-loop voor de debtor-email pipeline en bouw daarvoor een **generieke, cross-swarm rules engine** vanaf dag 1 (debtor-email, sales-email, planning, order-entry, …). Twee gekoppelde deliverables:

1. **Data-driven AUTO_ACTION_RULES + Wilson-CI auto-promotion cron** — vervang de hardcoded `Set` in `web/app/api/automations/debtor-email/ingest/route.ts:39-46` door een `public.classifier_rules` tabel met `swarm_type` discriminator. Een Inngest-cron (daily, business-hours window Europe/Amsterdam) berekent Wilson 95% CI-lo per rule uit `agent_runs.human_verdict`-telemetrie en promoot/demoot automatisch met hysterese.
2. **Queue-driven Bulk Review UI** — `/automations/debtor-email-review/page.tsx` stopt met live Outlook-fetch + re-classify (vandaag 5×300 windows). Leest direct uit `automation_runs WHERE status='predicted'` (al geschreven door ingest-route op `route.ts:272-289`). Navigatie via topic→entity→mailbox hierarchie in een **right-sliding drawer** (v7 `agent-detail-drawer.tsx` pattern), schaalt naar 50-100 mailboxen × 15+ entities.

**Cross-swarm by design:** alle nieuwe tabellen, columns en Inngest functions zijn keyed by `swarm_type`. Phase 55's `agent_runs.swarm_type` discriminator extends hier. Geen debtor-specifieke namen.

**Expliciet uit scope:** rule-discovery uit unknown-clusters (Phase 61+), DB-backed regex definities (regex blijft in `classify.ts`), prompt-iteration loop voor LLM intent-agents (Phase 55 deferred), Outlook Category-as-routing-key (deferred), bulk-approve buiten de race-condition cohort (Phase 55 deferred tot ≥200 rows + <5% disagreement).

</domain>

<decisions>
## Implementation Decisions

### Cross-swarm rules engine (architectural anchor)

- **D-00:** Rules engine is generiek vanaf day 1 — `swarm_type` column op alle nieuwe tabellen (`debtor-email`, `sales-email`, `planning`, `order-entry`, …). Phase 60 populeert alleen `debtor-email`; andere swarms lighten automatisch op zodra ze `automation_runs` schrijven met hun `swarm_type`. Geen debtor-specific table-namen.

### Telemetry source & gates

- **D-01:** Per-rule success/failure-signaal komt uit **`public.agent_runs.human_verdict`** (Phase 55 cross-swarm discriminator-tabel). Eén bron, generiek, future-proof. Bestaande bulk-review actions die vandaag `automation_runs.status='feedback'` schrijven hebben een dunne brug nodig die ook een `agent_runs`-rij schrijft (of de migration backfilled de telemetry-aggregaten direct).
- **D-02:** Auto-promotion gates: **N≥30 AND Wilson 95% CI-lo ≥95%**. Sluit aan op de empirische thresholds die al in `route.ts:24-32` staan (N=169 CI-lo=97.8%, etc.). N=30 is de praktische floor waaronder Wilson te breed is om te vertrouwen.
- **D-03:** Auto-demotion met **hysterese: demote bij CI-lo<92%** (5% gap voorkomt flapping). Demotie reverteert rule naar bulk-review-only. Slack/log alert op elke demotion.
- **D-04:** Migration-backfill voor de 6 huidige hardcoded debtor-email regels: scan `automation_runs` met `status='feedback'` per rule, bereken initiële N + CI-lo, set `status='promoted'` als gates pass. Zero-downtime; verifieerbare provenance ipv hand-curated waardes. CI-lo kolom is gevuld vanaf migration-tijd.

### Promotion store + cron shape

- **D-05:** Whitelist leeft in **`public.classifier_rules`** (generiek). Kolommen: `id uuid pk, swarm_type text, rule_key text, kind text check (kind in ('regex','agent_intent')), status text check (status in ('candidate','promoted','demoted','manual_block')), n int, agree int, ci_lo numeric, last_evaluated timestamptz, promoted_at timestamptz, last_demoted_at timestamptz, notes text, UNIQUE(swarm_type, rule_key)`. Lives in `public` schema zodat sales/planning/order-entry kunnen reusen zonder schema-duplicatie.
- **D-06:** Append-only audit-tabel **`public.classifier_rule_evaluations`** — 1 rij per rule per cron-run met `(swarm_type, rule_key, n, agree, ci_lo, evaluated_at, action: 'no_change'|'promoted'|'demoted'|'shadow_would_promote'|'shadow_would_demote')`. Drijft trend-sparkline + flapping-debug op de dashboard-pagina. Volume klein (≤60 rows/day).
- **D-07:** Per-mailbox kill-switch via **`public.classifier_rules_mailbox_overrides`** matrix-tabel — `(swarm_type, rule_key, source_mailbox, override text check (override in ('block','force_promote')), set_by, set_at)`. Cross-swarm symmetrisch. Vervangt een ad-hoc kolom op `debtor.labeling_settings`.
- **D-08:** Ingest-route leest whitelist via **in-memory cache met 60s TTL** (module-level, keyed by `swarm_type`). Promotion-latency ≤60s is acceptabel (cron draait dagelijks). Zero per-request DB-cost, geen Vercel cold-start verrassing.
- **D-09:** Cron is **Inngest cron, daily 06:00 Amsterdam, business-day window** — `TZ=Europe/Amsterdam 0 6 * * 1-5`. Eén eval per business-day matcht CLAUDE.md cron-cost regels + Phase 58 business-hours pattern.

### Queue-driven Bulk Review UI

- **D-10:** Source of truth voor de queue is **puur `automation_runs.status='predicted'`**. Outlook live-fetch + re-classify wordt volledig verwijderd uit `page.tsx`. Sub-100ms render, schaalt cross-mailbox gratis, geen Graph API dependency op page-load.
- **D-11:** **`automation_runs` krijgt typed kolommen**: `swarm_type text not null`, `topic text` (binnen swarm — bv. `payment_admittance`), `entity text`, `mailbox_id int`. Promote uit `result jsonb` naar gindexte kolommen. Future Category-router schrijft dezelfde kolommen. Cheap, future-proof, ondersteunt counts-query.
- **D-12:** Navigatie = **topic→entity→mailbox hierarchie in een right-sliding drawer** (hergebruik `web/components/v7/drawer/agent-detail-drawer.tsx` pattern). Linker boom, rechter detail. Skaleert naar 50-100 mailboxen × 15+ entities × meerdere topics. Phase 60 ship structuur; debtor-email is de enige populated leaf, andere lighten automatisch op zodra hun swarm `automation_runs` schrijft.
- **D-13:** Counts-query bij page-load: één **`GROUP BY swarm_type, topic, entity, mailbox_id`** op `automation_runs WHERE status='predicted'`. Phase 59 broadcast invalidates en refetches. Indexen: `(status, swarm_type)`, `(status, entity)`, `(status, mailbox_id)`.
- **D-14:** **Cursor pagination op `created_at`, page-size 100** (`ORDER BY created_at DESC LIMIT 100`, `?before=<iso>` voor older). Stable onder concurrent inserts (broadcast prepend). Vervangt de huidige 5×300 Outlook auto-walk volledig.
- **D-15:** Filter-UX = **rule-filter (`?rule=X`) op `automation_runs.result.predicted.rule` JSONB** + **'Pending promotion'-tab** die rows toont voor rules met `status='candidate'` die meer N nodig hebben. Beide naast elkaar — power-user filter + curated promotion-pad.

### Approval semantics + worker-topology

- **D-16:** **Approve/reject schrijft alleen `human_verdict`** in `agent_runs` (+ `automation_runs.status='feedback'` op de bron-row). Een **`classifier-verdict-worker` Inngest function** (event-trigger `classifier/verdict.recorded`) pakt approved rows op en runt categorize+archive Outlook + iController-delete async. Reviewer-UI returnt instantaan; failures retry met backoff; geen 5-minute server-action timeouts meer.
- **D-17:** Row verlaat de queue op **status-transitie `predicted → feedback`** in dezelfde write. Phase 59 broadcast updatet UI live. Async Outlook/iController-actie kan apart falen → `status='failed'` met retry-button.
- **D-18:** **Race-conditie bij promotion:** bestaande `predicted`-rows voor de zojuist gepromoveerde rule **blijven in de queue** (telemetrie niet verloren). Promotion treft alleen toekomstige ingest-beslissingen. Reviewer kan die cohort handmatig clearen — UI surfaceert een **bulk-approve-affordance specifiek voor net-gepromoveerde rules** (zie D-21).

### Rollout safety

- **D-19:** **Shadow-mode 14 dagen, dan flag-flip naar live**. Cron draait daily, schrijft `classifier_rule_evaluations` history-rijen, maar **muteert NIET** `classifier_rules.status` totdat `classifier_cron.mutate=true` (settings-row of env-var). Dashboard toont 'would have promoted X' tijdens shadow. Na 14 dagen plausibele beslissingen + spot-check → flip.
- **D-20:** Per-mailbox kill-switch is generiek via `classifier_rules_mailbox_overrides` (D-07). Smeba (`mailbox_id=4`) krijgt na flip immediate benefit. Andere mailboxes (Sicli/Berki/Smeba-Fire/FireControl) blijven gated door bestaande `auto_label_enabled=false` in `debtor.labeling_settings` totdat ze afzonderlijk worden geflipt.

### Bulk actions

- **D-21:** Phase 60 ship't **per-row approve/reject als default** (consistent met Phase 55's deferred-bulk-approve beslissing tot ≥200 rows + <5% disagreement). Bulk-approve UI **surfaceert alleen voor de race-condition cohort**: rows wiens rule zojuist is gepromoveerd door de cron. Affordance label: 'Bulk-clear remaining {N} predicted rows for promoted rule X'. Buiten die cohort is bulk-approve niet beschikbaar.

### Rule lifecycle (gedeeltelijk in scope)

- **D-22:** **`classify.ts` blijft ongewijzigd** — bezit nog steeds regex-matching en geeft `matchedRule` string. `classifier_rules` is een laag eromheen die `'is rule X whitelisted voor swarm Y?'` beantwoordt. Rule-definities blijven code-changes (geen DB-backed regex).
- **D-23:** **LLM intent-agent + copy-document outputs (Phase 55 swarm) flowen door dezelfde lifecycle** — `kind='agent_intent'` op `classifier_rules`. `rule_key` namespacing: `intent:copy_invoice`, `intent:dispute`, etc. `agent_runs.human_verdict` voedt dezelfde CI-lo math. Promotion = 'deze intent's drafts gaan auto naar send/categorize zonder human review'. Polymorfe consumer (ingest-route leest regex rules; agent-runner leest intent rules) op één unified store.
- **D-24:** **Reject-na-promotion** voedt gewoon de volgende cron-run als normale evaluation-input. CI-lo daalt → cron auto-demoot bij <92% (D-03). Geen tripwire/24h-alert path. Operator kan altijd hard `manual_block` zetten via dashboard.
- **D-25:** **Hand-labels op unknown-rows worden alleen opgeslagen** (`agent_runs.human_verdict` + `verdict_reason` taxonomie uit Phase 55 + corrected_category-veld). Phase 60 acteert er niet op — rule-mining uit unknown-clusters is Phase 61+.

### Dashboard

- **D-26:** **Dedicated `/automations/classifier-rules` pagina**. Tabel met rules cross-swarm: status, N, CI-lo trend-sparkline (uit `classifier_rule_evaluations`), `last_evaluated`, 'would have promoted' shadow-indicator tijdens shadow-mode, manual block/unblock buttons. Hergebruikt v7 design-tokens.

### Lifecycle / retention

- **D-27:** **`automation_runs` rijen worden niet gearchiveerd of gedeleted**. Volume klein (≤1000/day cross-mailbox). History is de telemetrie-bron voor CI-lo math. Indexen op `(swarm_type, status, created_at desc)` houden queue-queries snel.

### Migration ordering

- **D-28:** **Additive-first, switch-reads, drop-fallback** — zero-downtime in vier stappen:
  1. Migration creëert `classifier_rules`, `classifier_rule_evaluations`, `classifier_rules_mailbox_overrides`; voegt typed kolommen (`swarm_type`, `topic`, `entity`, `mailbox_id`) nullable toe aan `automation_runs` met backfill van bestaande rows uit `result jsonb`.
  2. Backfill-script seeds initiële N/CI-lo voor de 6 huidige debtor-email regels uit historische `automation_runs` met `status='feedback'`; set `status='promoted'`.
  3. Deploy ingest-route die leest uit `classifier_rules` met in-memory cache; **fallback naar hardcoded `Set` als tabel leeg is** (defensive).
  4. Na 1 dag clean run: verwijder de hardcoded `Set` + fallback uit ingest-route in een follow-up commit.

### Inngest topology

- **D-29:** **Twee Inngest functions** (cross-swarm hergebruikbaar):
  - `classifier-promotion-cron` — daily `TZ=Europe/Amsterdam 0 6 * * 1-5`, computeert CI-lo per rule per swarm, schrijft `classifier_rule_evaluations`, en (post-flip) muteert `classifier_rules.status`.
  - `classifier-verdict-worker` — event-trigger `classifier/verdict.recorded`, pakt `agent_runs.human_verdict='approve'` rows op, runt categorize+archive Outlook + iController-delete.

### Claude's Discretion

- Exacte naming-conventie voor `rule_key` agent-intent namespacing (`intent:copy_invoice` vs `agent:copy_invoice` vs `agent_intent.copy_invoice`).
- Concrete index-strategie voor counts-query (covering-index of multi-column).
- Wilson-CI implementatie — pure SQL, Postgres-functie, of TypeScript (waarschijnlijk SQL voor consistente math).
- Schema-naam voor de nieuwe tabellen — `public` is locked, maar `public.classifier_*` vs een nieuwe `classifiers` schema is open.
- v7 drawer-component variant (re-skin van `agent-detail-drawer` of nieuwe specialisatie) en de tree-component eronder.
- Precise broadcast-channel-naam voor Phase 59-style realtime updates op `automation_runs`.
- Backfill-script: standalone TS in `scripts/` of Inngest one-shot function.
- Hoe `corrected_category` op `agent_runs` heet (mogelijk al gedekt door bestaande `verdict_reason`-uitbreiding).

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Source todo / prior phase
- `.planning/phases/55-debtor-email-pipeline-hardening/55-CONTEXT.md` — `agent_runs` schema, swarm_type discriminator, multi-mailbox via `debtor.labeling_settings.icontroller_mailbox_id`, gefaseerde rollout pattern (Smeba live, anderen dry_run), provenance-chips set
- `.planning/STATE.md` — outstanding verifications, swarm-launch sequencing, Phase 50/48 deferred items

### Codebase hotspots — to be modified
- `web/app/api/automations/debtor-email/ingest/route.ts:39-46` — hardcoded `AUTO_ACTION_RULES` Set; vervangen door cache-backed `classifier_rules` read
- `web/app/api/automations/debtor-email/ingest/route.ts:267-323` — branch die `automation_runs.status='predicted'` schrijft (al correct, alleen typed-kolommen toevoegen aan insert)
- `web/app/(dashboard)/automations/debtor-email-review/page.tsx:1-218` — volledig herschrijven naar `automation_runs`-driven query (drop Outlook walk + re-classify)
- `web/app/(dashboard)/automations/debtor-email-review/bulk-review.tsx` — UI refactor naar tree-nav + drawer
- `web/app/(dashboard)/automations/debtor-email-review/actions.ts` — splitsen: verdict-write blijft synchroon, side-effects (categorize/archive/iController-delete) verhuizen naar `classifier-verdict-worker` Inngest function
- `web/lib/debtor-email/classify.ts` — **ongemoeid** (regex matching blijft hier)

### Codebase hotspots — to be referenced
- `web/components/v7/drawer/agent-detail-drawer.tsx` — right-sliding drawer pattern voor topic→entity→mailbox tree
- `web/components/v7/swarm-sidebar.tsx`, `web/components/v7/swarm-list-item.tsx` — sidebar count-badge precedenten
- `web/lib/inngest/client.ts` + bestaande functions in `web/lib/inngest/functions/` — pattern voor cron + event-trigger functions
- `web/lib/automations/runs/emit.ts` (`emitAutomationRunStale`) — Phase 59 broadcast wiring; nieuwe queue-UI haakt hierop in voor live updates
- `web/lib/automations/icontroller/session.ts` — iController session layer, gebruikt door verdict-worker

### Supabase schema
- `supabase/migrations/20260326_automation_runs.sql` — base table; nieuwe migration voegt typed kolommen toe
- `supabase/migrations/20260423_debtor_agent_runs.sql` — `public.agent_runs` met `human_verdict` + `swarm_type`; telemetry-bron voor CI-lo
- `supabase/migrations/20260423_mailbox_settings_expansion.sql` — `debtor.labeling_settings` met `auto_label_enabled` (kill-switch laag boven nieuw mailbox-overrides matrix)
- Nieuwe migrations (planner schrijft): `public.classifier_rules`, `public.classifier_rule_evaluations`, `public.classifier_rules_mailbox_overrides`, kolom-additions op `public.automation_runs`

### Project-level context
- `CLAUDE.md` — Stack, Zapier-first, Inngest cron-rules (TZ-prefix verplicht, business-hours window default), service-role writes
- `docs/inngest-patterns.md` — step.run semantics, idempotency, cron defaults, event-triggers
- `docs/supabase-patterns.md` — service-role writes, RLS, JSONB double-encoding
- `docs/orqai-patterns.md` §9 — Inngest-per-step vs agent-as-tool (relevant voor verdict-worker → copy-document agent koppeling)
- `.planning/ROADMAP.md` §Phase 60 — phase title + dependencies (depends on Phase 59 broadcast)

### External / forward-looking
- Wilson 95% CI-lo formule (referentie: `route.ts:18-37` JSDoc heeft de empirische cijfers; planner kiest SQL- of TS-implementatie)

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets

- **Phase 59 broadcast op `automation_runs`** — single-channel realtime fanout (commits `4dfe425`, `23d72b9`). Queue-UI haakt hierop in voor live counts + row-prepend zonder eigen subscription-management.
- **`agent_runs` tabel (Phase 55)** — al cross-swarm via `swarm_type`, heeft `human_verdict` + `verdict_reason`. Dé telemetrie-bron; geen nieuwe verdict-tabel nodig.
- **v7 right-sliding drawer (`agent-detail-drawer.tsx`)** — bestaande slide-in component; topic→entity→mailbox tree erbinnen renderen.
- **`emitAutomationRunStale`** — bestaande broadcast-helper, hergebruiken voor de typed-kolommen-update zonder nieuwe wiring.
- **`debtor.labeling_settings.auto_label_enabled`** — bestaande per-mailbox kill-switch laag boven het nieuwe mailbox-overrides matrix; hoeft niet vervangen.

### Established Patterns

- **Status-driven swarm-bridge** (Phase 55) — `automation_runs.status` → UI-stage. Queue rendert simpelweg `status='predicted'`; geen aparte status-veld nodig.
- **Idempotency via UNIQUE-constraint + ON CONFLICT** — geldt voor `classifier_rules.UNIQUE(swarm_type, rule_key)` en `classifier_rule_evaluations.UNIQUE(swarm_type, rule_key, evaluated_at)`.
- **Service-role writes voor automation-paden** — cron + verdict-worker draaien als service-role; RLS hoeft alleen client-paden te beschermen.
- **Generic-from-day-1 pattern** — Phase 55 koos `agent_runs.swarm_type` ipv `debtor_agent_runs`. Phase 60 volgt dezelfde discipline: `public.classifier_rules` ipv `debtor.auto_action_rules`.
- **Inngest cron met `TZ=Europe/Amsterdam` prefix verplicht** (CLAUDE.md, learning `eb434cfd`); business-hours window default.

### Integration Points

- `automation_runs` (additive kolommen) — geschreven door bestaande ingest-route + nieuwe verdict-actions; gelezen door queue-UI counts-query + planner-cron voor CI-lo aggregaten via join naar `agent_runs`.
- `classifier_rules` (nieuw) — geschreven door promotion-cron; gelezen door ingest-route (cached) + dashboard + queue-UI 'pending promotion' tab.
- `classifier_rule_evaluations` (nieuw) — alleen geschreven door cron; gelezen door dashboard sparkline.
- `classifier_rules_mailbox_overrides` (nieuw) — geschreven via dashboard UI; gelezen door ingest-route gate-evaluatie.
- `agent_runs` (read-only voor cron) — telemetry-bron; CI-lo math joined via `automation_run_id` of email_id.
- Inngest event `classifier/verdict.recorded` — gefired door verdict-action; geconsumeerd door `classifier-verdict-worker`.

</code_context>

<specifics>
## Specific Ideas

- **6 hardcoded debtor-email rules** uit `route.ts:39-46` zijn de seed-set voor de migration backfill. Hun N + CI-lo waardes staan al gedocumenteerd in `route.ts:24-32` (subject_paid_marker N=169 CI-lo=97.8%, payment_subject N=151 CI-lo=96.7%, payment_sender+subject N=79 CI-lo=95.4%, payment_system_sender+body N=9 100%, payment_sender+hint+body N=8 100%, payment_sender+body N=2 100%). Migration moet matchen.
- **`payment_admittance` als categorie-rollup** (N=415, CI-lo=99.1%) is een patroon dat de planner moet behouden — sommige rules krijgen dekking via category-rollup ipv eigen N. Mogelijk extra `kind='category_rollup'` of een `parent_rule_key`-veld.
- **Smeba-only flip** verwacht: na 14 dagen shadow + flip is alleen Smeba (`mailbox_id=4`, `auto_label_enabled=true`) meteen live. Andere entities blijven via bestaande Phase 55 gefaseerde rollout (`auto_label_enabled` per mailbox).
- **50-100 mailboxen × 15+ entities × multiple topics** schaal-target — UI-decisions (drawer + counts + cursor pagination) zijn hier op gedimensioneerd. Tab-strip nav was expliciet afgewezen.
- **Right-sliding drawer** is de UI-handtekening van het v7 dashboard, niet links — gebruikersnotitie tijdens discussie.
- **N=2 / N=8 / N=9 rules promoten via category-rollup**, niet individueel — planner moet beslissen of het rule-aggregate of een composite `parent_key` doet.
- **Phase 55's deferred bulk-approve criterium** (≥200 rows + <5% disagreement) blijft van kracht; Phase 60's bulk-approve is *alleen* voor de race-condition cohort, niet een algemene bulk-actie.

</specifics>

<deferred>
## Deferred Ideas

- **Outlook 'Category as routing key' generic intake** — één centrale Zap met categorisatie ipv per-mailbox Zap. Aanlokkelijk bij 100 mailboxen, maar raakt Zapier-topology + Outlook-categorie-seed + nieuw webhook-contract. Eigen phase. (Phase 60 schema is al voorbereid via D-11.)
- **Rule-discovery uit unknown-clusters** — UI/cron die patronen mined uit hand-gelabelde unknowns en candidate-rules drafted. Phase 61+ (data wordt al opgeslagen via D-25).
- **DB-backed regex definities** in `classifier_rules.definition jsonb` — vervangt code-changes voor rule-authoring. Significant scope (regex sandbox, evaluation engine). Apart phase.
- **LLM prompt-iteration loop** — hand-labels feeden Orq.ai intent-agent prompt-iteratie (Phase 55 deferred Phase 2 self-training).
- **Tripwire / 24h-alert path** voor sudden drift op live rules — alleen bouwen wanneer drift-incidenten in praktijk gebeuren.
- **Per-rule manual-flip approval flow** — cron-promotie zou een human-confirmation kunnen vragen per rule; defeat purpose van auto-promotion.
- **Saved-views / shareable named queries** in queue-UI — power-user pattern, premature voor Phase 60.
- **Materialized view voor counts** — premature optimization op huidige volume.
- **Archive/delete strategie voor `automation_runs` historie** — niet nodig op huidig volume.
- **Algemene bulk-approve UI** (buiten race-cohort) — geblokkeerd door Phase 55 criterium tot ≥200 rows + <5% disagreement aangetoond.

### Reviewed Todos (not folded)

None — `cross_reference_todos` step had geen matching todos voor Phase 60 (huidige pending todos: Zapier analytics scraper, PostgREST exposed-schemas).

</deferred>

---

*Phase: 60-debtor-email-close-the-whitelist-gate-loop-data-driven-auto-*
*Context gathered: 2026-04-28*
