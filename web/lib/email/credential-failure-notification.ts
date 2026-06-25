import { Resend } from "resend";

// NB: do NOT construct the Resend client at module scope. `new Resend(undefined)`
// throws when RESEND_API_KEY is unset, and because this module is reachable
// (transitively) from /api/inngest, that throw breaks `next build`'s page-data
// collection — taking down the whole deploy over an optional email key. Build
// it lazily inside the send fn instead.

/**
 * Send an email notification when a credential fails authentication.
 *
 * This is best-effort: if the email fails, we log the error but do NOT throw.
 * Automation flow should not fail because email delivery failed.
 */
export async function sendCredentialFailureEmail(params: {
  credentialName: string;
  recipientEmail: string;
  settingsUrl: string;
}): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[sendCredentialFailureEmail] RESEND_API_KEY not set — skipping email");
    return;
  }

  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: `Agent Workforce <${fromEmail}>`,
      to: params.recipientEmail,
      subject: `Credential needs rotation: ${params.credentialName}`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 600;">Credential Failed</h2>
          <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">
            The credential <strong>${params.credentialName}</strong> failed authentication.
            Automations using this credential are paused until it is replaced.
          </p>
          <a href="${params.settingsUrl}" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
            Replace Credential
          </a>
        </div>
      `,
    });
  } catch (error) {
    console.error("[sendCredentialFailureEmail] Failed:", error);
  }
}
