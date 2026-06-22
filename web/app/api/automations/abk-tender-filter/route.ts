import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { classifyTenders } from "@/lib/automations/abk-tender-filter/classify";
import { buildDigest, buildAlarm } from "@/lib/automations/abk-tender-filter/digest";
import { DEFAULT_THEMES } from "@/lib/automations/abk-tender-filter/themes";

/**
 * POST /api/automations/abk-tender-filter
 *
 * Hybrid automation-endpoint. Zapier triggert op de dagelijkse ABK-mail en POST
 * de mail-inhoud hierheen. Wij extraheren + classificeren via Orq.ai en geven een
 * gefilterde digest terug. Élke binnengekomen ABK-mail levert een mailbaar
 * resultaat op (kansen, "geen relevante aanbestedingen", óf een ⚠️-alarm bij een
 * stille fout), zodat Zapier altijd één mail stuurt en een kapotte pipeline niet
 * onopgemerkt blijft. Daarom heeft Zapier geen match_count-filter meer nodig.
 *
 * Auth: header `x-webhook-secret` moet matchen met AUTOMATION_WEBHOOK_SECRET.
 */

export const maxDuration = 60; // Vercel: ruimte voor de Orq.ai-call

const requestSchema = z.object({
  // Minstens één van deze moet gevuld zijn; html heeft de voorkeur (rijker).
  html: z.string().optional(),
  text: z.string().optional(),
  // Outlook levert de platte-tekst soms onder `bodyPreview` i.p.v. `text` —
  // meenemen als extra fallback zodat een gemapte body niet stilletjes leeg is.
  bodyPreview: z.string().optional(),
  subject: z.string().optional(),
  date: z.string().optional(),
  // Afzender-adres van de mail (Zapier: "From Email"). Verplicht om te
  // garanderen dat we UITSLUITEND de ABK-mail classificeren — zie isAllowedSender.
  from: z.string().optional(),
  // Optionele override van de thema's (anders DEFAULT_THEMES).
  themes: z
    .array(z.object({ label: z.string(), omschrijving: z.string() }))
    .optional(),
});

// Alleen mail van de Aanbestedingskalender (ABK) mag geclassificeerd worden.
// Vangnet tegen een te ruime Zapier-trigger: zo kan een willekeurige inbox-mail
// (bv. een losse leveranciersmail) nooit als "aanbesteding" doorgefilterd worden.
const ALLOWED_SENDER_DOMAIN = "aanbestedingskalender.nl";

/** Haalt het kale e-mailadres uit een From-veld ("Naam <x@y>") en geeft het lowercased terug. */
function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return (m ? m[1] : from).trim().toLowerCase();
}

/** True als de afzender een (sub)domein-match heeft met de Aanbestedingskalender. */
function isAllowedSender(from: string): boolean {
  const email = extractEmail(from);
  const at = email.lastIndexOf("@");
  if (at === -1) return false;
  const domain = email.slice(at + 1);
  return domain === ALLOWED_SENDER_DOMAIN || domain.endsWith(`.${ALLOWED_SENDER_DOMAIN}`);
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function POST(req: NextRequest) {
  // --- Auth ---
  const secret = process.env.AUTOMATION_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: "Server misconfigured: AUTOMATION_WEBHOOK_SECRET ontbreekt" },
      { status: 500 }
    );
  }
  const provided = req.headers.get("x-webhook-secret") ?? "";
  if (!timingSafeEqual(provided, secret)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  // --- Input ---
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Body is geen geldige JSON" }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Ongeldige input", details: parsed.error.issues },
      { status: 400 }
    );
  }

  // --- Afzender-guard (fail-closed) ---
  // Classificeer uitsluitend de ABK-mail. Onbekende/lege afzender → niets doen,
  // zodat een verdwaalde inbox-mail nooit als aanbesteding wordt doorgestuurd.
  // Zapier MOET het From-adres als `from` meesturen (zie README). We geven bewust
  // GEEN 400 maar match_count 0 terug, zodat de bestaande Zap-filter de flow stopt
  // zonder dagelijkse foutmail.
  const from = parsed.data.from?.trim() ?? "";
  if (!from || !isAllowedSender(from)) {
    console.warn(
      `[abk-tender-filter] afzender "${from || "(leeg)"}" is niet de Aanbestedingskalender — alarm`
    );
    // Geen stille skip: deze tak vuurt als het `from`-veld ontbreekt (Zapier-config)
    // of niet het ABK-domein heeft. We sturen een ⚠️-alarm zodat zo'n fout niet
    // dagenlang onopgemerkt blijft (zoals eerder gebeurde toen `from` niet meekwam).
    const reden = from
      ? `Afzender "${from}" is niet de Aanbestedingskalender (${ALLOWED_SENDER_DOMAIN}).`
      : `Het 'from'-veld ontbreekt in de Zapier-payload — controleer stap 3 (POST).`;
    const alarm = buildAlarm(reden, { date: parsed.data.date });
    return NextResponse.json({
      ok: true,
      match_count: 0,
      total_scanned: 0,
      subject: alarm.subject,
      html: alarm.html,
      text: alarm.text,
      note: reden,
    });
  }

  const emailBody =
    parsed.data.html?.trim() ||
    parsed.data.text?.trim() ||
    parsed.data.bodyPreview?.trim() ||
    "";
  if (!emailBody) {
    // Lege mail-inhoud = niets te classificeren. We geven bewust GEEN 400 terug
    // (dat liet Zapier de stap als "error" rapporteren). In plaats daarvan een
    // ⚠️-alarmmail: er kwam wél een ABK-mail binnen, maar zonder body kunnen we
    // niets filteren — dat wil je weten i.p.v. stilte.
    console.warn(
      "[abk-tender-filter] lege mail-inhoud ontvangen (html/text/bodyPreview leeg) — alarm"
    );
    const reden =
      "De mail-inhoud (html/text/bodyPreview) is leeg — controleer de body-mapping in Zapier stap 3.";
    const alarm = buildAlarm(reden, { date: parsed.data.date });
    return NextResponse.json({
      ok: true,
      match_count: 0,
      total_scanned: 0,
      subject: alarm.subject,
      html: alarm.html,
      text: alarm.text,
      note: reden,
    });
  }

  // --- Classificeren + digest ---
  try {
    const classification = await classifyTenders({
      emailBody,
      themes: parsed.data.themes ?? DEFAULT_THEMES,
    });

    const digest = buildDigest(classification, { date: parsed.data.date });

    return NextResponse.json({
      ok: true,
      match_count: digest.matchCount,
      total_scanned: digest.totalScanned,
      subject: digest.subject,
      html: digest.html,
      text: digest.text,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[abk-tender-filter] error:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 502 });
  }
}
