import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Emit a single "stale" broadcast for an automation_runs row write.
 *
 * Phase 59 D-02 contract:
 *   - exactly ONE broadcast per call, on channel `automations:${automation}:stale`
 *   - subscribers (AutomationRealtimeProvider) open one Supabase channel per
 *     automation name they own, so only the tabs that actually care receive it
 *   - failures are logged, never thrown — the DB write succeeded; a missed
 *     broadcast is recovered by the subscriber's manual refresh and is not
 *     data-loss
 *
 * Caller passes the admin client so we don't open a fresh connection per write.
 */
export async function emitAutomationRunStale(
  admin: SupabaseClient,
  automation: string,
): Promise<void> {
  if (!automation) return;
  const channelName = `automations:${automation}:stale`;
  try {
    const ch = admin.channel(channelName);
    await ch.httpSend("stale", { automation, at: new Date().toISOString() });
    await admin.removeChannel(ch);
  } catch (err) {
    console.warn("[emitAutomationRunStale] broadcast failed", {
      automation,
      err,
    });
  }
}
