# Swarm Behavior Tracking — runbook

Passieve feedback-loop (Phase 112.5): een cron-gedreven delta-sync volgt mail-transities in Outlook via Graph en destilleert review-signalen (approve/correctie) per `pipeline_event`. Registry-driven: aan/uit per swarm via `public.swarms.behavior_tracking_config` — **geen deploy nodig**.

**Topologie sinds Phase 119 (fan-out, 2026-06-16):** de cron drijft een dunne **ORCHESTRATOR** (`swarm/behavior-sync`, elke 5 min business-hours) die de registry leest (`load-enabled-swarms`) en vervolgens **één `swarm/behavior-sync.mailbox`-event fan-out per enabled `(swarm × mailbox)`**. De orchestrator raakt Graph nooit aan en mint geen `runId`/`tickIso`. Een per-mailbox **WORKER** (`swarm/behavior-sync.mailbox`) verwerkt **exact één mailbox per invocatie** — eigen Inngest-run, eigen retries. Dit geeft **fault-isolatie** (een throw op één mailbox is z'n eigen failed run, vastgelegd als zichtbare `behavior_sync_mailbox_failed`-telemetrierij in `pipeline_events`) én **eerlijke budgettering** (een zware mailbox verbruikt alleen z'n eigen step/wall-clock-budget). Concurrency op de worker is `[{key:"event.data.mailbox", limit:1}, {limit:4}]`: hooguit één in-flight invocatie per mailbox (replay/overlap-veiligheid) plus een globaal Graph-load-plafond van 4 — dit **vervangt de oude `concurrency:{limit:1}` seriële lus**. *Waarom dit veranderde:* op 2026-06-16 bevroor het inschakelen van debtor's 4 mailboxen (één met 55 folders) de gedeelde single-run-lus — alleen de eerste mailbox per tick kreeg delta-tokens en de gezonde sales `verkoop@smeba.nl`-observe liep niet meer. Disablen van debtor herstelde sales onmiddellijk, wat de starvation/abort-causatie bevestigde.

**Status sinds 2026-06-15: LIVE voor sales** (`behavior_tracking_config.enabled=true`). Sinds Phase 118 (2026-06-16) gebruikt sales-email de **`mailboxes[]`-vorm**, eerst single-element (`["verkoop@smeba.nl"]`) als live-validatie van het multi-mailbox read-path. **Sinds 2026-06-23 (PR #130) draaien alle 4 sales-mailboxen** (`["verkoop@smeba.nl", "verkoop@fire-control.nl", "verkoop@berki.nl", "sales.products@berki.nl"]`) — multi-brand SB/FI/BB/IN met per-mailbox brand + entity. De Power Automate-sweep naar "Sugar Archive" staat UIT sinds 2026-06-05 (operator-bevestigd), dus inbox-signalen zijn niet langer vervuild. Live bewezen 2026-06-15 via drag-proef: een `inbox → afgehandeld/2026` move op een ge-ingeste mail leverde `moved_to_afgehandeld` + verdict `approve_handled` binnen één cron-tick (zie `.planning/phases/112.5-*/112.5-HUMAN-UAT.md`). **Eén deel nog dormant:** de `category_edited`-tak produceert pas signalen zodra Phase 117 `AI:`-categorieën schrijft voor `sales-email` (dan vult `swarm_written_categories` de baseline). *(Eerdere status t/m 2026-06-04: GEPAUZEERD wegens de Sugar-sweep — historisch, niet meer van toepassing.)*

---

## ▶️ Aanzetten bij de Sugar cut-over (5 stappen, ~10 min)

> Vraag aan Claude: *"Voer de Sugar cut-over reactivatie uit volgens docs/swarm-behavior-tracking.md"* — of handmatig:

**Stap 0 — Preconditie (IT/beheerder):** de Power Automate-flow die verkoop@smeba.nl naar "Sugar Archive" veegt is UIT. Controle: inbox-aantal blijft stabiel over een paar uur (geen batch-verdwijningen).

**Stap 1 — Enable (Supabase, project `mvqjhlxfvtqqubqgdvhz`):**
```sql
UPDATE public.swarms
SET behavior_tracking_config = jsonb_set(behavior_tracking_config, '{enabled}', 'true'::jsonb),
    updated_at = now()
WHERE swarm_type = 'sales-email';
```

**Stap 2 — Verse start (aanbevolen na lange pauze):** delta-tokens weggooien forceert een schone bootstrap (pre-bestaande mailbox-staat levert per ontwerp 0 signalen — geen ruis van alles wat tijdens de pauze gebeurde):
```sql
DELETE FROM public.outlook_delta_tokens WHERE mailbox = 'verkoop@smeba.nl';
```

**Stap 3 — Verifieer de eerste tick** (cron pakt hem binnen 5 min op, of forceer):
```bash
curl -s -X POST "https://inn.gs/e/$INNGEST_EVENT_KEY" -H 'Content-Type: application/json' \
  -d '{"name":"swarm/behavior-sync.requested","data":{"swarm_type":"sales-email"}}'
```
Verwacht in de run-output: `bootstrapped_folders` ≈ 28, `signals_written: 0` (bootstrap-suppressie). Run-status via `api.inngest.com/v1/events/<id>/runs` (Bearer = `INNGEST_SIGNING_KEY`).

**Stap 4 — Live bewijs:** sleep één mail van Inbox naar `afgehandeld/{jaar}`, wacht één tick:
```sql
SELECT kind, verdict FROM public.swarm_email_transitions t
LEFT JOIN public.swarm_review_signals s USING (email_id)
ORDER BY t.created_at DESC LIMIT 3;
```
Verwacht: `moved_to_afgehandeld` + verdict `approve_handled`.

> ⚠️ **KIES EEN GE-INGESTE MAIL voor de live-proef — NIET een vers opgestelde testmail.** De derive-stap mapt `immutable_id → email_id` via `email_pipeline.emails.source_id`; een mail die nooit door de ingest-pipeline is gegaan (een handmatig opgestelde "Sleep test"-mail) heeft geen rij daar, valt in de `skipped_sugar`-tak en produceert **0 transities** — ook al wordt de move-`@removed` correct gedetecteerd. Controleer vooraf dat de mail bestaat:
> ```sql
> SELECT id, subject FROM email_pipeline.emails
> WHERE source='outlook' AND mailbox='verkoop@smeba.nl' AND subject ILIKE '%<jouw-subject>%';
> ```
> Verschijnt er geen rij → kies een andere (échte, binnengekomen) mail. Debug-bevinding 2026-06-11 (`graph-delta-missing-moves`): twee live-proeven faalden hierop — "Sleep test 2" was niet ge-ingest (Sugar-skip), en "Test voor Mailbox volging" (wél ge-ingest) ging verloren in een mid-loop Vercel-timeout vóór `derive-and-write`.

**Stap 4b — Skipped-move-telemetrie:** sinds de debug-fix bevat de run-output per swarm een `skipped_moves[]`-array met elk geskipt move-soort (`immutable_id` + `kind`). Toont stap 4 geen transitie, kijk hier: een entry betekent "move gezien maar geen email_id" (kies een ge-ingeste mail); een lege array + 0 transities betekent dat de `@removed` de run niet haalde (mid-loop timeout / cursor-advance-vóór-derive — zie de open todo over de Vercel step-budget).

**Stap 5 — Open punt meenemen:** bij de pauze (2026-06-04) vielen 3 geëxtraheerde transities als `skipped_sugar` (immutable id matchte geen `emails.source_id`-rij). Mechanisme werkt t/m extractie; de email-koppeling voor niet-geïngeste/oudere mail moet onderzocht. Als stap 4 óók `skipped_sugar` toont i.p.v. een signaal: dit eerst fixen (zie `112.5-04-SUMMARY.md`).

---

## Architectuur in één oogopslag

- **Tabellen**: `outlook_delta_tokens` (delta-state per folder), `outlook_folder_map` (folder→bucket registry, ancestry-aware: jaar-submappen onder "afgehandeld" erven die bucket), `swarm_email_transitions` (append-only raw), `swarm_review_signals` (verdicts). Alle RLS/service-role.
- **Verdicts** (operator-weging 2026-06-04): `moved_to_afgehandeld`→approve_handled · restore-uit-Archief-van-door-ons-gearchiveerd→**correctie_false_positive** (sterkst; ledger-join op `pipeline_events` stage-4) · categorie-wijziging→reclassify · reply→approve_replied · self-archive→zwak · `left_to_untracked` (sweep/onbekende map)→geen verdict, alleen observability.
- **Nieuwe swarm aansluiten** = één registry-UPDATE op `behavior_tracking_config`. Sinds Phase 118 is de vorm `{"enabled": true, "mailboxes": ["info@smeba.nl"]}` — een **string-array** zodat één swarm meerdere postvakken kan volgen (debtor spant ~5 debiteuren-mailboxen). De worker leest `mailboxes` bij voorkeur en valt **backward-compatible terug op de enkelvoudige `mailbox`-string** voor elke nog niet-gemigreerde rij (read-order: `cfg.mailboxes ?? (cfg.mailbox ? [cfg.mailbox] : [])`), dus de oude enkelvoudige vorm blijft byte-onveranderd werken. Optioneel `"weights": {...}` als per-swarm override op `DEFAULT_WEIGHTS` in `signal-derive.ts` (weights worden gedeeld over alle mailboxen van een swarm). Sinds Phase 119 fan-out de orchestrator één `swarm/behavior-sync.mailbox`-event per (swarm × mailbox); elke mailbox draait als **eigen worker-invocatie** met mailbox-unieke `step.run`-ids — niet meer sequentieel onder één gedeelde `concurrency:{limit:1}` (zie de topologie-paragraaf bovenaan).
- **Debtor multi-mailbox enablement = stap 2 (post-merge, OUT OF SCOPE Phase 118):** het zetten van debtor's `behavior_tracking_config={enabled:true, mailboxes:[…5…]}` + de `stage_3_intent_label`-gate-flip is een aparte, operator-gated wijziging ná deze merge — geen onderdeel van Phase 118 (dat levert alleen de code-enabler + de sales-migratie).
- **Nieuwe afgehandeld-jaarmap** (jaarlijkse ritueel): wordt automatisch ontdekt (per-tick folder-refresh) en via bootstrap-correlatie met terugwerkende kracht gekoppeld aan eerdere `left_to_untracked` verdwijningen.
- **Code**: `web/lib/email-behavior/` (pure helpers + tests) en `web/lib/inngest/functions/swarm-behavior-sync.ts`. Phase-artefacten: `.planning/phases/112.5-*/`.

## Phase 117 — written-category baseline (D-5)

Phase 117's swarm-agnostic `stage-3-intent-label-worker` schrijft per Stage-3-verdict de top-1 intent terug op het bron-Outlook-bericht als één `AI:`-geprefixte native categorie (`AI: <intent_key>`, bv. `AI: quote_request`) en **registreert de laatst geschreven categorie per `email_id`** in `public.swarm_written_categories`:

| Kolom | Betekenis |
|-------|-----------|
| `email_id` (PK) | `email_pipeline.emails.id` — upsert-conflict-target + join-key |
| `swarm_type` | de swarm die de categorie schreef |
| `source_mailbox` | het bron-postvak |
| `ai_category` | de volledige `AI:`-geprefixte categorie-string die geschreven is |
| `written_at` | tijdstip van de write |

**Waarom dit de 112.5-baseline is.** De delta-sync hierboven bouwt `prevCategories` op uit `swarm_email_transitions`, dat **leeg is op de eerste tick na een label-write** (er is nog geen eerdere transitie om tegen te diffen). Daardoor is de `category_edited`-transitie dormant op de eerste operator-edit. Om die éérste edit te detecteren MOET de delta-sync `prevCategories` **seeden vanuit `swarm_written_categories`** (LEFT JOIN `source_id` → `email_pipeline.emails.id` → `swarm_written_categories.email_id`): wat de worker schreef is het bekende vorige beeld waartegen de live Graph-categorie gediff wordt.

**De `AI:`-prefix is de marker** die een AI-geschreven categorie onderscheidt van een door de operator zelf aangemaakte Outlook-categorie — 112.5 kan zo `removed` / `changed-to-AI` / `changed-to-non-AI` classificeren zonder de gebruikerslabels aan te raken.

**Scope-grens.** Phase 117 levert alléén de **read-contract** (de baseline-tabel + deze join-beschrijving). Het daadwerkelijk bedraden van 112.5 om `swarm_written_categories` te consumeren is de dormant signal-kant en valt **BUITEN Phase 117** (CONTEXT D-5). Phase 117 schrijft + bewaart de baseline; 112.5 bouwt de signaal-kant.
