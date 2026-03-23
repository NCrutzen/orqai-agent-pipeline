import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

/**
 * Send an email notification when an approval is pending.
 *
 * This is best-effort: if the email fails, we log the error but do NOT throw.
 * The pipeline should not fail because email delivery failed.
 */
export async function sendApprovalEmail(params: {
  runId: string;
  approvalId: string;
  recipientEmail: string;
  projectName: string;
  projectId: string;
  stepName: string;
}): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const fromEmail = process.env.RESEND_FROM_EMAIL || "onboarding@resend.dev";
  const approvalUrl = `${appUrl}/projects/${params.projectId}/runs/${params.runId}?approval=${params.approvalId}`;

  try {
    await resend.emails.send({
      from: `Agent Workforce <${fromEmail}>`,
      to: params.recipientEmail,
      subject: `Approval needed: ${params.stepName} in ${params.projectName}`,
      html: `
        <div style="max-width: 600px; margin: 0 auto; padding: 32px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <h2 style="margin: 0 0 16px; font-size: 24px; font-weight: 600;">Approval Required</h2>
          <p style="margin: 0 0 16px; font-size: 14px; color: #374151;">A pipeline step is waiting for your approval.</p>
          <p style="margin: 0 0 8px; font-size: 14px;"><strong>Project:</strong> ${params.projectName}</p>
          <p style="margin: 0 0 24px; font-size: 14px;"><strong>Step:</strong> ${params.stepName}</p>
          <a href="${approvalUrl}" style="display: inline-block; padding: 12px 24px; background-color: #171717; color: #ffffff; text-decoration: none; border-radius: 6px; font-size: 14px; font-weight: 500;">
            Review and Approve
          </a>
        </div>
      `,
    });
  } catch (error) {
    // Best-effort: log but do not throw
    console.error("[sendApprovalEmail] Failed to send notification:", error);
  }
}
