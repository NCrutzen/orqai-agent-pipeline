# Phase 62: Classifier Rules Readability — Context

**Gathered:** 2026-04-30
**Status:** Ready for planning

<domain>
## Phase Boundary

Maak het classifier-rules dashboard begrijpelijker voor operators zonder code-toegang. Operators moeten kunnen zien (a) welke rules bestaan, (b) wat elke rule doet in plain Dutch, (c) hoe ze gegroepeerd zijn per category, en (d) of een nieuwe candidate overlapt met een bestaande promoted rule.

**In scope:**
- Schema: `is_system_rule` boolean kolom op `classifier_rules` (scheidt no_match-achtige fall-through-rijen)
- Code: `web/lib/debtor-email/rule-descriptions.ts` lookup met `{rule_key, category, label, plain_nl, examples}`
- Dashboard: groepering per category, expand-rij met plain_nl + GitHub-permalink, system-rules sectie apart
- Overlap-lint: cron-time berekening + dashboard info-icoon wanneer >50% match overlap met andere rule

**Expliciet uit scope:**
- Geen wijziging aan promotion-cron gate-logica (Wilson CI per `rule_key` blijft, telemetry-flow blijft)
- Geen wijziging aan `classify.ts` rule-implementatie (behaviour onveranderd)
- Geen rule consolidation of hierarchical refactor (deferred)
- Geen operator-editable labels via dashboard (deferred — alleen dev kan rule-descriptions.ts wijzigen)
- Geen blocking action op overlap (alleen waarschuwing, geen INSERT-block)

</domain>

<decisions>
## Implementation Decisions

### no_match en system-rules representatie
- **D-01:** Schema-change. Voeg `is_system_rule boolean NOT NULL DEFAULT false` toe aan `public.classifier_rules`. Update bestaande `no_match` rij naar `true`. Dashboard filtert op deze kolom: system-rules tonen in een aparte "System rules" sectie onder Promoted/Candidates, niet in Candidates-tabel.
- **D-02:** Migratie moet idempotent zijn (zoals andere classifier-migraties). Backfill statement zet `is_system_rule=true` waar `rule_key='no_match'` AND `swarm_type='debtor-email'`.
- **D-03:** Promotion-cron en spotcheck-sampler hoeven geen aanpassingen — die gebruiken `rule_key='no_match'` matching al. De `is_system_rule` flag is puur dashboard-concern.

### Human-readable labels & metadata
- **D-04:** Bron van waarheid = code, niet DB. Nieuw bestand `web/lib/debtor-email/rule-descriptions.ts` exporteert een `RULE_DESCRIPTIONS` map: `Record<rule_key, { category, label, plain_nl, examples?: string[] }>`. Dev-onderhouden, niet operator-editable in deze fase.
- **D-05:** Required fields per entry: `category` (string, e.g., `"ooo_temporary"`, `"payment"`, `"acknowledgement"`, `"system"`), `label` (NL display name, e.g., "Out-of-office antwoord op subject"), `plain_nl` (1-2 zin uitleg wat de rule precies matched). `examples` optional, array van representative subject-strings.
- **D-06:** Bij toevoegen nieuwe rule_key in `classify.ts`: ook entry in `rule-descriptions.ts` toevoegen. Type-check zorgt dat dashboard niet faalt op missing entry — fallback render: rule_key zelf + "(geen beschrijving)".

### Regex/conditie weergave
- **D-07:** Expand-rij in dashboard (klikken op rule-rij opent inline expansion). Toont:
  - `label` en `plain_nl` uit RULE_DESCRIPTIONS
  - `examples` als array (indien aanwezig)
  - Een "Bekijk implementatie ↗" link naar GitHub permalink: `https://github.com/Moyne-Roberts/agent-workforce/blob/{commit-sha}/web/lib/debtor-email/classify.ts#L{line}`
- **D-08:** Permalink-strategie: gebruik `git rev-parse HEAD` of een env-var `NEXT_PUBLIC_GIT_SHA` (Vercel zet `VERCEL_GIT_COMMIT_SHA` automatisch — gebruik die). Lijnnummer per rule_key staat in RULE_DESCRIPTIONS lookup als optional `source_line: number` veld.
- **D-09:** Lijnnummer-rot is bewust geaccepteerd: dev werkt rule-descriptions.ts bij wanneer classify.ts wordt gerefactored. Permalink met SHA betekent dat oude page-views naar de juiste regel wijzen op de toen-deployde versie.

### Category grouping
- **D-10:** `category` leeft in RULE_DESCRIPTIONS lookup (zelfde bestand als labels). Geen DB-kolom, geen derived-from-classify.ts.
- **D-11:** Dashboard groupt rules per `category` binnen elke status-sectie (Promoted / Candidates). Layout: collapsible group-headers, **expanded by default**. Volgorde categorieën: alfabetisch met system altijd onderaan (of in eigen sectie zoals D-01).
- **D-12:** Een category met één rule wordt nog steeds met header gerenderd — consistente UX, en operator ziet "deze category heeft maar één rule" als signaal.

### Overlap-lint
- **D-13:** Cron-time berekening in `classifier-promotion-cron`. Voor elke candidate-rule, query laatste N=200 `agent_runs` rijen waar deze rule fired AND een andere rule óók fired (multiple match scenario). Bereken overlap% = (rows met >1 rule match) / (rows met deze rule match).
- **D-14:** Schrijf overlap% naar nieuwe kolom `overlap_pct numeric` op `classifier_rules`, en log een notes-entry naar `classifier_rule_evaluations.notes` (text kolom, append-only audit) als overlap >50%.
- **D-15:** Dashboard toont info-icoon (ⓘ) naast rule_key in tabel wanneer `overlap_pct > 0.5`. Hover/click → tooltip "X% van matches worden ook door rule Y afgevangen — overweeg consolidatie of specifiekere conditie."
- **D-16:** Geen blocking actie. Alleen visueel signaal. Operator besluit of consolidatie nodig is.
- **D-17:** Implementation note: de "andere rule" detectie werkt alleen als `agent_runs` historisch alle matches per email logt, niet alleen de winnende. Verifieer in research-fase: zo niet, dan is shadow-evaluation nodig (run alle rules over recente emails offline, log alle matches per row).

### Claude's Discretion
- Exacte threshold voor overlap-icoon (50% is start, mag tijdens build naar 40% of 60% schuiven op basis van wat realistisch is met de huidige rule-set)
- Visuele styling van expand-rij (collapsible, modal, side-panel — kies wat past bij bestaande dashboard-patterns)
- Precieze copy van plain_nl strings — concept-strings volstaan, operator/dev tweakt later
- Icon-keuze voor system-rules sectie en overlap-warning

### Folded Todos
Geen — phase scope is volledig gedefinieerd uit dialog, geen pending todos die hier inhaken.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Classifier core
- `web/lib/debtor-email/classify.ts` — Bron van alle rule_keys en hun matching-logica. Elke rule_key in RULE_DESCRIPTIONS moet 1:1 corresponderen met een return-tak hier.
- `web/lib/inngest/functions/classifier-promotion-cron.ts` — Cron-flow waarin overlap-lint berekening moet landen. Niet aanpassen aan promotion-gate.
- `web/lib/classifier/wilson.ts` — Wilson CI berekening. Niet aanraken.

### Dashboard
- `web/app/(dashboard)/automations/classifier-rules/page.tsx` — Bestaande dashboard page. Hier landen alle UI-changes.
- `web/app/(dashboard)/automations/[swarm]/review/detail-pane.tsx` §240, §388 — Bestaand patroon waar `rule_key` al wordt fall-back op `no_match`. Consistente render-aanpak hanteren.

### Database
- `public.classifier_rules` — Tabel waar `is_system_rule` en `overlap_pct` aan toegevoegd worden. Migratie-bestand in `web/supabase/migrations/`.
- `public.classifier_rule_evaluations` — Append-only audit-tabel. `notes` kolom voor overlap-warnings.

### Project guardrails
- `CLAUDE.md` — MR Automations Toolkit guardrails. Inngest-cron patterns relevant voor overlap-lint berekening (alle side effects in `step.run()`).

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `classifier_rules` schema is al stabiel met status/n/agree/ci_lo kolommen. Twee kolommen toevoegen via standaard idempotent migratie-patroon.
- Dashboard page rendert al rules in twee secties (Promoted, Candidates). Group-by-category uitbreiding past op bestaande render-loop.
- Inngest cron heeft al `step.run` isolatie per rule. Overlap-berekening kan in een nieuwe step of inline na evaluation.
- `VERCEL_GIT_COMMIT_SHA` env var beschikbaar in productie voor permalink-generatie.

### Established Patterns
- Migraties idempotent (`IF NOT EXISTS`, `ON CONFLICT`). Volgen patroon van `20260429b_drop_classifier_rule_evaluations_daily_uniq.sql`.
- Code-side metadata-bestanden (zoals reeds bestaande `RULE_*` constants in classify.ts). Geen DB-driven config voor dev-onderhouden lookups.
- Dashboard reads via `createAdminClient()` en gebruikt service role server-side. Geen client-side schema-wijzigingen nodig.

### Integration Points
- `RULE_DESCRIPTIONS` lookup wordt gebruikt door:
  1. Dashboard page render (group + expand-rij)
  2. Tooltip-rendering bij overlap-icoon
  3. Eventueel ook door bulk-review UI in toekomst (out of scope nu, maar lookup is herbruikbaar)
- `is_system_rule` flag wordt gebruikt door dashboard filter; cron en sampler raken hem niet aan (zie D-03).
- Overlap-cron breidt `classifier-promotion-cron.ts` uit, niet een nieuwe Inngest function.

</code_context>

<specifics>
## Specific Ideas

- Operator-perspectief expliciet leidend: "kan een operator zonder code-toegang begrijpen wat elke rule doet en waarom?"
- User noemde eerder zorg over rule-explosie (subject_autoreply+body_temporary+...). Phase 62 lost dit niet op (consolidation deferred), maar overlap-lint geeft early signal als het probleem manifesteert.
- Plain Dutch labels — geen Engelse jargon-strings in dashboard. Voorbeeld: "Out-of-office antwoord (algemeen)" niet "subject_autoreply OOO match".

</specifics>

<deferred>
## Deferred Ideas

- **Rule consolidation / hiërarchie (richting B uit conversatie)**: bij volgende variant-toevoeging (`subject_autoreply+body_X` 4e versie) overwegen om base-rule + signal-tags model te introduceren. Trigger-conditie: 3e+ variant van zelfde subject_/payment_ stam.
- **Coverage-map matrix view**: visualisatie subject-patterns × sender-classes × body-keywords met dekking-cellen. Nuttig wanneer rule-set >25 wordt. Nu (18 rules) overkill.
- **Operator-editable labels (hybrid optie uit D-04 overweging)**: indien dashboard-gebruikers het zelf willen tweaken zonder PR. Pas zinvol als productowner dit expliciet vraagt.
- **Decision tree / signal scorecard refactor (richting C uit conversatie)**: fundamenteler herontwerp van classifier. Pas overwegen als rule-set >40 wordt of regex-onderhoud onhoudbaar wordt.
- **Blocking actie op overlap-lint**: huidige scope is alleen waarschuwing. Als operators consistent waarschuwingen negeren, kan een hard block bij INSERT van nieuwe candidate met >X% overlap toegevoegd worden.

### Reviewed Todos (not folded)
None — geen pending todos surfaced bij phase analysis.

</deferred>

---

*Phase: 62-classifier-rules-readability*
*Context gathered: 2026-04-30*
