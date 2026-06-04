# Sugar cut-over: behavior-tracking sales weer aanzetten

**Aangemaakt:** 2026-06-04 · **Trigger:** de harde SugarCRM cut-over (datum onbekend; operator hoort hem van IT/beheer)

## Wat

Phase 112.5 (Outlook behavior tracking) is code-compleet en deployed maar **gepauzeerd** (`swarms.behavior_tracking_config.enabled=false` voor sales) omdat een Power Automate-flow verkoop@smeba.nl periodiek naar "Sugar Archive" veegt en alle inbox-signalen vervuilt.

## Hoe (volledig runbook)

→ **`docs/swarm-behavior-tracking.md`** — 5 stappen: PA-flow uit (preconditie, IT) → enable-UPDATE → delta-tokens reset → eerste tick verifiëren (bootstrap, 0 signalen) → sleep-test (`approve_handled`). Tegen Claude zeggen: *"Voer de Sugar cut-over reactivatie uit volgens docs/swarm-behavior-tracking.md"*.

## Open punt dat meegenomen moet

`skipped_sugar`-mapping: 3 geëxtraheerde transities matchten geen `emails.source_id` (2026-06-04). Onderzoeken bij stap 4/5 van het runbook; details in `112.5-04-SUMMARY.md` § "Activatie UITGESTELD".

## Gerelateerd

- Phase 115 (SugarCRM dead-code decommission) wordt door dezelfde cut-over getriggerd — combineer.
- De PA-flow zelf moet bij cut-over definitief uit (anders blijft de inbox leeglopen — incident 2026-06-04, 174 mails teruggezet).
