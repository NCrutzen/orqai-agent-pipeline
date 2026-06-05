import { NextRequest, NextResponse } from "next/server";
import { z } from "zod/v4";
import { classifyTenders } from "@/lib/automations/abk-tender-filter/classify";
import { buildDigest } from "@/lib/automations/abk-tender-filter/digest";
import { DEFAULT_THEMES } from "@/lib/automations/abk-tender-filter/themes";

/**
 * POST /api/automations/abk-tender-filter
 *
 * Hybrid automation-endpoint. Zapier triggert op de dagelijkse ABK-mail en POST
 * de mail-inhoud hierheen. Wij extraheren + classificeren via Orq.ai en geven een
 * gefilterde digest terug. Zapier verstuurt vervolgens de mail (alleen als
 * match_count > 0).
 *
 * Auth: header `x-webhook-secret` moet matchen met AUTOMATION_WEBHOOK_SECRET.
 */

export const maxDuration = 60; // Vercel: ruimte voor de Orq.ai-call

const requestSchema = z.object({
  // Minstens één van deze moet gevuld zijn; html heeft de voorkeur (rijker).
  html: z.string().optional(),
  text: z.string().optional(),
  subject: z.string().optional(),
  date: z.string().optional(),
  // Optionele override van de thema's (anders DEFAULT_THEMES).
  themes: z
    .array(z.object({ label: z.string(), omschrijving: z.string() }))
    .optional(),
});

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

  const emailBody = parsed.data.html?.trim() || parsed.data.text?.trim() || "";
  if (!emailBody) {
    return NextResponse.json(
      { ok: false, error: "Geen mail-inhoud meegegeven (html of text vereist)" },
      { status: 400 }
    );
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
