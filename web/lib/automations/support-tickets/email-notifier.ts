// support-tickets-email-notifier — preference-gated, deduplicated, localized email delivery.
//
// Fans out from the SAME "support-tickets/clickup-status.received" event as
// clickupOutbound and clickupCacheSync — no new webhook (D-08).
//
// Dedup contract (D-10):
//   - Query: select row in support_notifications where delivered_at IS NULL.
//   - Stamp delivered_at after the send ATTEMPT (regardless of Resend success).
//   - Only the gate early-returns (master off / type toggle off) leave delivered_at NULL.
//   - This trades a single lost mail on a transient Resend failure for guaranteed
//     no retry-flood when Resend is persistently broken.
//
// CLAUDE.md guards:
//   - Function-id LOCKED: "support-tickets-email-notifier" — NEVER rename.
//   - All side effects inside ONE step.run boundary (replay safety).
//   - No UUID / new Date() outside step.run callback.

import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import { resolveUserIdentity } from "@/lib/automations/support-tickets/email-aliases";
import { fetchTaskForSync } from "@/lib/automations/support-tickets/clickup-read-client";
import { sendSupportTicketEmail } from "@/lib/email/support-ticket-notification";
import { mapClickupStatus } from "@/lib/automations/support-tickets/clickup-status-map";

// -------------------------------------------------------------------------
// Types (mirror CacheSyncEvent from clickup-cache-sync.ts)
// -------------------------------------------------------------------------

interface EmailNotifierEvent {
  clickup_task_id: string;
  event_type: string;
  history_items: Array<Record<string, unknown>>;
  received_at: string;
}

type EmailKind = "resolved" | "other_status";

// Status → email kind mapping (CR-02 fix: delegate to canonical mapClickupStatus).
//   resolved/closed → "resolved" (gated by email_on_resolved)
//   assigned/in-progress → "other_status" (gated by email_on_other_status)
//   anything else → null (not handled this phase; return early)
//
// This replaces the hand-rolled table that only knew 5 literals and silently
// dropped emails for "done", "fixed", "complete", "completed", "doing", etc.
function statusToKind(status: string): EmailKind | null {
  const category = mapClickupStatus(status);
  if (category === "resolved" || category === "closed") return "resolved";
  if (category === "assigned" || category === "in-progress") return "other_status";
  return null; // non-notify-worthy or unrecognised (binnenkort: rejected, clarification, etc.)
}

// -------------------------------------------------------------------------
// Pure runner (exported for testing without Inngest machinery)
// -------------------------------------------------------------------------

/**
 * Core email notification logic. All side effects are inside this function
 * (called from step.run, so replay-safe).
 *
 * @param event      - The CacheSyncEvent data from the Inngest event.
 * @param statusHint - The canonical status string to act on (pre-derived or
 *                     passed directly in tests for convenience).
 */
export async function runEmailNotifier(
  event: EmailNotifierEvent,
  statusHint: string,
): Promise<void> {
  // (a) Determine the kind from the status hint.
  const kind = statusToKind(statusHint);
  if (kind === null) {
    // Unsupported status (rejected, clarification, etc.) — binnenkort (Test 7).
    return;
  }

  const supabase = createAdminClient();
  const clickup_task_id = event.clickup_task_id;

  // (b) Resolve support_tickets.id from ClickUp task id (two-column pattern,
  //     outbound_clickup_task_id primary, clickup_task_id fallback).
  const primaryResult = await supabase
    .from("support_tickets")
    .select("id")
    .eq("outbound_clickup_task_id", clickup_task_id)
    .maybeSingle() as { data: { id: string } | null; error: unknown };

  let ticketId: string | null = primaryResult?.data?.id ?? null;

  if (!ticketId) {
    const fallbackResult = await supabase
      .from("support_tickets")
      .select("id")
      .eq("clickup_task_id", clickup_task_id)
      .maybeSingle() as { data: { id: string } | null; error: unknown };
    ticketId = fallbackResult?.data?.id ?? null;
  }

  if (!ticketId) {
    // No support ticket found for this ClickUp task — skip silently.
    return;
  }

  // (c) Dedup query (D-10, CR-01 fix): find the most recent undelivered
  //     status_update row for this ticket.
  //
  //     CR-01: The row is written by clickupOutbound, which fans out in parallel
  //     on the same event. We must NOT gate the send on finding the row — the
  //     row may not exist yet when this function runs first. Instead:
  //       • row exists + delivered_at IS NOT NULL → already stamped on a prior
  //         run, skip (dedup).
  //       • row exists + delivered_at IS NULL     → proceed; stamp after send.
  //       • row does not exist yet (race)          → proceed without a notifId;
  //         we cannot stamp, but we must not silently drop the email.
  const dedupResult = await supabase
    .from("support_notifications")
    .select("id, kind, payload, delivered_at")
    .eq("support_ticket_id", ticketId)
    .eq("kind", "status_update")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle() as {
      data: {
        id: string;
        kind: string;
        payload: Record<string, unknown>;
        delivered_at: string | null;
      } | null;
      error: unknown;
    };

  const notifRow = dedupResult?.data ?? null;

  // Row exists and already delivered → this is a retry on an already-stamped
  // row; early return (dedup guard, Test 5).
  if (notifRow && notifRow.delivered_at !== null) {
    return;
  }

  // notifId is null when the clickupOutbound race hasn't written the row yet;
  // we still send the email, but skip the delivered_at stamp (best-effort
  // dedup — WR-01/WR-03 track improving this further).
  const notifId: string | null = notifRow?.id ?? null;

  // (d) Load email from support_tickets_cache by external_task_id.
  //     On cache miss, fall back to fetchTaskForSync (Pitfall 1 timing race).
  const cacheResult = await supabase
    .from("support_tickets_cache")
    .select("email")
    .eq("external_task_id", clickup_task_id)
    .maybeSingle() as { data: { email: string | null } | null; error: unknown };

  let ticketEmail: string | null = cacheResult?.data?.email ?? null;

  if (!ticketEmail) {
    // Cache miss — ClickUp API fallback (Pitfall 1).
    const fetched = await fetchTaskForSync(clickup_task_id);
    if ("record" in fetched) {
      ticketEmail = fetched.record.email ?? null;
    }
  }

  if (!ticketEmail) {
    // No email address found — skip (Test 6).
    return;
  }

  // (e) Resolve identity aliases + preferredLocale (D-09, D-13).
  const { emails, preferredLocale } = await resolveUserIdentity(ticketEmail);

  // (f) Load preferences; apply D-07 defaults when no row.
  const prefsResult = await supabase
    .from("support_notification_preferences")
    .select("email_enabled, email_on_resolved, email_on_other_status")
    .in("user_email", emails.length > 0 ? emails : [ticketEmail])
    .limit(1)
    .maybeSingle() as {
      data: {
        email_enabled: boolean;
        email_on_resolved: boolean;
        email_on_other_status: boolean;
      } | null;
      error: unknown;
    };

  const prefs = prefsResult?.data ?? null;
  const emailEnabled: boolean = prefs?.email_enabled ?? true;
  const emailOnResolved: boolean = prefs?.email_on_resolved ?? true;
  const emailOnOtherStatus: boolean = prefs?.email_on_other_status ?? false;

  // (g) Gate: check master + per-type toggles (D-09).
  //     Master off → return WITHOUT stamping (Test 2) — row stays sendable.
  if (!emailEnabled) {
    return;
  }
  if (kind === "resolved" && !emailOnResolved) {
    return;
  }
  if (kind === "other_status" && !emailOnOtherStatus) {
    // Default false → Test 3 no-send path.
    return;
  }

  // (h) Build deep-link and send (D-12, D-13).
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const deepLink = `${appUrl}/app/tickets/${encodeURIComponent(clickup_task_id)}`;

  // Load ticket title from cache for the email body.
  const titleResult = await supabase
    .from("support_tickets_cache")
    .select("title")
    .eq("external_task_id", clickup_task_id)
    .maybeSingle() as { data: { title: string | null } | null; error: unknown };

  const ticketTitle = titleResult?.data?.title ?? "IT Support Ticket";

  // sendSupportTicketEmail is best-effort (never throws — swallows errors internally).
  await sendSupportTicketEmail({
    to: ticketEmail, // T-06-11: always server-sourced, never from event/client
    kind,
    ticketTitle,
    deepLink,
    locale: (preferredLocale as "nl" | "en" | "fr") ?? "nl",
  });

  // (i) Stamp delivered_at AFTER the send ATTEMPT (regardless of Resend success, D-10).
  //     This is the authoritative dedup marker — prevents retry-flood on persistent failure.
  //     Only stamp when we have a notifId; if clickupOutbound hadn't written the row
  //     yet (CR-01 race), we skip the stamp rather than silently drop the email.
  if (notifId) {
    await supabase
      .from("support_notifications")
      .update({ delivered_at: new Date().toISOString() })
      .eq("id", notifId);
  }
}

// -------------------------------------------------------------------------
// Inngest function
// Function-id LOCKED: "support-tickets-email-notifier" — NEVER rename.
// -------------------------------------------------------------------------

export const supportTicketsEmailNotifier = inngest.createFunction(
  { id: "support-tickets-email-notifier", retries: 3 },
  { event: "support-tickets/clickup-status.received" },
  async ({ event, step }) => {
    return await step.run("send-email-notification", async () => {
      const data = event.data as EmailNotifierEvent;

      // Derive the canonical status from the support_notifications payload.
      // The status_update notification written by clickupOutbound carries
      // payload.status as the canonical ClickupStatusCategory value.
      // We read it from history_items as the primary source; the dedup query
      // (step c in runEmailNotifier) will confirm the exact row.
      //
      // Use history_items[0].data.status_type or fallback to the event type.
      // For status change events, history_items contain after.status.status.
      let statusHint = "";
      const historyItems = Array.isArray(data.history_items) ? data.history_items : [];
      for (const item of historyItems) {
        const after = item?.after as Record<string, unknown> | undefined;
        const statusObj = (after?.status ?? after?.["status"]) as
          | { status?: string }
          | string
          | undefined;
        if (typeof statusObj === "string" && statusObj) {
          statusHint = statusObj;
          break;
        }
        if (typeof statusObj === "object" && statusObj?.status) {
          statusHint = statusObj.status;
          break;
        }
        // Alternative: flat history_item.data.status
        const itemData = item?.data as Record<string, unknown> | undefined;
        const flatStatus = itemData?.status as string | undefined;
        if (flatStatus) {
          statusHint = flatStatus;
          break;
        }
      }

      await runEmailNotifier(data, statusHint);
    });
  },
);
