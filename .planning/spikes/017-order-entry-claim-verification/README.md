---
spike: 017
name: order-entry-claim-verification
type: standard
validates: "Koens voorwerk is per werkregel 'provisional until live-verified'. Deze spike harvest élke concrete, toetsbare claim uit de volledige order-entry/research-set (klantnummers, artikelnummers, order-types, tarieven, mailboxen) en verifieert ze READ-ONLY tegen de levende systemen: NXT SQL (via Zapier-SDK-SQL) + de Supabase-mailcorpus. Sluit de validatielaag boven 012–016 vóór een V10.5-fase wordt gepland."
verdict: "DONE 2026-06-24. De kern van Koens werk is solide en nu hard onderbouwd; live-toetsing bevestigde de order-types (nxt.dbo.order_type_bx, 34 codes — handleiding-vs-audio STRIJDIG beslecht), ~28 klantnummers (naam+merk+postcode corroboreren), de kern-artikelen + O0XXTEXT (€0, 18 min), en Defensie all-in €20,98/eenheid (price_bx). Live toetsen ving ~8 concrete fouten/drifts die anders de eerste handler in zouden lekken: 530984≠Jumbo (=De Grabbelton), 540649 nog ACTIVE, 491961 INACTIVE, picto 3100313489 nog ACTIVE (zou vervallen), verouderde Lidl-prijzen, 3 afwezige klantnummers, BE order-inbox niet geïngest. Reachability-bevinding: de hele NXT SQL-server (customers/order-types/items/prices) is read-only queryable via Zapier-SQL — géén dev-env nodig. Alleen NXT-writes/UI/DocuWare vereisen dev-env; QuoteWerks is uitgefaseerd. Detail + volledige checklist: BACKLOG.md."
related: [010b, 012, 013, 014, 015]
idea: order-entry-act-proof
tags: [order-entry, v10.5, live-verification, nxt-sql, claims, read-only]
---

# Spike 017: order-entry claim-verification (Koens voorwerk vs live NXT)

Harvest + live-toets van élke concrete claim uit Koens `order-entry/research/`-set tegen de levende
systemen. Volledige claim→bron→methode-checklist en alle resultaten: **`BACKLOG.md`** (naast deze README).

## Wat live bevestigd is
| Dimensie | Live-bron | Resultaat |
|---|---|---|
| Order-types | `nxt.dbo.order_type_bx` (34) | ✅ handler-set compleet; STRIJDIG beslecht; `OP/CAPS/MOEL/…` zijn geen live order-types (CAPS=omschrijving van MORI) |
| Klanten | `nxt.dbo.customer_bx` / `resolver_customer` | ✅ namen+merk+postcode bevestigen identiteit (Dirk/Deka/Defensie/Equans/Plus/Gasunie/STB/Jumbo-BE) |
| Artikelen | `nxt.dbo.item_bx` | ✅ 51270005 voorrijkosten, 1310123102 CO2-staal, verbandtrommels; **O0XXTEXT = €0, 18 min** |
| Prijzen | `nxt.dbo.price_bx` | ✅ Defensie all-in **€20,98**/eenheid (klant-prijslijst, source_type=Customer) |
| Volumes | `nxt.dbo.orders_bx` | ✅ alle order-types actief mét volume |
| Mailboxen/intents | Supabase `email_pipeline.emails` / `swarm_intents` | ✅ NL/FI/BB order-inboxen live; sales-intents placeholder |

## Discrepanties gevonden (de opbrengst van live toetsen)
- **530984 ≠ Jumbo-BE** → in NXT = "De Grabbelton" (klapper-mislabel).
- **540649** ("vervallen Jumbo-BE") nog **ACTIVE**; **491961** ("Detail Result Productie") = "Detailresult Slagerijen", **INACTIVE**.
- **Picto 3100313489 nog ACTIVE** terwijl Ans 'm als vervallen-per-15-04-2026 opgaf.
- **Lidl-prijslijst-prijzen gedrift** (klapper verouderd; live = waarheid).
- **514295 / 477533 / 426199** niet in `customer_bx` (nummer onjuist of andere regio).
- `order@smeba-fire.be` (BE) + `Storing.Smeba@smeba.nl` (AED) niet geïngest in de corpus.

## Reachability (belangrijk voor de bouw)
De Zapier-SDK-SQL-route raakt de **hele NXT SQL-server** (`nxt`, `nxt_stock`, per-regio prod) → Lanes
customers/order-types/items/prices zijn **read-only toetsbaar zonder dev-env**. Naamconventie
`_bx/_uk/_ie` = regio (Benelux/UK/Ireland; `environment_id='BX'` voor Smeba) — zie spike 010b. Bronlagen +
provenance staan in `BACKLOG.md`.

## Residu — vereist dev-env / ander systeem (niet in deze spike)
- **NXT create-order test** (één shadow-order in acceptance — `stockAllocationRequired`, quote→order glue uit 013).
- **UI-mechanica** (button-labels/wizards via Browserless), **DocuWare** (greenfield), externe portals.
- **Klant-/contractprijzen breed** (pricelist-join is aangetoond voor Defensie/Lidl; volledige uitrol = QA-werk).

## Out of scope
- Het bouwen/registreren van de order-entry swarm of handlers (V10.5-fases).
- Het corrigeren van Koens brondocs zelf (vervallen picto, Lidl-prijzen, klantnr-labels) — terugkoppelen aan Koen/Ans.
- 012-verdict in de MANIFEST staat nog op "PENDING" maar is feitelijk gedraaid (PASS 1/2) — losse hygiëne.
