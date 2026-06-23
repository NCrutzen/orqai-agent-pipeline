import "server-only";

// Supabase data-layer helpers for the notification-preferences surface (Phase 6).
// All Phase 6 plans (03 settings UI, 04 badge/feed, 05 email notifier) consume
// helpers from this single module.
//
// SECURITY: Tables use service_role RLS. These helpers use createAdminClient()
// (bypasses RLS) and enforce ownership IN CODE — callers MUST pass session-derived
// emails, never request params.
//
// Default preferences (D-07): when no row exists for a user (null return), callers
// should use: { email_enabled: true, email_on_resolved: true, email_on_rejected: true,
//               email_on_other_status: false, email_on_reactions: false }

import { createAdminClient } from "@/lib/supabase/admin";

// -------------------------------------------------------------------------
// Types
// -------------------------------------------------------------------------

/** Full preferences row from support_notification_preferences. */
export interface NotifPrefs {
  id?: string;
  user_email: string;
  email_enabled: boolean;
  email_on_resolved: boolean;
  email_on_rejected: boolean;
  email_on_other_status: boolean;
  email_on_reactions: boolean;
  updated_at?: string;
  created_at?: string;
}

/** Fields that can be updated via upsert. */
export type PrefsUpdate = Pick<
  NotifPrefs,
  | "email_enabled"
  | "email_on_resolved"
  | "email_on_rejected"
  | "email_on_other_status"
  | "email_on_reactions"
>;

/** Display key for notification feed entries (derived from kind + payload status). */
export type NotificationDisplayKey =
  | "resolved"
  | "inProgress"
  | "assigned"
  | "otherStatus"
  | "clarificationRequest";

/** A single notification feed entry returned for the ticket detail view. */
export interface NotificationFeedEntry {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  createdAt: string;
  displayKey: NotificationDisplayKey;
}

// -------------------------------------------------------------------------
// Helpers
// -------------------------------------------------------------------------

/**
 * Returns the notification preferences row for a user, or null if none exists.
 * null means the caller should fall back to D-07 defaults.
 */
export async function getNotificationPreferences(
  userEmail: string,
): Promise<NotifPrefs | null> {
  const supabase = createAdminClient();
  const { data } = await supabase
    .from("support_notification_preferences")
    .select("*")
    .eq("user_email", userEmail.toLowerCase())
    .maybeSingle();
  return data as NotifPrefs | null;
}

/**
 * Upserts notification preferences for a user (own-row enforced by callers).
 * Automatically lowercases the email and sets updated_at.
 */
export async function upsertNotificationPreferences(
  userEmail: string,
  prefs: Partial<PrefsUpdate>,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("support_notification_preferences").upsert(
    {
      user_email: userEmail.toLowerCase(),
      ...prefs,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_email" },
  );
}

/**
 * Upserts a last-seen timestamp for a user+ticket combination.
 * Called by the ticket detail page on load to clear the unread badge.
 */
export async function upsertLastSeen(
  userEmail: string,
  externalTaskId: string,
): Promise<void> {
  const supabase = createAdminClient();
  await supabase.from("support_ticket_last_seen").upsert(
    {
      user_email: userEmail.toLowerCase(),
      external_task_id: externalTaskId,
      last_seen_at: new Date().toISOString(),
    },
    { onConflict: "user_email,external_task_id" },
  );
}

/**
 * Returns a Set of external_task_ids (ClickUp task ids) that have at least one
 * support_notifications row newer than the user's last_seen_at (or no last_seen
 * row at all).
 *
 * Two-hop join:
 *   support_ticket_last_seen (user_email IN emails) -> external_task_id
 *   support_tickets (outbound_clickup_task_id primary, clickup_task_id fallback) -> id
 *   support_notifications (support_ticket_id = id, created_at > last_seen_at)
 *
 * Fail-safe: returns empty Set on any error.
 */
export async function getUnreadTaskIds(emails: string[]): Promise<Set<string>> {
  if (emails.length === 0) return new Set();

  try {
    const supabase = createAdminClient();
    const lowercasedEmails = emails.map((e) => e.toLowerCase());

    // Step 1: get last_seen rows for these emails
    const lastSeenResult = await supabase
      .from("support_ticket_last_seen")
      .select("user_email, external_task_id, last_seen_at")
      .in("user_email", lowercasedEmails);

    const lastSeenRows = (
      lastSeenResult as { data: Array<{ user_email: string; external_task_id: string; last_seen_at: string }> | null; error: unknown }
    ).data ?? [];

    // Build a map: external_task_id -> last_seen_at (pick the latest across aliases)
    const lastSeenMap = new Map<string, string>();
    for (const row of lastSeenRows) {
      const existing = lastSeenMap.get(row.external_task_id);
      if (!existing || row.last_seen_at > existing) {
        lastSeenMap.set(row.external_task_id, row.last_seen_at);
      }
    }

    // Step 2: get all tickets linked to these emails via support_tickets_cache
    // We need to find support_tickets rows where outbound_clickup_task_id or clickup_task_id
    // is in the set of external_task_ids we care about. But we also need tickets the user
    // submitted. Get tickets by email via support_tickets_cache external_task_id.
    //
    // Strategy: get all external_task_ids from the cache for this user, then find
    // support_tickets rows for them, then check notifications.

    // Get external_task_ids for these emails from support_tickets_cache
    const cacheResult = await supabase
      .from("support_tickets_cache")
      .select("external_task_id")
      .in("email", lowercasedEmails);

    const cacheRows = (
      cacheResult as { data: Array<{ external_task_id: string }> | null; error: unknown }
    ).data ?? [];

    if (cacheRows.length === 0) return new Set();

    const externalTaskIds = cacheRows.map((r) => r.external_task_id);

    // Step 3: find support_tickets rows for these external_task_ids (two-column pattern)
    const ticketsResult = await supabase
      .from("support_tickets")
      .select("id, outbound_clickup_task_id, clickup_task_id")
      .in("outbound_clickup_task_id", externalTaskIds);

    const ticketRows = (
      ticketsResult as { data: Array<{ id: string; outbound_clickup_task_id: string | null; clickup_task_id: string | null }> | null; error: unknown }
    ).data ?? [];

    // Also check fallback column
    const fallbackResult = await supabase
      .from("support_tickets")
      .select("id, outbound_clickup_task_id, clickup_task_id")
      .in("clickup_task_id", externalTaskIds);

    const fallbackRows = (
      fallbackResult as { data: Array<{ id: string; outbound_clickup_task_id: string | null; clickup_task_id: string | null }> | null; error: unknown }
    ).data ?? [];

    // Merge, deduplicate by id
    const allTicketRows = [...ticketRows, ...fallbackRows];
    const ticketMap = new Map<string, string>(); // support_tickets.id -> external_task_id
    const seenIds = new Set<string>();
    for (const row of allTicketRows) {
      if (seenIds.has(row.id)) continue;
      seenIds.add(row.id);
      const extId = row.outbound_clickup_task_id ?? row.clickup_task_id ?? null;
      if (extId) ticketMap.set(row.id, extId);
    }

    if (ticketMap.size === 0) return new Set();

    const ticketIds = Array.from(ticketMap.keys());

    // Step 4: find any notifications for these tickets newer than last_seen_at
    const notifResult = await supabase
      .from("support_notifications")
      .select("support_ticket_id, created_at")
      .in("support_ticket_id", ticketIds);

    const notifRows = (
      notifResult as { data: Array<{ support_ticket_id: string; created_at: string }> | null; error: unknown }
    ).data ?? [];

    // Step 5: determine which external_task_ids are unread
    const unreadIds = new Set<string>();
    for (const notif of notifRows) {
      const extId = ticketMap.get(notif.support_ticket_id);
      if (!extId) continue;

      const lastSeen = lastSeenMap.get(extId);
      if (!lastSeen || notif.created_at > lastSeen) {
        unreadIds.add(extId);
      }
    }

    return unreadIds;
  } catch {
    // Fail-safe: never throw from this read helper
    return new Set();
  }
}

/**
 * Maps a kind + payload status to a UI display key.
 * status_update: resolved/closed -> "resolved", assigned -> "assigned",
 *   in-progress -> "inProgress", anything else -> "otherStatus"
 * clarification_request -> "clarificationRequest"
 */
function toDisplayKey(
  kind: string,
  payload: Record<string, unknown>,
): NotificationDisplayKey {
  if (kind === "clarification_request") return "clarificationRequest";

  const status = (payload?.["status"] as string | undefined)?.toLowerCase() ?? "";
  if (status === "resolved" || status === "closed") return "resolved";
  if (status === "assigned") return "assigned";
  if (status === "in-progress" || status === "in progress" || status === "inprogress") {
    return "inProgress";
  }
  return "otherStatus";
}

/**
 * Returns notification feed entries for a ticket's detail view.
 * Only returns user-visible kinds: status_update and clarification_request.
 * Never returns vendor_draft, info_answer, or duplicate_link.
 * Results are ordered chronologically (ascending).
 *
 * Fail-safe: returns empty array on any error.
 */
export async function getNotificationsForExternalTaskId(
  externalTaskId: string,
): Promise<NotificationFeedEntry[]> {
  try {
    const supabase = createAdminClient();

    // Resolve external_task_id -> support_tickets.id (two-column pattern from clickup-outbound.ts)
    const primary = await supabase
      .from("support_tickets")
      .select("id")
      .eq("outbound_clickup_task_id", externalTaskId)
      .maybeSingle();

    let ticketId: string | null =
      (primary as { data: { id: string } | null; error: unknown }).data?.id ?? null;

    if (!ticketId) {
      const fallback = await supabase
        .from("support_tickets")
        .select("id")
        .eq("clickup_task_id", externalTaskId)
        .maybeSingle();

      ticketId =
        (fallback as { data: { id: string } | null; error: unknown }).data?.id ?? null;
    }

    if (!ticketId) return [];

    const USER_VISIBLE_KINDS = ["status_update", "clarification_request"] as const;

    const result = await supabase
      .from("support_notifications")
      .select("id, kind, payload, created_at")
      .eq("support_ticket_id", ticketId)
      .in("kind", USER_VISIBLE_KINDS)
      .order("created_at", { ascending: true });

    const rows = (
      result as {
        data: Array<{
          id: string;
          kind: string;
          payload: Record<string, unknown>;
          created_at: string;
        }> | null;
        error: unknown;
      }
    ).data ?? [];

    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      payload: row.payload ?? {},
      createdAt: row.created_at,
      displayKey: toDisplayKey(row.kind, row.payload ?? {}),
    }));
  } catch {
    // Fail-safe: never throw from this read helper
    return [];
  }
}
