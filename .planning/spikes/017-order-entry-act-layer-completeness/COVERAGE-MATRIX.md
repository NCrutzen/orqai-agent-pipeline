# Order Entry coverage matrix — Koens taken × CTO-skills / NXT-endpoints

Eén rij per Order Entry-taak/SOP. Status: COVERED / PARTIAL / GAP / BROWSERLESS-ONLY / DECOMMISSIONED.
Bronnen: spike 013 (CTO-authoritative), spike 014 (live convergentie), `OrderEntry_AI_Enablement_v1.1.md`
+ SOP/Gwenda/claims-docs in `web/lib/automations/order-entry/research/`, CTO-skills `~/Downloads/skills/`.

> Convergentie-caveat: Camunda/Valtimo/Intelly/send-rules komen **alleen** van de CTO-kant (013/014),
> niet uit Koens research-docs (die noemen NXT/QuoteWerks/DocuWare/Outlook/Intelly). Echt, maar verspreid.

| Taak (Koen/SOP) | Vereiste act (systeem + endpoint/proces) | Gedekt door | Status | Noot |
|---|---|---|---|---|
| SOP02 — NXT-offerte→order (`SB`; `quote_accepted`, 2.208) | Open User Task `Resolution=won` → Order Genereren → `POST /api/orders` → DocuWare | nxt-user create-order | PARTIAL | #1 kandidaat. GAP = quote-accept-trigger + lineage; DocuWare apart |
| SOP03 — QuoteWerks→order (best. klant) | QW `Convert to Order`→Submit→NXT Vernieuwen | — | DECOMMISSIONED | QW desktop dood; herrouteren of escaleren |
| SOP04 — QuoteWerks→order (nieuwe klant) | `POST /api/customers`(+site) → QW convert → stammaand | nxt-user (customer/site/scheme) | PARTIAL / DECOMMISSIONED | Klant/site/stammaand gedekt; QW-helft dood. email=factuuradres (hard) |
| SOP05 — accu/noodverl. → detectie eerst | Mail-handoff + HITL, dan SOP02 | Stage-3 forward-router | PARTIAL | Geen NXT-write; H&B = enige skip-uitzondering |
| SOP06 — Backorder van monteur (`backorder`, ~3,9k) | CO-taak open, `stockAllocationRequired`, save | nxt-user (order-update) | PARTIAL | 014 splitst backorder→Valtimo (camunda-tasks); glue = swarm |
| SOP07 — Direct klantmail → magazijnorder (TO) | `POST /api/orders` magazijnorder → dispatch "rode pijltje" → Tablet Dispatch | nxt-user (create) | PARTIAL / BROWSERLESS | Create REST; dispatch-gebaar + Tablet = UI |
| SOP08 — QuoteWerks → magazijnorder | QW convert → `Verwijder instelling` → dispatch | — | DECOMMISSIONED | QW dood |
| SOP09 — Storing / Shell (CO) | `POST /api/orders` type=Storing open, `O0XXTEXT`+voorrijkosten → mail Planning(+Pascal) | nxt-user (create) | PARTIAL | Create gedekt; werkadres-cascade + Shell-SLA = HITL; mail = Graph |
| SOP10 — Werkadres typo-correctie | `PUT /api/sites/{id}` | nxt-user (update site) | COVERED | Schone site-write |
| SOP11 — Nieuwe locatie + stammaand | `POST /api/sites` + `/orderSchemes` | nxt-user + amend-order-scheme | COVERED | Exact nxt-user-territorium |
| SOP12 — Jumbo BE nieuwbouw (EP+EX+MO) | 2× QW-conversie (sluit/heropen) → NXT order A + EX order B → Elger/facturatie | partial (nxt-user NXT-deel) | DECOMMISSIONED (kern) | Dual-QW = spine, dood; NXT-deel HITL-zwaar |
| SOP15 — Stammaand / preventief onderhoud (MO) | `POST /api/sites/{id}/orderSchemes` (Einddatum-leeg=hard, freq, behandeltijd) | nxt-user + amend-order-scheme | COVERED | einddatum-NULL hard te encoderen |
| SOP16 — Plattegronden NL (EP) | QW → NXT EP + `VW0004` → Dropbox + Emrode + G-schijf + post | partial (NXT EP-order) | DECOMMISSIONED + BROWSERLESS | Koen: "NIET automatiseren" |
| SOP17 — Doorgestreepte regels (`order_wijziging`) | Order Genereren → niet-akkoord-regels deleten (voorrijkosten blijft) | nxt-user (create + line-edit) | PARTIAL | 014: build. voorrijkosten-blijft guardrail |
| SOP18/19 — AED maandbatch (MOEX) | NXT-filter MOEX → bulk-dispatch rol `Specialist AED` → rapportage-site Generate/stuur-mail → mail Keurmerkinstituut | — | BROWSERLESS-ONLY | Volledig UI; nu Henk's, buiten AI-scope |
| SOP19 — Defensie order/storing | `POST /api/orders` + MM-nr in Ref1, CO2-staal → mail Anja/John → DocuWare; BestelAPP trainingsblussers | nxt-user + guardrail-gate | PARTIAL | MM-validatie HITL; CO2-staal-marine-gate bouwen; BestelAPP apart |
| SOP20 — Dirk/Dekamarkt | `POST /api/orders` + stammaand; tak 737.07 vs 182 | nxt-user | PARTIAL | Dirk €500/gebouw-guardrail = build; picto 3100313489 vervallen |
| SOP21 — Lidl verbouw/kast | `POST /api/orders` Lidl, factuur→leverancier | nxt-user | PARTIAL | kast → Corrie HITL; 3 regio's €0 guardrail |
| SOP22 — 's Heeren Loo regio-keten | regio-sub-site → `POST /api/orders` | nxt-user | PARTIAL | blocked-werkadres-no-reactivate guardrail = build |
| SOP23 — Noordam (EX op PROSPECT + CAPS) | `POST /api/orders` EX prospect + codes → CAPS sub → bij factuur dispatch EX | nxt-user (prospect native) | PARTIAL | EX+prospect gedekt; Noordam-factuur-wait = HITL; +10%-guardrail |
| SOP24 — STB (MO/EI; vaak SMEQ-intake) | prijscheck → MO/EI nieuw werkadres; **€0-mandaat** | nxt-user + guardrail-gate | PARTIAL / QW-indirect | €0-mandaat-gate = build; SMEQ-intake decommission raakt STB |
| SOP25 — Plus/Coop | franchise 540576 vs eigen 532391 → `POST /api/orders` | nxt-user | PARTIAL | Coop→Plus-migratie; coördinator Udo Tomassen |
| SOP26 — "Inzake X"/aannemer | `POST /api/sites` onder aannemer + `POST /api/orders` ref "inzake…" | nxt-user | PARTIAL | pattern-detectie (geen nieuw stam) = logic-gate build |
| SOP27 — Mono-TO leveranciers (TO) | `POST /api/orders` TO, `Verwijder instelling`, dispatch rode pijltje → Tablet Dispatch | nxt-user (create) | PARTIAL / BROWSERLESS | **Beste autonome kandidaat** (geen verkoop). Dispatch = UI. Allowlist-gate |
| SOP28 — Multi-site keten (meta) | Werkadres-cascade; geen nieuw hoofdklant | nxt-user | PARTIAL | Patroon, geen enkele mutatie; onder 12/19/21/22 |
| Opzegging → block site/customer (`opzegging`, 144) | order cancel + mail planning; block: `POST /api/cancellations` (top-down) | nxt-user `cancel.py` (confirmed) | COVERED (skill) / PARTIAL (orchestr.) | GAP = voorraad/lopende-orders-check → planning → block-sequence |
| order_wijziging (intent) | order-line-edit / scope-change | nxt-user (update) | PARTIAL | zie SOP17; 014: build |
| credit / return (UO/UOW; `credit_return`, 151) | negatieve-qty-regels; monteur-retour=credit, magazijn-retour=reminder | nxt-user (negatieve lines) | PARTIAL | geen eigen SOP; 014 licht 't uit als eigen handler |
| status-vraag (`status_question`, 2.029) | WO opzoeken → mail planning | Stage-3 forward-router | COVERED (router) | geen NXT-write |
| offerte afgewezen / lost (`quote_retracted`) | Open User Task `Resolution=lost` | nxt-user / Camunda-task | PARTIAL | zelfde quote-state-glue als `won` nodig |
| niet-order mail / platform_notificatie (~3k) | Outlook forward/move | Stage-3 forward-router (Graph) | COVERED (router) | forwarder, geen act |
| per-klant-guardrails (STB €0, Defensie-MM+CO2-marine, Dirk €500, Jumbo-template, H&B, voorrijkosten, stockAlloc-via-Verwijder, voorraad-before-block) | deterministische gates buiten de LLM, orthogonaal aan intents | — (bestaat niet) | GAP | 014: build per-klant-guardrail-gates |
