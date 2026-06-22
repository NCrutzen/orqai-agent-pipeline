import { Resend } from "resend";

// NB: do NOT construct the Resend client at module scope. `new Resend(undefined)`
// throws when RESEND_API_KEY is unset, and because this module is imported
// (transitively) by /api/inngest, that throw breaks `next build`'s page-data
// collection — taking down the whole deploy over an optional email key. Build
// it lazily inside the send fn instead (see sendSupportTicketEmail).

// -------------------------------------------------------------------------
// Inline email copy — NL / EN / FR (NOT the app i18n dict; D-13 per UI-SPEC)
// -------------------------------------------------------------------------

const emailDict = {
  nl: {
    resolvedSubject: "Je ticket is opgelost",
    resolvedBody:
      "Je IT-supportticket is opgelost. Bekijk het ticket voor de details en de oplossing:",
    otherStatusSubject: "Update op je ticket",
    otherStatusBody:
      "De status van je IT-supportticket is gewijzigd. Bekijk je ticket voor de laatste stand van zaken:",
    ctaLabel: "Bekijk ticket",
    emailFooter:
      "Je ontvangt deze e-mail omdat je notificaties hebt ingeschakeld. Pas je voorkeuren aan via de MR Support-app.",
  },
  en: {
    resolvedSubject: "Your ticket has been resolved",
    resolvedBody:
      "Your IT support ticket has been resolved. View the ticket for details and the solution:",
    otherStatusSubject: "Update on your ticket",
    otherStatusBody:
      "The status of your IT support ticket has changed. View your ticket for the latest update:",
    ctaLabel: "View ticket",
    emailFooter:
      "You are receiving this email because you have notifications enabled. Adjust your preferences in the MR Support app.",
  },
  fr: {
    resolvedSubject: "Votre ticket a été résolu",
    resolvedBody:
      "Votre ticket d'assistance informatique a été résolu. Consultez le ticket pour les détails et la solution :",
    otherStatusSubject: "Mise à jour de votre ticket",
    otherStatusBody:
      "Le statut de votre ticket d'assistance informatique a changé. Consultez votre ticket pour la dernière mise à jour :",
    ctaLabel: "Voir le ticket",
    emailFooter:
      "Vous recevez cet e-mail parce que vous avez activé les notifications. Modifiez vos préférences dans l'application MR Support.",
  },
} as const;

type Locale = "nl" | "en" | "fr";

/**
 * Send a support ticket notification email via Resend.
 *
 * Best-effort: if Resend throws, the error is logged but NOT re-thrown.
 * The Inngest pipeline must not fail because email delivery failed (D-12).
 *
 * @param to         - Recipient address (the ClickUp Email Address field value).
 * @param kind       - "resolved" (Opgelost toggle) or "other_status" (Andere statuswijzigingen toggle).
 * @param ticketTitle- Title of the support ticket.
 * @param deepLink   - Full URL to the ticket detail page (/app/tickets/{clickup_task_id}).
 * @param locale     - Preferred locale for the recipient (NL / EN / FR); falls back to NL.
 */
export async function sendSupportTicketEmail(params: {
  to: string;
  kind: "resolved" | "other_status";
  ticketTitle: string;
  deepLink: string;
  locale: Locale;
}): Promise<void> {
  const { to, kind, ticketTitle, deepLink, locale } = params;

  // Email is best-effort and optional: when no key is configured, skip delivery
  // (don't throw — the Inngest pipeline must not fail on email, D-12).
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendSupportTicketEmail] RESEND_API_KEY not set — skipping email");
    return;
  }
  const resend = new Resend(apiKey);

  // CR-03: HTML-escape all externally-controlled values before interpolating
  // into the email body. ticketTitle originates from ClickUp (user-controllable);
  // deepLink is built from clickup_task_id (also external).
  function esc(s: string): string {
    return s
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
  const safeTitle = esc(ticketTitle);
  const safeDeepLink = esc(deepLink);

  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  // Resolve copy: fall back to NL when locale is not in the dict.
  const copy = emailDict[locale] ?? emailDict.nl;
  const subject =
    kind === "resolved" ? copy.resolvedSubject : copy.otherStatusSubject;
  const bodyText =
    kind === "resolved" ? copy.resolvedBody : copy.otherStatusBody;

  try {
    await resend.emails.send({
      from: `MR Support <${fromEmail}>`,
      to,
      subject,
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111827;">${subject}</h2>
          <p style="margin: 0 0 8px; font-size: 14px; color: #374151;">${bodyText}</p>
          <p style="margin: 0 0 24px; font-size: 14px; color: #374151;"><strong>${safeTitle}</strong></p>
          <a href="${safeDeepLink}" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
            ${copy.ctaLabel}
          </a>
          <p style="margin: 32px 0 0; font-size: 12px; color: #9ca3af;">${copy.emailFooter}</p>
        </div>
      `,
    });
  } catch (error) {
    // Best-effort: log but do NOT re-throw.
    console.error("[sendSupportTicketEmail] Failed to send notification:", error);
  }
}
