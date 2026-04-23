# Pattern block: Inngest-per-step vs agent-as-tool orchestration

**Status:** pending
**Priority:** low (follow-up docs)
**Owner:** Nick
**Source:** Discussion tijdens `/orq-agent` run voor debtor-email swarm, 2026-04-23

## Doel

Voeg een kort patroon-blokje toe aan `docs/orqai-patterns.md` zodat toekomstige agent-swarm-designs deze beslissing niet opnieuw hoeven te voeren.

## Inhoud (draft)

Section: **Orchestration: Inngest-per-step vs Orq agent-as-tool**

### Beslisregel

- **LLM moet kiezen tussen tools op basis van semantische reasoning**
  → agent-as-tool binnen Orq (sub-agent doet zelf meerdere tool-calls)
- **Tool-volgorde is dwingend OF tool is duur/flaky (>5s latency OF retry-gevoelig)**
  → Inngest orchestreert tussen stappen; Orq.ai doet alleen LLM-calls
- **Altijd:** `variables.email_id` (of equivalent correlation key) in elke
  Orq-call voor cross-system trace-joinbaarheid (Orq traces ↔ Inngest
  timeline ↔ Supabase `agent_runs`)

### Waarom agent-as-tool faalt bij flaky/dure tools

- Orq heeft geen durable step-retry. Partial failure → hele agent-run
  opnieuw → dure tool-call wordt herhaald.
- HITL "wacht op human review" blokkeert een Orq-run; Inngest
  `step.waitForEvent` is durable en schaalbaar.
- Per-agent prompt-replay voor evals is makkelijker als elke agent
  standalone Orq-call is in plaats van geneste orchestrator-call.

### Concreet voorbeeld

Debtor-email swarm:
- `debtor-intent-agent` (Orq, geen tools) → emit classificatie
- Inngest routeert op basis van intent
- `debtor-copy-document-body-agent` (Orq, geen tools) → emit cover-HTML
- Inngest doet in code: `fetchDocument` → `createIcontrollerDraft`
  (beide HTTP-calls met step-retry, `fetchDocument`-resultaat gecached
  in step-output zodat `createDraft`-retry niet opnieuw 26s Zap-chain
  triggert)

### Anti-patroon

Copy-Document als één Orq-agent met 2 tool-calls:
`fetchDocument` slaagt → `createDraft` faalt → hele agent-run failt
→ retry triggert opnieuw 26s Zap-chain voor PDF die we al hadden.

## Acceptance

- [ ] Section toegevoegd aan `docs/orqai-patterns.md`
- [ ] Cross-link vanuit `docs/inngest-patterns.md` naar deze sectie
- [ ] CLAUDE.md "Orq.ai Kritieke Patronen" sectie verwijst naar deze regel
