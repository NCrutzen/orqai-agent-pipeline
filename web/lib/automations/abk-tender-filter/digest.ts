/**
 * Bouwt de gefilterde digest-mail uit de relevante aanbestedingen.
 *
 * Geeft zowel HTML (voor de mooie mail) als platte tekst terug. Zapier kan beide
 * gebruiken in de "Send Email"-stap.
 */

import type { Classification, Match } from "./classify";

/**
 * Maakt een nette NL-datum (DD-MM-JJJJ) van wat Zapier ook aanlevert.
 * Pakt het datumdeel uit een ISO-tijdstempel (bijv. "2026-06-05T02:27:05Z")
 * en draait het om naar Nederlandse notatie. Lukt parsen niet, dan onveranderd.
 */
function formatDate(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return "";
  const m = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}-${m[2]}-${m[1]}`;
  return trimmed;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function titelCell(m: Match): string {
  const titel = escapeHtml(m.titel);
  if (m.link && m.link.startsWith("http")) {
    return `<a href="${escapeHtml(m.link)}" style="color:#1a4ca0;text-decoration:none;font-weight:600;">${titel}</a>`;
  }
  return `<span style="font-weight:600;">${titel}</span>`;
}

export interface Digest {
  subject: string;
  html: string;
  text: string;
  matchCount: number;
  totalScanned: number;
}

export function buildDigest(
  classification: Classification,
  opts: { date?: string } = {}
): Digest {
  const { matches, total_scanned } = classification;
  const date = formatDate(opts.date ?? "");
  const dateLabel = date ? ` ${date}` : "";

  const subject =
    matches.length > 0
      ? `ABK relevante aanbestedingen${dateLabel} — ${matches.length} kans${matches.length === 1 ? "" : "en"}`
      : `ABK${dateLabel} — geen relevante aanbestedingen`;

  const rows = matches
    .map(
      (m) => `
      <tr>
        <td style="padding:12px 8px;border-bottom:1px solid #eee;vertical-align:top;white-space:nowrap;">
          <span style="display:inline-block;padding:2px 8px;border-radius:4px;background:#eef3fb;color:#1a4ca0;font-size:12px;">${escapeHtml(m.type)}</span>
        </td>
        <td style="padding:12px 8px;border-bottom:1px solid #eee;vertical-align:top;">
          <div style="color:#555;font-size:13px;margin-bottom:2px;">${escapeHtml(m.organisatie)}</div>
          <div style="font-size:15px;margin-bottom:4px;">${titelCell(m)}</div>
          <div style="font-size:12px;color:#888;"><strong>${escapeHtml(m.thema)}</strong> — ${escapeHtml(m.reden)}</div>
        </td>
      </tr>`
    )
    .join("");

  const html = `
  <div style="max-width:680px;margin:0 auto;padding:24px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1a1a1a;">
    <h2 style="margin:0 0 4px;font-size:20px;">Relevante aanbestedingen${dateLabel}</h2>
    <p style="margin:0 0 20px;font-size:13px;color:#777;">
      ${matches.length} van ${total_scanned} items uit de ABK-mail passen bij jouw thema's.
    </p>
    ${
      matches.length > 0
        ? `<table style="width:100%;border-collapse:collapse;">${rows}</table>`
        : `<p style="font-size:14px;color:#555;">Geen van de ${total_scanned} aanbestedingen was vandaag relevant.</p>`
    }
    <p style="margin:24px 0 0;font-size:11px;color:#aaa;">
      Automatisch gefilterd door de ABK Aanbestedingen Filter (Orq.ai). Controleer altijd het origineel bij twijfel.
    </p>
  </div>`;

  const text =
    matches.length > 0
      ? matches
          .map(
            (m) =>
              `• [${m.type}] ${m.organisatie}\n  ${m.titel}\n  ${m.thema} — ${m.reden}${m.link ? `\n  ${m.link}` : ""}`
          )
          .join("\n\n")
      : `Geen van de ${total_scanned} aanbestedingen was vandaag relevant.`;

  return {
    subject,
    html,
    text,
    matchCount: matches.length,
    totalScanned: total_scanned,
  };
}
