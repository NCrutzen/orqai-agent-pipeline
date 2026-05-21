# Phase 62: Classifier Rules Readability — Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-04-30
**Phase:** 62-classifier-rules-readability
**Areas discussed:** no_match representation, Human-readable labels, Regex/conditie weergave, Category grouping, Overlap-lint scope

---

## no_match representatie in UI

| Option | Description | Selected |
|--------|-------------|----------|
| Quick-fix: filter uit Candidates | Pure UI-wijziging, sluit no_match uit Candidates render. Geen schema. | |
| Aparte "System rules" sectie | UI-only sectie naast Promoted/Candidates, geen schema. | |
| Schema-change: is_system_rule kolom | Boolean kolom op classifier_rules, default false, true voor no_match. Dwingt structurele scheiding af. | ✓ |

**User's choice:** Schema-change met `is_system_rule` kolom
**Notes:** Voorkomt dat toekomstige fall-through-rules hetzelfde probleem geven. Cleaner long-term. UI rendert system-rules in eigen sectie.

---

## Human-readable labels — bron van waarheid

| Option | Description | Selected |
|--------|-------------|----------|
| Code: RULE_DESCRIPTIONS lookup | Nieuw bestand `web/lib/debtor-email/rule-descriptions.ts`. Dev-onderhouden, geen DB. | ✓ |
| DB-kolom human_label | Operator-editable via dashboard. Risico op label/code drift. | |
| Hybrid: code default + DB override | Code canonical, DB override-only. Meer complexity. | |

**User's choice:** Code-only RULE_DESCRIPTIONS lookup
**Notes:** Eén plek voor dev-metadata. Operator-editable labels zijn geen huidige need. Hybrid blijft achter de hand voor toekomst.

---

## Regex/conditie weergave

| Option | Description | Selected |
|--------|-------------|----------|
| Beide: code-link + plain_nl uit RULE_DESCRIPTIONS | Expand-rij met plain Dutch uitleg + GitHub-permalink naar classify.ts:line-N. | ✓ |
| Alleen GitHub-permalink | Goedkoopst. Operator moet code lezen. Permalink-rot bij refactor. | |
| Alleen inline weergave uit lookup | Geen code-link. Risico: lookup en code drift uit elkaar. | |

**User's choice:** Beide — plain_nl + GitHub permalink
**Notes:** Plain_nl is voor operators, code-link is voor verificatie/audit. Permalink met VERCEL_GIT_COMMIT_SHA voorkomt dat oude pages naar verkeerde regel wijzen.

---

## Category grouping — bron en granulariteit

| Option | Description | Selected |
|--------|-------------|----------|
| Hardcoded mapping in RULE_DESCRIPTIONS | Categorie-veld in zelfde lookup. Eén bestand voor alle metadata. | ✓ |
| Nieuwe category kolom op classifier_rules | DB-driven groupering. Risico: drift bij nieuwe rule. | |
| Derived: live afgeleid uit classify.ts | Import shape uit classify.ts. Werkt alleen als shape stabiel. | |

**User's choice:** Hardcoded in RULE_DESCRIPTIONS, expanded by default
**Notes:** Dezelfde lookup voor labels en categories. Single bestand voor dashboard-metadata. Single rule per category nog steeds met header — consistent.

---

## Overlap-lint scope

| Option | Description | Selected |
|--------|-------------|----------|
| In scope: cron-time warning + UI banner | Cron berekent overlap%, schrijft notes. Dashboard toont info-icoon bij >50%. | ✓ |
| In scope: alleen UI info-icoon | Dashboard berekent on-the-fly. Lichter, duurder per page-load. | |
| Defer naar latere fase | Niet kritiek nu. | |

**User's choice:** Cron-time warning + UI banner
**Notes:** Geen blocking actie — alleen visueel signaal. Operator besluit consolidatie. Implementation note: vereist dat agent_runs alle matches per email logt, niet alleen winnende — verifieer in research-fase.

---

## Claude's Discretion

- Exacte threshold voor overlap-icoon (50% start)
- Visuele styling van expand-rij (collapsible / modal / side-panel)
- Precieze copy van plain_nl strings
- Icon-keuze voor system-rules en overlap-warning

## Deferred Ideas

- Rule consolidation / hiërarchie — trigger bij 3e+ variant van zelfde stam
- Coverage-map matrix view — bij rule-set >25
- Operator-editable labels — als dashboard-users dit expliciet vragen
- Decision tree / signal scorecard refactor — bij rule-set >40
- Blocking actie op overlap-lint — als waarschuwingen consistent worden genegeerd
