// Map email_id → mailbox_id by querying public.automation_runs.
//
// Why this helper exists: email_pipeline.emails does NOT have a mailbox_id
// column. The canonical numeric mailbox_id lives on automation_runs (see
// stage-1/actions.ts:304 for the existing single-row pattern). Multiple runs
// can exist per email; we keep the MOST RECENT mailbox_id for the given
// swarm_type so the mailbox filter dropdown reflects the row's latest run.

import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadEmailMailboxes(
  admin: SupabaseClient,
  emailIds: ReadonlyArray<string>,
  swarmType: string,
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (emailIds.length === 0) return out;

  // PostgREST URL limit safety net: chunk into batches of 50.
  // automation_runs has multiple rows per email so we filter by swarm_type
  // AND by the JSON-extracted email_id. Order DESC and pick first hit per
  // email_id (first-write-wins on the most recent row).
  const CHUNK = 50;
  type RunRow = {
    email_id: string | null;
    mailbox_id: number | null;
    created_at: string;
  };
  const all: RunRow[] = [];
  for (let i = 0; i < emailIds.length; i += CHUNK) {
    const slice = emailIds.slice(i, i + CHUNK);
    const res = await admin
      .from("automation_runs")
      .select("email_id:result->>email_id, mailbox_id, created_at")
      .eq("swarm_type", swarmType)
      .in("result->>email_id", slice as string[])
      .order("created_at", { ascending: false });
    if (res.error) {
      // Non-fatal: leave map empty, callers fall back to mailbox_id=null.
      // eslint-disable-next-line no-console
      console.warn(
        `loadEmailMailboxes: automation_runs lookup failed: ${res.error.message}`,
      );
      continue;
    }
    for (const r of (res.data ?? []) as RunRow[]) {
      all.push(r);
    }
  }

  for (const r of all) {
    if (!r.email_id || r.mailbox_id === null) continue;
    if (!out.has(r.email_id)) out.set(r.email_id, r.mailbox_id);
  }
  return out;
}
