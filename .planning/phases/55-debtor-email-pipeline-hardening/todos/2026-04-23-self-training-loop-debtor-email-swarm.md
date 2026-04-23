# Self-training loop voor debtor-email swarm

**Status:** pending
**Priority:** medium (phase 1 hooks zijn blocker voor phase 2 loop)
**Owner:** Nick
**Source:** `/orq-agent` discussion 2026-04-23 — Area 3 Q1 follow-up
**Related:** `.planning/briefs/2026-04-23-debtor-email-swarm-brief.md` §9, sibling intent-agent todo

## Doel

Een feedback-loop waardoor de intent-agent en copy-document body-agent continu verbeteren op basis van gedrag van debtor-reviewers in iController (HITL correcties).

## Phase 1 hooks (BLOCKING — moet mee in architect-brief)

Deze moeten mee-ontworpen worden met de agents, anders moeten we data retro-engineeren.

### 1. `debtor.agent_runs` schema

Vanaf dag 1 de volgende kolommen:

```
email_id                 uuid (FK naar email_pipeline.emails)
intent                   text
sub_type                 text
document_reference       text
confidence               text        -- high|medium|low
tool_outputs             jsonb       -- fetchDocument response, createDraft response
draft_url                text
body_version             text        -- prompt-versie (git-sha of semver) — CRUCIAAL
intent_version           text        -- idem voor intent-agent
human_verdict            text null   -- approved|edited|rejected|wrong_attachment|wrong_intent|wrong_language|wrong_tone
human_notes              text null
verdict_set_at           timestamptz null
created_at               timestamptz default now()
```

Zonder `body_version` + `intent_version` kun je NOOIT zeggen "prompt v3 deed 20% beter dan v2".

### 2. Minimale review-UI (fase 1.5)

Supabase-gebackte pagina per draft: "ging dit goed? 👍 / 👎 + reason". 10s per draft, 2 clicks.
Doel: 200+ labeled rows binnen 4 weken shadow-mode.

### 3. Prompt-versioning discipline

Elke wijziging aan system-prompt van intent-agent of body-agent krijgt een bump van `*_version`. Git-hook of CI-check die dit afdwingt is optioneel maar verstandig.

## Phase 2 design (ontwerp zodra phase 1 hooks live + 200 labeled rows)

### Signaal-bronnen uit iController

1. **Draft volledig afgekeurd** (reviewer schrijft nieuw) → intent of cover-text fout
2. **Draft verzonden met edits** → body-diff = training-signaal voor body-agent
3. **Draft verzonden zonder edits** → positive example
4. **Draft verzonden met andere PDF** → fetchDocument pickte verkeerde invoice_id → disambiguation-training
5. **Human-queue row later handmatig opgelost** → ground-truth voor intent/reference

### iController → Supabase sync

Geen webhooks (iController is browser-only). Opties:
- **Periodic Playwright-scan** (dagelijks via Inngest cron) van recent-sent items, diff tegen onze draft-bodies
- **Manuele verdict-UI** (zie phase 1 punt 2) — minder accurate maar veel goedkoper
- Beide kunnen naast elkaar: UI voor snelle 👍/👎, scan voor body-diff

### Prompt-iteratie workflow

- Wekelijkse `Orq experiment` run tegen groeiende labeled dataset
- Failures + edits voeden `/orq-agent:iterate`
- Nieuwe prompt-versie → `body_version` bumped → shadow-test 1 week → promote als metric verbetert

## Acceptance criteria

- [ ] Phase 1: `debtor.agent_runs` tabel live met alle velden inclusief `*_version`
- [ ] Phase 1: review-UI draait, ≥3 reviewers actief labelen
- [ ] Phase 1: 4 weken shadow → ≥200 labeled rows met verdict
- [ ] Phase 2: Orq dataset groeit wekelijks vanuit Supabase (cron-sync)
- [ ] Phase 2: eerste meetbare prompt-iteratie (v1 → v2) met statistisch significant verschil op ≥50 emails
- [ ] Phase 2: iController body-diff detectie werkt (of is bewust afgeschreven)

## Open vragen

- Wie gaat labelen? 3 debtor-medewerkers beurtelings, of één eigenaar?
- Welke latency is acceptabel tussen send-in-iController en verdict-in-Supabase? (Direct via UI = sync; via body-diff scan = tot 24u delay)
- Moet `human_verdict` retro-actief getriggerd worden voor al verstuurde drafts (vóór de review-UI bestond)?
