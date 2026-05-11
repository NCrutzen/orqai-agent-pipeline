"use server";

/**
 * Phase 71-04 (Stage 2 customer combobox source).
 *
 * Source decision (per Plan 71-01 Task 6 checkpoint, option a):
 *   Thin SELECT over `public.coordinator_runs` DISTINCT customer_account_id +
 *   customer_name. No migration; uses existing service-role admin client.
 *
 * UI-SPEC §S2 contract:
 *   - Debounced 250ms (handled client-side in stage-2-widget.tsx).
 *   - min 2 chars, max 20 results.
 *   - Display: `{customer_name} · {nxt_account_id}`.
 */

import { createAdminClient } from "@/lib/supabase/admin";

export interface CustomerSearchHit {
  customer_account_id: string;
  customer_name: string;
}

export async function searchCustomers(
  query: string,
): Promise<CustomerSearchHit[]> {
  if (!query || query.trim().length < 2) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("coordinator_runs")
    .select("customer_account_id, customer_name")
    .ilike("customer_name", `%${query.trim()}%`)
    .not("customer_account_id", "is", null)
    .not("customer_name", "is", null)
    .limit(50);
  if (error || !data) return [];
  // Dedupe in memory — DISTINCT is awkward via PostgREST so we collapse
  // duplicate (customer_account_id, customer_name) tuples here.
  const seen = new Set<string>();
  const out: CustomerSearchHit[] = [];
  for (const row of data as CustomerSearchHit[]) {
    const k = `${row.customer_account_id}|${row.customer_name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(row);
    if (out.length >= 20) break;
  }
  return out;
}
