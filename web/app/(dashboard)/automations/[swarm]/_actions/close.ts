"use server";

// Phase 76 Plan 05 — Close Kanban row Server Action.
//
// Operator-initiated terminal action: marks a pending Kanban row as
// completed and emits a single realtime broadcast on the
// `automations:${swarm_type}-kanban:stale` channel so the UI re-fetches.
//
// Security gates (T-76-05-03 / T-76-05-04):
//   1. swarmType validated against the `swarms` registry — rejects spoofed
//      [swarm] segment values that aren't a known swarm.
//   2. Compound filter on UPDATE: `.eq('id', rowId).eq('swarm_type', swarmType)
//      .eq('status', 'pending')`. Cross-swarm IDOR attempts hit zero rows
//      and short-circuit. Re-clicks on already-closed rows also no-op.

import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { emitAutomationRunStale } from "@/lib/automations/runs/emit";

export async function closeKanbanRow(args: {
  kanbanRowId: string;
  swarmType: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!args.kanbanRowId || !args.swarmType) {
    return { ok: false, error: "missing args" };
  }
  const admin = createAdminClient();

  // IDOR / spoofing mitigation — swarm must exist in registry.
  const swarm = await loadSwarm(admin, args.swarmType);
  if (!swarm) return { ok: false, error: "unknown swarm" };

  // Compound filter: id AND swarm_type AND status='pending'. Prevents
  // closing a row belonging to a different mailbox; idempotent on re-click.
  const { data, error } = await admin
    .from("automation_runs")
    .update({ status: "completed", completed_at: new Date().toISOString() })
    .eq("id", args.kanbanRowId)
    .eq("swarm_type", args.swarmType)
    .eq("status", "pending")
    .select("id");
  if (error) return { ok: false, error: error.message };
  if (!data || data.length === 0) {
    return { ok: false, error: "row not found or already closed" };
  }

  await emitAutomationRunStale(admin, `${args.swarmType}-kanban`);
  return { ok: true };
}
