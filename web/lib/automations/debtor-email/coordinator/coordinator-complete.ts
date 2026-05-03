// Phase 65 D-04 — RPC fan-in helper called by Stage 4 handlers on completion.
// Per RESEARCH OQ2 the synthesis emit happens app-side (not via pg_net) — keeps Inngest concurrency
// + replay-safety in app code. RPC returns claim_synthesis=true to exactly one caller.

import type { SupabaseClient } from "@supabase/supabase-js";
import { inngest } from "@/lib/inngest/client";

export interface NotifyResult {
  completed: number;
  expected: number;
  claim_synthesis: boolean;
}

type RpcRow = {
  completed_handlers: number;
  expected_handlers: number;
  claim_synthesis: boolean;
};

export async function notifyCoordinatorComplete(
  admin: SupabaseClient,
  run_id: string,
  failed: boolean = false,
): Promise<NotifyResult> {
  const { data, error } = await admin.rpc("coordinator_complete_handler", {
    p_run_id: run_id,
    p_failed: failed,
  });
  if (error) {
    throw new Error(`coordinator_complete_handler RPC failed: ${error.message}`);
  }
  // RPC returns table(completed_handlers, expected_handlers, claim_synthesis).
  // supabase-js gives back an array of rows; first row holds the result.
  const row: RpcRow | undefined = Array.isArray(data)
    ? (data[0] as RpcRow | undefined)
    : (data as RpcRow | undefined);
  if (!row) {
    throw new Error(
      `coordinator_complete_handler returned no rows for run_id=${run_id}`,
    );
  }
  const result: NotifyResult = {
    completed: row.completed_handlers,
    expected: row.expected_handlers,
    claim_synthesis: row.claim_synthesis === true,
  };

  // Emit synthesis ONLY when this caller won the claim. Race-safe per RESEARCH Pitfall 2.
  if (result.claim_synthesis) {
    await (
      inngest.send as unknown as (p: {
        name: string;
        data: Record<string, unknown>;
      }) => Promise<unknown>
    )({
      name: "debtor-email/synthesis.requested",
      data: { run_id },
    });
  }
  return result;
}
