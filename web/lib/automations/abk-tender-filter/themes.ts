/**
 * Thema's waarop de ABK-aanbestedingen worden gefilterd.
 *
 * Het AI-model matcht SEMANTISCH op deze thema's — niet letterlijk. Een titel als
 * "kleinschalig onderhoud brandbeveiligingsinstallaties" matcht dus op "blusmiddelen"
 * ook al staat dat woord er niet letterlijk in.
 *
 * Albert: pas deze lijst gerust aan. Voeg termen toe of haal weg. Houd de labels
 * kort en concreet — dat helpt het model. De `omschrijving` geeft het model context
 * over wat we precies bedoelen.
 */

export interface Theme {
  /** Korte naam van het thema (verschijnt in de digest). */
  label: string;
  /** Uitleg voor het AI-model: wat valt hier wel/niet onder. */
  omschrijving: string;
}

export const DEFAULT_THEMES: Theme[] = [
  {
    label: "BHV",
    omschrijving:
      "Bedrijfshulpverlening: BHV-opleidingen, herhalingscursussen, BHV-organisatie, " +
      "ploegleiders, hoofd-BHV.",
  },
  {
    label: "Blusmiddelen",
    omschrijving:
      "Brandblussers, blusdekens, brandslanghaspels, levering/onderhoud/keuring van " +
      "klein blusmateriaal en brandbeveiligingsmiddelen.",
  },
  {
    label: "Brandveiligheid",
    omschrijving:
      "Brandveiligheid algemeen: brandpreventie, brandmeldinstallaties, noodverlichting, " +
      "vluchtwegaanduiding, brandveiligheidsadvies en -inspecties.",
  },
  {
    label: "Ontruiming & noodplannen",
    omschrijving:
      "Ontruimingsoefeningen, ontruimingsplannen, evacuatie, vluchtwegen, " +
      "ontruimingsinstallaties, bedrijfsnoodplannen, calamiteitenplannen, " +
      "noodplannen en crisisbeheersing.",
  },
  {
    label: "EHBO / AED",
    omschrijving:
      "Eerste hulp bij ongelukken, reanimatie, AED-cursussen en -onderhoud, " +
      "verbandmiddelen.",
  },
  {
    label: "Veiligheidsopleidingen",
    omschrijving:
      "Veiligheidstrainingen breed: VCA, veilig werken, valbeveiliging, " +
      "besloten ruimtes, en aanverwante safety-opleidingen.",
  },
];
