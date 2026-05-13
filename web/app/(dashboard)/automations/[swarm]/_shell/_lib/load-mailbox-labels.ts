// Derive mailbox_id → display label at runtime from production data.
//
// Source of truth:
//   1. public.automation_runs.{mailbox_id, entity}  — DISTINCT pairs for the swarm
//   2. public.swarms.entity_brand[].{code, display_name}  — brand registry
//
// New mailboxes that show up in production are picked up automatically; no
// code change required. Brands not yet wired to a mailbox_id stay invisible
// (no entry produced).

import type { SupabaseClient } from "@supabase/supabase-js";

interface BrandEntry {
  code: string;
  display_name: string;
}

export async function loadMailboxLabels(
  admin: SupabaseClient,
  swarmType: string,
): Promise<Record<number, string>> {
  const [pairsRes, swarmRes] = await Promise.all([
    admin
      .from("automation_runs")
      .select("mailbox_id, entity")
      .eq("swarm_type", swarmType)
      .not("mailbox_id", "is", null)
      .not("entity", "is", null)
      .limit(5000),
    admin
      .from("swarms")
      .select("entity_brand")
      .eq("swarm_type", swarmType)
      .maybeSingle(),
  ]);

  const brandMap = new Map<string, string>();
  const brands = (swarmRes.data?.entity_brand ?? []) as BrandEntry[];
  for (const b of brands) {
    if (b.code && b.display_name) brandMap.set(b.code, b.display_name);
  }

  const out: Record<number, string> = {};
  const pairs = (pairsRes.data ?? []) as Array<{
    mailbox_id: number | null;
    entity: string | null;
  }>;
  for (const p of pairs) {
    if (p.mailbox_id === null || !p.entity) continue;
    if (out[p.mailbox_id]) continue; // first-write-wins
    const lbl = brandMap.get(p.entity) ?? p.entity;
    out[p.mailbox_id] = lbl;
  }
  return out;
}
