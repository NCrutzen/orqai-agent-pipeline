# Smeba Rijtijden Analyse

**Status:** live
**Type:** custom (client-side)
**Eigenaar:** MR / Danny
**Systemen:** Smeba (Business Lease GPS-systeem), Zapier

## Wat doet het
Upload een Smeba Excel-rapport (.xlsx) en krijg een samenvatting per monteur per dag:
vertrektijd, aankomst 1e klant, vertrek laatste klant, aankomsttijd, opslagbezoek,
rijtijd, gemaakte uren, werktijd (rood/groen), en afstand.

## Waarom
Smeba levert een gedetailleerd rittenrapport per dag. De planner wil een compacte
samenvatting per persoon, inclusief inzicht of de werktijd ≥ 8,5 uur is.

## Trigger
Handmatig – planner upload het Excel-bestand via de webpagina.

## Aanpak
Volledig client-side verwerking met de `xlsx` library. Data verlaat de browser niet,
tenzij de gebruiker expliciet naar Zapier verzendt.

## Kolommen

| Kolom                  | Berekening                                              |
|------------------------|---------------------------------------------------------|
| Vertrek                | Starttijd rit 1 (vertrek van huis)                      |
| Aankomst 1e klant      | Aankomsttijd rit 1 (eerste stop)                        |
| Vertrek laatste klant  | Starttijd laatste rit (richting huis)                   |
| Aankomst               | Aankomsttijd laatste rit (thuis)                        |
| Opslag                 | Stilstandtijd bij "Opslagruimte"-locatie (indien bezocht) |
| Rijtijd                | Som van alle TripDetailDrivingDuration                  |
| Gemaakte uren          | Aankomst thuis − Vertrek thuis                          |
| Werktijd               | Vertrek laatste klant − Aankomst 1e klant               |

**Werktijd kleuring:** rood < 8:30 uur, groen ≥ 8:30 uur.
**Rij-kleuring:** licht groen als monteur opslaglocatie bezocht heeft.

## Locatie
`web/app/(dashboard)/rijtijden/page.tsx`

## Zapier
Webhook URL wordt ingevuld door de gebruiker in de UI. Alle rijen worden als
JSON-array verstuurd.

## Aannames
- Excel heeft altijd een `Data` tabblad (Smeba standaard export)
- Rit[0] = vertrek vanuit thuis/beginlocatie
- Laatste rit = terugkeer naar huis
- "Opslagruimte" staat letterlijk in de bestemmingskolom voor opslaglocaties
