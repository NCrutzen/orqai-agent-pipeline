import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Async callback state for the debtor fetchDocument tool.
 *
 * The Vercel route inserts a pending row, POSTs to the Zap, then waits for
 * the Zap's callback handler to UPDATE this row with status='complete'.
 * We wait via Supabase Realtime (postgres_changes) with a timeout ceiling
 * below Vercel's serverless limit.
 */
export type FetchRequestResult = {
  invoice_id?: string;
  customer_id?: string;
  invoice_date?: string;
  pdf_url?: string;
  filename?: string;
  document_type?: string;
  bucket?: string;
  key?: string;
  created_on?: string;
  // Allow extra fields from the Zap without breaking the type.
  [key: string]: unknown;
};

type FetchRequestRow = {
  id: string;
  status: "pending" | "complete" | "failed";
  result: FetchRequestResult | null;
  error: string | null;
};

/**
 * Wait for a fetch_requests row to transition out of 'pending'.
 *
 * Resolves to the result payload on 'complete', null on timeout, throws on 'failed'.
 * Uses a single Realtime subscription plus an initial SELECT guard (handles the
 * race where the callback lands before the subscription is established).
 */
export async function waitForFetchRequest(
  requestId: string,
  timeoutMs: number,
): Promise<FetchRequestResult | null> {
  const admin = createAdminClient();

  return new Promise<FetchRequestResult | null>((resolve, reject) => {
    let settled = false;
    let channel: RealtimeChannel | null = null;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const cleanup = () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (channel) {
        admin.removeChannel(channel).catch(() => null);
      }
    };

    const finish = (
      outcome: { kind: "ok"; value: FetchRequestResult | null } | { kind: "err"; error: Error },
    ) => {
      if (settled) return;
      settled = true;
      cleanup();
      if (outcome.kind === "ok") resolve(outcome.value);
      else reject(outcome.error);
    };

    // Subscribe FIRST so we don't miss the UPDATE.
    channel = admin
      .channel(`fetch_req:${requestId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "debtor",
          table: "fetch_requests",
          filter: `id=eq.${requestId}`,
        },
        (payload: RealtimePostgresChangesPayload<FetchRequestRow>) => {
          const row = payload.new as FetchRequestRow | undefined;
          if (!row) return;
          if (row.status === "complete") {
            finish({ kind: "ok", value: row.result ?? {} });
          } else if (row.status === "failed") {
            finish({
              kind: "err",
              error: new Error(row.error ?? "fetch request failed"),
            });
          }
        },
      )
      .subscribe(async (status) => {
        if (status !== "SUBSCRIBED") return;

        // Guard against the race where the callback already landed.
        const { data, error } = await admin
          .schema("debtor")
          .from("fetch_requests")
          .select("id, status, result, error")
          .eq("id", requestId)
          .maybeSingle();

        if (error) {
          finish({ kind: "err", error: new Error(`fetch_requests lookup failed: ${error.message}`) });
          return;
        }
        if (!data) return; // row not inserted yet? shouldn't happen — caller inserts before calling us.
        const row = data as FetchRequestRow;
        if (row.status === "complete") {
          finish({ kind: "ok", value: row.result ?? {} });
        } else if (row.status === "failed") {
          finish({ kind: "err", error: new Error(row.error ?? "fetch request failed") });
        }
      });

    timeoutId = setTimeout(() => finish({ kind: "ok", value: null }), timeoutMs);
  });
}
