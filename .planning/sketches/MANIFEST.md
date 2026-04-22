# Sketch Manifest — Smeba Draft Review Frontend

## Design Direction
Frontend voor Andrew (engelstalige reviewer) om door Smeba sales-AI gegenereerde drafts te beoordelen, bewerken en verzenden. Dense-maar-ademend tool-gevoel, geïnspireerd door Braintrust's trace review UI. Dark-first, amber accent, gebouwd met dezelfde design-tokens als de bestaande MR Automations dashboard (shadcn + Tailwind v4) zodat de stap naar productie klein is.

## Reference Points
- **Braintrust trace review** — 3-panel layout met collapsible annotation-panel, pass/fail verdict, issue tags, dark mode + oranje accent
- **MR Automations dashboard** — bestaande shadcn/tailwind setup (web/app/globals.css), Satoshi/Cabinet/Geist Mono fonts, OKLCH kleurenpalette

## Field Scope (15 velden)

**Context (lezen):** ontvangen mail · gebruikte context · AI-redenering · confidence · SLA-indicator · status
**Draft (lezen + bewerken):** NL-draft (verstuurd) · EN-draft (Andrew leest) · inline edit met diff
**Review (invullen):** 👍/👎 · defect-categorieën · feedback tekst
**Acties:** Approve & Send · Send back to AI · Reject

## Sketches

| # | Name | Design Question | Winner | Tags |
|---|------|----------------|--------|------|
| 001 | review-layout | Which page layout works best for Andrew's draft review? | **A — Classic 3-panel** | layout, review, smeba |
