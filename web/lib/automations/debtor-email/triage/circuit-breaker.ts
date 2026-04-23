import type { SupabaseClient } from "@supabase/supabase-js";

const BREAKER_WINDOW_MS = 30 * 60 * 1000;

export type BreakerState = "closed" | "open" | "half_open";

type AutomationStateRow = {
  key: string;
  state: "closed" | "open" | "half_open";
  opened_at: string | null;
  last_error: string | null;
};

/**
 * Non-mutating read. Treats an `open` row whose `opened_at` is >30min old as
 * `half_open` so the next caller probes. Does NOT persist the half_open flip
 * — that is callers' concern on probe result (open on failure, close on
 * success via {@link openBreaker} / {@link closeBreaker}).
 */
export async function checkBreaker(
  supabase: SupabaseClient,
  key: string,
): Promise<BreakerState> {
  const { data, error } = await supabase
    .schema("debtor")
    .from("automation_state")
    .select("key,state,opened_at,last_error")
    .eq("key", key)
    .maybeSingle();

  if (error) throw new Error(`checkBreaker: ${error.message}`);
  if (!data) return "closed";

  const row = data as AutomationStateRow;
  if (row.state !== "open") return row.state;

  if (row.opened_at) {
    const opened = Date.parse(row.opened_at);
    if (Number.isFinite(opened) && Date.now() - opened >= BREAKER_WINDOW_MS) {
      return "half_open";
    }
  }
  return "open";
}

export async function openBreaker(
  supabase: SupabaseClient,
  key: string,
  errorMsg: string,
): Promise<void> {
  const { error } = await supabase
    .schema("debtor")
    .from("automation_state")
    .upsert(
      {
        key,
        state: "open",
        opened_at: new Date().toISOString(),
        last_error: errorMsg.slice(0, 1000),
        updated_at: new Date().toISOString(),
        updated_by: "inngest:debtor-email-triage",
      },
      { onConflict: "key" },
    );
  if (error) throw new Error(`openBreaker: ${error.message}`);
}

export async function closeBreaker(
  supabase: SupabaseClient,
  key: string,
): Promise<void> {
  const { error } = await supabase
    .schema("debtor")
    .from("automation_state")
    .upsert(
      {
        key,
        state: "closed",
        opened_at: null,
        last_error: null,
        updated_at: new Date().toISOString(),
        updated_by: "inngest:debtor-email-triage",
      },
      { onConflict: "key" },
    );
  if (error) throw new Error(`closeBreaker: ${error.message}`);
}
