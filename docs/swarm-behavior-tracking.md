# Swarm Behavior Tracking — runbook

Passieve feedback-loop (Phase 112.5): een cron-worker (`swarm/behavior-sync`, elke 5 min business-hours) volgt mail-transities in Outlook via Graph delta-sync en destilleert review-signalen (approve/correctie) per `pipeline_event`. Registry-driven: aan/uit per swarm via `public.swarms.behavior_tracking_config` — **geen deploy nodig**.

**Status sinds 2026-06-15: LIVE voor sales** (`behavior_tracking_config.enabled=true`, mailbox `verkoop@smeba.nl`). De Power Automate-sweep naar "Sugar Archive" staat UIT sinds 2026-06-05 (operator-bevestigd), dus inbox-signalen zijn niet langer vervuild. Live bewezen 2026-06-15 via drag-proef: een `inbox → afgehandeld/2026` move op een ge-ingeste mail leverde `moved_to_afgehandeld` + verdict `approve_handled` binnen één cron-tick (zie `.planning/phases/112.5-*/112.5-HUMAN-UAT.md`). **Eén deel nog dormant:** de `category_edited`-tak produceert pas signalen zodra Phase 117 `AI:`-categorieën schrijft voor `sales-email` (dan vult `swarm_written_categories` de baseline). *(Eerdere status t/m 2026-06-04: GEPAUZEERD wegens de Sugar-sweep — historisch, niet meer van toepassing.)*

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
- **Nieuwe swarm aansluiten** = één registry-UPDATE: `behavior_tracking_config = '{"enabled": true, "mailbox": "info@smeba.nl"}'` (optioneel `"weights": {...}` per-swarm override op `DEFAULT_WEIGHTS` in `signal-derive.ts`).
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
