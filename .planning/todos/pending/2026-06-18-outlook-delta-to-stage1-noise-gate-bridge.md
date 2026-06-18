# Outlook-delta → Stage-1 noise-gate brug (cross-swarm shared cats)

**Aangemaakt:** 2026-06-18 · **Tag:** V10.0 (self-learning consumptie) · **Re-evaluatie-trigger:** V9.7 info@ go-live · **Status:** geparkeerd, NIET oppakken vóór trigger

## Wat

Quick task 260618-iwx maakte Stage-1 noise-categorieën cross-swarm (gedeelde `swarm_type='*'`). De per-swarm promotie-gate houdt nieuwe categorieën in **observe** (`status='predicted'`, Bulk Review) tot elke swarm zelf bewijs opbouwt. Dat bewijs = `agent_runs.human_verdict`.

**De gap:** Outlook-delta verdict-harvesting (Phase 112.5) schrijft naar **`swarm_review_signals`**, niet naar `agent_runs.human_verdict`. Geverifieerd 2026-06-18:
- Stage-1 noise promotie-cron (`classifier-promotion-cron.ts`) leest `classifier_rule_telemetry` → `agent_runs.human_verdict`. Gevoed door **alleen** expliciete Bulk Review / feedback-route clicks.
- `swarm_review_signals` (waar 112.5 landt, `swarm-behavior-sync.ts:60`) wordt vandaag **alleen** geconsumeerd door `stage-3-intent-label-worker.ts` (Stage 3 intent-correctielus, Phase 117).
- **Geen enkele writer** vult `agent_runs.human_verdict` vanuit `swarm_review_signals` (lege grep).

Gevolg: iemand die in Outlook een ten onrechte gearchiveerde mail terugtrekt (`restore_from_archive` → `correctie_false_positive`) **bereikt de Stage-1 noise-gate niet** → auto-archive voor de gedeelde categorieën flipt alleen via Bulk Review-clicks, niet via Outlook-gedrag.

## Waarom geparkeerd (niet nu bouwen)

- **Niet blokkerend / niks kapot.** Feature werkt; gate houdt alles veilig in observe; promotie kan via Bulk Review.
- **Input stroomt nog niet.** 112.5 is voor noise nog niet geactiveerd (wacht op Sugar cut-over, scoped op verkoop@ — zie `2026-06-04-sugar-cutover-enable-behavior-tracking.md`). Consument bouwen vóór de bron = speculatief.
- **Architectonisch V10.0-vormig.** De brug is "self-learning consumptie" — los bouwen riskeert dubbel werk zodra de V10.0 Promotion Recommender een uniforme signaal-ingestie ontwerpt.
- **Geen dataverlies tijdens parkeren.** Signalen blijven in `swarm_review_signals`; een latere brug kan de historie backfillen.

## Hoe (schets — uitwerken bij oppakken)

Eén van:
1. Een writer/bridge die geschikte `swarm_review_signals` (approve_handled / correctie_false_positive) mapt naar `agent_runs.human_verdict` op de bijbehorende Stage-1 run, OF
2. De Stage-1 promotie-cron `swarm_review_signals` mede laten lezen (uniforme telemetrie-bron).

**Subtiliteit die meegenomen MOET worden:** de false-positive-afleiding (`signal-derive.ts:140`) joint op `pipeline_events stage=4` (handler), maar noise archiveert op **Stage 1** — dus zelfs het signaal-matchen is mogelijk niet gedekt voor noise. Verifieer + breid de ledger-join uit naar Stage 1 vóór de brug nut heeft.

## Re-evaluatie-moment

Bij **V9.7 info@ go-live**: info-routing bezit juist deze noise-categorieën. Zodra info@ live is en operators in Outlook noise corrigeren in de verwachting dat het systeem leert, wordt de gap gebruiker-zichtbaar. Beslis dan of we 'm vóór V10.0 trekken.

## Gerelateerd

- Bron-feature: `.planning/quick/260618-iwx-cross-swarm-noise-rules-shared-scope-op-/260618-iwx-SUMMARY.md` (Out-of-scope: Outlook-delta).
- 112.5 activatie: `2026-06-04-sugar-cutover-enable-behavior-tracking.md`.
- Phase 117 (intent-correctielus, het bestaande `swarm_review_signals`-pad) — model voor de noise-variant.
- V10.0 Promotion Recommender + Learning Inbox (ROADMAP.md regel 23).
</content>
