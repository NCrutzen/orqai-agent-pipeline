"use server";

/**
 * Phase 71-04 (Stage 2 customer combobox source).
 *
 * Source decision — Plan 03-12 (gap-closure r3-1, supersedes Plan 71-01
 * checkpoint option a):
 *   Thin SELECT over `debtor.email_labels` (customer_account_id + debtor_name).
 *   The earlier source — `public.coordinator_runs` (customer_account_id,
 *   customer_name) — queried columns that DO NOT EXIST on coordinator_runs
 *   → PostgREST 42703 → the query silently returned [], so Stage 2 override
 *   validation never matched a real customer. debtor.email_labels.debtor_name
 *   is the real source (populated for all rows that carry a customer_account_id;
 *   debtor_name → customer_name in the hit). No migration; existing
 *   service-role admin client. Hard separation preserved: reads the customer
 *   columns only — never swarm_intents.
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

interface EmailLabelNameRow {
  customer_account_id: string | null;
  debtor_name: string | null;
}

export async function searchCustomers(
  query: string,
): Promise<CustomerSearchHit[]> {
  const q = query?.trim() ?? "";
  if (q.length < 2) return [];
  const admin = createAdminClient();
  const { data, error } = await admin
    .schema("debtor")
    .from("email_labels")
    .select("customer_account_id, debtor_name")
    .ilike("debtor_name", `%${q}%`)
    .not("customer_account_id", "is", null)
    .not("debtor_name", "is", null)
    .limit(50);
  if (error || !data) return [];
  // Map debtor_name → customer_name + dedupe in memory — DISTINCT is awkward
  // via PostgREST so we collapse duplicate (customer_account_id, name) tuples.
  const seen = new Set<string>();
  const out: CustomerSearchHit[] = [];
  for (const row of data as EmailLabelNameRow[]) {
    if (!row.customer_account_id || !row.debtor_name) continue;
    const k = `${row.customer_account_id}|${row.debtor_name}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({
      customer_account_id: row.customer_account_id,
      customer_name: row.debtor_name,
    });
    if (out.length >= 20) break;
  }
  return out;
}
