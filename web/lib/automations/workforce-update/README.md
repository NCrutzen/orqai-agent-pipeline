# Agent Workforce Update

Terugkerende, voor eindgebruikers leesbare update over de agent workforce, in
Moyne Roberts huisstijl (wit · navy · oranje · blauwe golf). Eén contentbron per
editie voedt twee deliverables: een one-pager (PDF/PNG, mee te zenden) en een
PowerPoint (achtergrond voor een video-opname; hoofd-blob rechtsonder vrijgehouden).

- **Status:** live · editie #1 (juni, sinds lancering) + editie #2 (juni-maandoverzicht)
- **Type:** standalone-app (content-generator)
- **Databron:** Supabase (`email_pipeline`, `public.swarm_email_transitions`, `debtor`, `public.swarms`)

## ⚠️ Niet committed = kwetsbaar
Deze map stond untracked op `main` en is één keer verdwenen bij een repo-sync.
**Commit deze map** (of verplaats naar een eigen branch) zodat hij niet opnieuw
wordt opgeschoond.

## Mappen
```
content/<editie>.json        # de bron per editie (cijfers + redactie + matrix)
build/render_onepager.py     # JSON -> SVG -> PDF + PNG (one-pager)
build/render_pptx.js         # JSON -> PPTX (deck, video-achtergrond)
assets/avatars/*.png         # persona-avatars (Personas by Draftbit, CC BY 4.0)
assets/wave.png              # blauwe golf-motief (site-huisstijl)
editions/<editie>/           # gerenderde deliverables
```

## Renderen
```bash
# vereist: pip install cairosvg pillow --break-system-packages ; npm i pptxgenjs
python3 build/render_onepager.py content/<editie>.json <out_dir>
NODE_PATH=<node_modules> node build/render_pptx.js content/<editie>.json <out>/<editie>.pptx
# pptx -> pdf/png voor controle: soffice --headless --convert-to pdf ; pdftoppm
```

## Personas (roster + voorstellen)
Marshall · de Gatekeeper (Security check) · Cleo · de Smart Sorter · Iris · de
Customer Matcher · Debbie · de Team Lead · Quinn · de Drafter · **Robin · the
Router** (info@-routing, nieuw editie #2). Cleo/Debbie/Robin staan op de roster;
Marshall/Iris/Quinn zijn voorstellen — bevestig om ze officieel toe te voegen
(`public.agent_names`).

## Matrix-statussen (per mailbox)
- **Live** — handelt zelf af in Outlook (blauw ✓)
- **Dry-run** — label staat in Outlook, maar geen automatische actie (oranje ◐)
- **Shadow** — alleen in Bulk Review, niets in Outlook (leisteen ○)
- **Not yet** — nog niet (grijs –)

## Cijfers ophalen (per editie)
1. Mailbox-volume + live-detectie: `email_pipeline.emails` (45d/7d per mailbox).
2. Actieve verwerking: `public.swarm_email_transitions` (per mailbox/swarm).
3. Config-status: `debtor.labeling_settings` (dry_run/shadow) + `public.swarms`.
4. Highlights/roadmap: `.planning/` (afgeronde fases + pending todos) + git log.
**Eerlijkheid:** toon live vs dry-run vs shadow; "connected/ingest" ≠ "live".
