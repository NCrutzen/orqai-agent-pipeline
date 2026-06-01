// Shared egress for pipeline-health notifications.
//
// Both the every-2h monitor (immediate error alerts) and the Monday-06:00
// weekly digest POST their payload here. The transport is a Zapier Catch Hook
// (Webhooks by Zapier → Catch Hook → Gmail/Outlook Send Email); the URL is the
// secret, so it lives in the env var `PIPELINE_HEALTH_WEBHOOK_URL` (set in
// Vercel), NOT in code or the zapier_tools registry.
//
// The Zap's email action only needs `{{message}}` to produce a complete mail —
// `message` is always a fully self-contained, human-readable string. The extra
// structured fields are included so the Zap CAN map them (subject, severity,
// filtering on test_mode) but are never required for a useful email.

const NOTIFY_TO = "nick.crutzen.cb@moyneroberts.com";

export interface HealthWebhookPayload {
  /** stable machine label, e.g. "pipeline-health-alert" | "pipeline-health-weekly" */
  event: string;
  /** recipient — the Zap may ignore this and use a hardcoded To */
  notify_to: string;
  /** fully self-contained mail body; safe to map directly to the email */
  message: string;
  severity: "error" | "warning" | "info";
  fired_at: string;
  test_mode: boolean;
  /** any extra structured fields the Zap may optionally map */
  [key: string]: unknown;
}

export interface PostResult {
  status: number;
  skipped?: "webhook_not_configured";
}

/**
 * POST a payload to the pipeline-health Zapier Catch Hook.
 * Returns `{ skipped: "webhook_not_configured" }` (status 0) when the env var
 * is unset — useful while the Zap is still being wired up; the caller logs it
 * via the function return value rather than throwing.
 *
 * MUST be called inside a `step.run()` so the POST is replay-safe.
 */
export async function postHealthWebhook(
  payload: HealthWebhookPayload,
): Promise<PostResult> {
  const url = process.env.PIPELINE_HEALTH_WEBHOOK_URL;
  if (!url) {
    return { status: 0, skipped: "webhook_not_configured" };
  }

  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `Pipeline health webhook returned ${res.status}: ${text.slice(0, 200)}`,
    );
  }
  return { status: res.status };
}

export { NOTIFY_TO };
