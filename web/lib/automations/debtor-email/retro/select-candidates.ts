/**
 * Phase 87 Plan 02 Task 1 — selectCandidates.
 *
 * Reads `pipeline_events` for stage=3 events in [since, until) and returns
 * recency-ordered retro candidates. D-03 enforces a hard 5000-row cap with a
 * fail-loud throw — narrow the window or raise the cap explicitly rather than
 * silently truncating.
 *
 * Pure (no Date.now / no random) — safe under Inngest replay.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export const STAGE_3_RETRO_HARD_CAP = 5000;

export type RetroCandidate = {
  email_id: string;
  original_top_intent: string | null;
  original_confidence: number | null;
  created_at: string;
};

export type SelectCandidatesArgs = {
  swarm_type: string;
  since: string;
  until: string;
  cap?: number;
};

type PipelineEventRow = {
  email_id: string;
  decision: string | null;
  confidence: number | null;
  created_at: string;
};

export async function selectCandidates(
  admin: Pick<SupabaseClient, "from">,
  args: SelectCandidatesArgs,
): Promise<RetroCandidate[]> {
  const cap = args.cap ?? STAGE_3_RETRO_HARD_CAP;

  const { data, error } = await admin
    .from("pipeline_events")
    .select("email_id, decision, confidence, created_at")
    .eq("swarm_type", args.swarm_type)
    .eq("stage", 3)
    .gte("created_at", args.since)
    .lt("created_at", args.until)
    .order("created_at", { ascending: false })
    .limit(cap + 1) as { data: PipelineEventRow[] | null; error: unknown };

  if (error) throw error as Error;
  const rows = data ?? [];

  if (rows.length > cap) {
    throw new Error(
      `Phase 87 D-03 cap exceeded: ${rows.length} stage=3 events for ${args.swarm_type} in [${args.since}, ${args.until}). Narrow the window or raise cap explicitly.`,
    );
  }

  return rows.map((r) => ({
    email_id: r.email_id,
    original_top_intent: r.decision,
    original_confidence:
      r.confidence == null ? null : Number(r.confidence),
    created_at: r.created_at,
  }));
}
