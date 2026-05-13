/**
 * Phase 82.4 Plan 04 — client-side fire-and-forget feedback POST helper.
 *
 * Used by the existing 4-axis override surfaces (Phase 71/82) to write an
 * `email_feedback` row ALONGSIDE the authoritative Inngest override dispatch.
 * The Inngest path is the authoritative override path and MUST NOT be blocked
 * by a feedback-row failure — therefore this helper:
 *   • never throws
 *   • swallows non-2xx responses with a console.warn
 *   • swallows network errors with a console.warn
 *
 * Returns void. Callers fire-and-forget via `void fireFeedback({...})`.
 */

export type FeedbackVerdict = "confirm" | "override" | "unclear";

export interface FireFeedbackArgs {
  email_id: string;
  stage: 0 | 1 | 2 | 3;
  verdict: FeedbackVerdict;
  corrected_value?: string;
  prose_notes?: string;
}

const FEEDBACK_ENDPOINT = "/api/automations/debtor-email/feedback";

export async function fireFeedback(args: FireFeedbackArgs): Promise<void> {
  try {
    const res = await fetch(FEEDBACK_ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "<unreadable>");
      console.warn("[fireFeedback] non-2xx", res.status, body);
    }
  } catch (err) {
    console.warn("[fireFeedback] network error", err);
  }
}
