# Swarm Behavior Tracking — runbook

Passieve feedback-loop (Phase 112.5): een cron-worker (`swarm/behavior-sync`, elke 5 min business-hours) volgt mail-transities in Outlook via Graph delta-sync en destilleert review-signalen (approve/correctie) per `pipeline_event`. Registry-driven: aan/uit per swarm via `public.swarms.behavior_tracking_config` — **geen deploy nodig**.

**Status sinds 2026-06-04: GEPAUZEERD voor sales** — een Power Automate-flow veegt verkoop@smeba.nl periodiek naar "Sugar Archive" en vervuilt elk inbox-signaal. Reactivatie hoort bij de **harde Sugar cut-over** (datum onbekend bij schrijven).

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

**Stap 5 — Open punt meenemen:** bij de pauze (2026-06-04) vielen 3 geëxtraheerde transities als `skipped_sugar` (immutable id matchte geen `emails.source_id`-rij). Mechanisme werkt t/m extractie; de email-koppeling voor niet-geïngeste/oudere mail moet onderzocht. Als stap 4 óók `skipped_sugar` toont i.p.v. een signaal: dit eerst fixen (zie `112.5-04-SUMMARY.md`).

---

## Architectuur in één oogopslag

- **Tabellen**: `outlook_delta_tokens` (delta-state per folder), `outlook_folder_map` (folder→bucket registry, ancestry-aware: jaar-submappen onder "afgehandeld" erven die bucket), `swarm_email_transitions` (append-only raw), `swarm_review_signals` (verdicts). Alle RLS/service-role.
- **Verdicts** (operator-weging 2026-06-04): `moved_to_afgehandeld`→approve_handled · restore-uit-Archief-van-door-ons-gearchiveerd→**correctie_false_positive** (sterkst; ledger-join op `pipeline_events` stage-4) · categorie-wijziging→reclassify · reply→approve_replied · self-archive→zwak · `left_to_untracked` (sweep/onbekende map)→geen verdict, alleen observability.
- **Nieuwe swarm aansluiten** = één registry-UPDATE: `behavior_tracking_config = '{"enabled": true, "mailbox": "info@smeba.nl"}'` (optioneel `"weights": {...}` per-swarm override op `DEFAULT_WEIGHTS` in `signal-derive.ts`).
- **Nieuwe afgehandeld-jaarmap** (jaarlijkse ritueel): wordt automatisch ontdekt (per-tick folder-refresh) en via bootstrap-correlatie met terugwerkende kracht gekoppeld aan eerdere `left_to_untracked` verdwijningen.
- **Code**: `web/lib/email-behavior/` (pure helpers + tests) en `web/lib/inngest/functions/swarm-behavior-sync.ts`. Phase-artefacten: `.planning/phases/112.5-*/`.
