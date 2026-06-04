# Phase 113: Stage 3 Sales Intent Agent (greenfield) - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-06-04
**Phase:** 113-stage-3-sales-intent-agent-greenfield
**Areas discussed:** Vocabulary seeding pipeline, Customer-vs-prospect axis, Go-live gating & human-lane volume, Agent design & ranked output

---

## Vocabulary seeding pipeline

| Option | Description | Selected |
|--------|-------------|----------|
| Reuse 86/87 retro machinery | Sales retro-classify pass → proposals in existing intent_proposals surface → operator promotes | ✓ |
| One-shot mining script | Single LLM pass + report; bypasses Phase 86 surface | |
| Live-only discovery | No retro seeding; vocabulary grows from live traffic only | |

| Option | Description | Selected |
|--------|-------------|----------|
| Coverage threshold | Promote until ≈80% of retro corpus maps to a promoted intent | ✓ |
| Fixed starter set | Top 5-8 clusters by volume | |
| Promote everything proposed | All clusters after review | |

| Option | Description | Selected |
|--------|-------------|----------|
| Post-Stage-1 inbound only | Mail that survives the noise filter — the population Stage 3 sees | ✓ |
| Full inbound corpus | Including noise | |
| Outlook + SugarCRM historic | Bigger sample incl. pre-cutover mail | |

| Option | Description | Selected |
|--------|-------------|----------|
| Batch migration after promotion | One migration + codegen + Orq schema in one atomic commit | ✓ |
| Promotion writes registry directly | UI INSERTs live; drift-window until codegen+deploy | |
| Hybride (registry-driven schema) | UI writes + Orq schema read at startup/deploy | |

**User's choice:** Reuse retro machinery · coverage threshold · post-Stage-1 corpus · batch migration
**Notes:** User asked "Wat is het verschil tussen 1 en 2?" on the promotion mechanics — chose batch migration after explanation of the enum drift-window (deployed closed-list schema can't return a live-inserted intent).

---

## Customer-vs-prospect axis

| Option | Description | Selected |
|--------|-------------|----------|
| Beide: prompt + generieke as | Resolution as prompt context AND swarm-agnostic nullable entity_relationship output axis | ✓ |
| Alleen prompt-context | Input-only, no persistent axis | |
| Alleen output-as | Content-only classification, ignores Stage 2 data | |

| Option | Description | Selected |
|--------|-------------|----------|
| Live PipelineStageContext | Read resolution from the Stage 2→3 envelope per the contract | ✓ |
| Audit-tabel lookup | Separate query on resolution_audit | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Ja, batch-resolve eerst | Run 114 resolver dry-run over retro corpus before discovery | ✓ |
| Nee, clusters zonder resolutie | Content-only discovery | |
| Alleen waar al audit-data is | Opportunistic coverage | |

**User's choice:** Both prompt + generic axis · live envelope · batch-resolve first
**Notes:** User asked "Denk je dat item 2 niet ook kan helpen om de Debtor mails te optimaliseren?" — answered yes if designed swarm-agnostically (unresolved-sender triage); debtor adoption deferred. Mid-area user note about SugarCRM sent-replies harvest + chat-agent → deferred ideas.

---

## Go-live gating & human-lane volume

| Option | Description | Selected |
|--------|-------------|----------|
| 116 vóór 113 | Re-sequence attachment ingest before this phase | ✓ |
| Minimale capture in 113 | Prereq-task style attachment capture only | |
| 113 zonder bijlagen | Body-text v1, re-run discovery later | |

| Option | Description | Selected |
|--------|-------------|----------|
| Dry-run observatie eerst | Verdicts Bulk Review-only until promoted | ✓ |
| Direct live naar Kanban | Immediate routing | |
| Gefaseerd per intent | Per-intent gating | |

| Option | Description | Selected |
|--------|-------------|----------|
| Flip naar Kanban na review | End-station: routing live after operator green light | ✓ |
| Dry-run tot eerste handler | Defer flip to V11.0 | |
| Flip + Outlook-categorie | Plus intent as Outlook category | |

| Option | Description | Selected |
|--------|-------------|----------|
| ~100 verdicts, Bulk Review | Fixed sample anchor | |
| 200/categorie-stijl | Per-intent statistical minimums | |
| You decide | Claude picks at planning from intent distribution | ✓ |

**User's choice:** 116 before 113 · dry-run first · flip after review · sample size at Claude's discretion
**Notes:** Mid-area user note "bijlagen zijn belangrijk om ook uit te lezen zodat we stage 2 en 3 goed kunnen draaien" → triggered the sequencing question. User asked "Een flip heeft toch alleen maar nut als er handlers zijn... of maak ik een denkfout?" — explained the human-lane IS the STAGE3-03 deliverable; also corrected own earlier claim (intent volume data exists in dry-run too). User then asked "Wat denk jij?" — recommended flip-after-review; user agreed ("Akkoord").

---

## Agent design & ranked output

| Option | Description | Selected |
|--------|-------------|----------|
| Zelfde als debtor-intent-agent | Mirror proven debtor classifier config | |
| Sonnet 4.5 direct | | |
| You decide | Catalog-validated choice at planning | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Zelfde call, debtor-patroon | Open-set proposal rides in the classifier response | ✓ |
| Aparte discovery-agent | Separate retro-only discovery agent | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Ja, v3-shape + uitbreiding | Debtor intent-v3 ranked-list + entity_relationship extension, XML prompts, NL examples | ✓ |
| Nieuw sales-schema | | |
| You decide | | |

| Option | Description | Selected |
|--------|-------------|----------|
| Scripted via Orq API | create→PATCH→verify, codegen-driven enum | ✓ |
| Handmatig in Studio | | |
| You decide | | |

**User's choice:** Model at Claude's discretion · same-call discovery · v3 shape extended · scripted via API

---

## Claude's Discretion

- Model choice for sales-intent-agent (list_models-validated, debtor config as anchor)
- Operator sample size for go-live green light (~100 anchor)
- Exact entity_relationship axis values + persistence location (swarm-agnostic, nullable, no shared-code edits)
- Retro-run batching/cost control (respect 40k hard-cap fail-loud pattern)

## Deferred Ideas

- SugarCRM sent-replies harvest + storage as handler knowledge source (⚠ before/independent of Phase 115 decommission; Power Automate sweep until cut-over)
- Temporary chat-agent for employees consuming that knowledge base
- Debtor adoption of the entity_relationship axis
- Outlook-categorie side-effect (intent as Outlook category) — post Sugar cut-over / 112.5 activation
