/**
 * Extractie + classificatie van ABK-aanbestedingen via Orq.ai.
 *
 * Eén strikte Orq.ai-call (json_schema) doet twee dingen tegelijk:
 *   1. Extraheren: de lijst aanbestedingen/gunningen uit de mail-body halen.
 *   2. Classificeren: per item beoordelen of het relevant is voor onze thema's.
 *
 * Alleen de relevante items komen terug. De output wordt gevalideerd met Zod —
 * we vertrouwen LLM-output nooit blind (huisregel).
 */

import { z } from "zod/v4";
import { DEFAULT_THEMES, type Theme } from "./themes";

const ORQ_ROUTER_URL = "https://api.orq.ai/v2/router/chat/completions";
const MODEL = "anthropic/claude-sonnet-4-6";

/** Eén relevante aanbesteding zoals teruggegeven door het model. */
export const MatchSchema = z.object({
  type: z.string(), // Aanbesteding | Gunning | Rectificatie | ...
  organisatie: z.string(),
  titel: z.string(),
  link: z.string(), // mag "" zijn als er geen link in de bron staat
  thema: z.string(), // welk thema matchte (uit de meegegeven lijst)
  reden: z.string(), // korte onderbouwing
});

export const ClassificationSchema = z.object({
  total_scanned: z.number().int().nonnegative(),
  matches: z.array(MatchSchema),
});

export type Match = z.infer<typeof MatchSchema>;
export type Classification = z.infer<typeof ClassificationSchema>;

/** JSON Schema voor Orq.ai response_format (strict mode: alles required). */
const RESPONSE_JSON_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["total_scanned", "matches"],
  properties: {
    total_scanned: {
      type: "integer",
      description: "Totaal aantal aanbestedingen dat in de mail stond.",
    },
    matches: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "organisatie", "titel", "link", "thema", "reden"],
        properties: {
          type: {
            type: "string",
            description: "Type item: Aanbesteding, Gunning, Rectificatie, etc.",
          },
          organisatie: { type: "string", description: "Aanbestedende organisatie." },
          titel: { type: "string", description: "Titel van het project." },
          link: { type: "string", description: "URL naar het item, of \"\" indien afwezig." },
          thema: {
            type: "string",
            description: "Het thema-label waarop dit item matchte.",
          },
          reden: {
            type: "string",
            description: "Korte onderbouwing (1 zin) waarom dit relevant is.",
          },
        },
      },
    },
  },
} as const;

function buildSystemPrompt(themes: Theme[]): string {
  const themaLijst = themes
    .map((t) => `- ${t.label}: ${t.omschrijving}`)
    .join("\n");

  return `<role>
Je bent een aanbestedingsanalist voor Moyne Roberts, een aanbieder van BHV- en
veiligheidsdiensten. Je beoordeelt dagelijkse aanbestedingsmails en selecteert
uitsluitend de kansen die binnen onze dienstverlening passen.
</role>

<task>
Je krijgt de inhoud van één ABK-mail ("Nieuwe projecten") met een lijst
aanbestedingen, gunningen en rectificaties. Doe twee dingen:
1. Extraheer ELK item uit de lijst (type, aanbestedende organisatie, projecttitel, link).
2. Beoordeel per item of het SEMANTISCH past bij minstens één van onze thema's.
   Geef alleen de passende items terug.
</task>

<themes>
${themaLijst}
</themes>

<constraints>
- Match op betekenis, niet op letterlijke woorden. "Onderhoud brandbeveiliging"
  matcht op Blusmiddelen/Brandveiligheid ook zonder die exacte woorden.
- Wees selectief maar mis geen duidelijke kans. Bij twijfel of iets écht binnen
  een thema valt: alleen opnemen als er een plausibele link met onze dienstverlening is.
- Algemeen terrein-/groenonderhoud, ICT, chauffeursdiensten, catering e.d. zijn
  NIET relevant tenzij ze expliciet over brand-/BHV-/EHBO-veiligheid gaan.
- 'thema' moet exact één van de labels uit <themes> zijn.
- Geef elk item MAXIMAAL ÉÉN keer terug, ook als het bij meerdere thema's past.
  Kies dan het meest passende thema.
- 'total_scanned' = het totale aantal items in de mail (ook de niet-relevante).
- Verzin niets. Als een veld ontbreekt in de bron, gebruik een lege string "".
</constraints>`;
}

export interface ClassifyOptions {
  /** Ruwe mail-inhoud (HTML of platte tekst) van de ABK-mail. */
  emailBody: string;
  /** Optionele override van de thema's; standaard DEFAULT_THEMES. */
  themes?: Theme[];
  /** Optionele timeout in ms (default 40s — net onder Orq's interne retry). */
  timeoutMs?: number;
}

/**
 * Roept Orq.ai aan en geeft de gevalideerde classificatie terug.
 * Gooit bij ontbrekende API-key, HTTP-fout, of ongeldige output.
 */
export async function classifyTenders(
  opts: ClassifyOptions
): Promise<Classification> {
  const apiKey = process.env.ORQ_API_KEY;
  if (!apiKey) {
    throw new Error("ORQ_API_KEY environment variable is not set");
  }

  const themes = opts.themes ?? DEFAULT_THEMES;
  const timeoutMs = opts.timeoutMs ?? 40_000;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let result: Response;
  try {
    result = await fetch(ORQ_ROUTER_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 8192,
        temperature: 0,
        messages: [
          { role: "system", content: buildSystemPrompt(themes) },
          {
            role: "user",
            content: `<email>\n${opts.emailBody}\n</email>`,
          },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "abk_classification",
            strict: true,
            schema: RESPONSE_JSON_SCHEMA,
          },
        },
        metadata: { automation: "abk-tender-filter" },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!result.ok) {
    const body = await result.text();
    throw new Error(
      `Orq.ai router error: ${result.status} ${result.statusText} — ${body}`
    );
  }

  const data = (await result.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("Orq.ai response bevatte geen content");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`Orq.ai output was geen geldige JSON: ${content.slice(0, 500)}`);
  }

  // Zod-validatie — nooit blind vertrouwen op LLM-output.
  const validated = ClassificationSchema.parse(parsed);

  // Dedupe: hetzelfde item kan op meerdere thema's matchen. Voeg samen tot
  // één regel per (organisatie + titel) met de thema's gecombineerd.
  const byKey = new Map<string, Match>();
  for (const m of validated.matches) {
    const key = `${m.organisatie}::${m.titel}`.toLowerCase();
    const existing = byKey.get(key);
    if (existing) {
      const themas = new Set(existing.thema.split(" / "));
      themas.add(m.thema);
      existing.thema = [...themas].join(" / ");
    } else {
      byKey.set(key, { ...m });
    }
  }

  return { total_scanned: validated.total_scanned, matches: [...byKey.values()] };
}
