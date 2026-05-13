/**
 * Phase 82.5 Plan 01 — server-side prefetch of FeedbackReadBack for a row set.
 *
 * One SELECT against public.email_feedback (filtered by `.in('email_id', ids)`
 * and `.eq('stage', stage)`, ordered created_at DESC), then a parallel
 * loadOperatorDisplayMap on the distinct operator_id set. Result is a total
 * Record<email_id, FeedbackReadBack> — every input id appears, even when
 * empty.
 *
 * Pattern E (first-write-wins on desc scan): for each email_id, the first
 * matching viewerId row becomes own_latest; the first row per OTHER operator
 * becomes that operator's entry in `others`. Deterministic per W4.
 *
 * Hard-separation reminder (docs/agentic-pipeline/README.md): keys solely on
 * `email_feedback.(email_id, stage)`. Does not touch swarm_noise_categories
 * or swarm_intents.
 *
 * Caller MUST be service-role (admin client) per CONTEXT D-3.
 * Performance budget: < 100ms additive, < 300ms p95 round-trip (R2).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { loadOperatorDisplayMap } from "./load-operator-display";
import type { FeedbackMap, FeedbackOtherNote, FeedbackReadBack } from "./types";

type Row = {
  email_id: string;
  operator_id: string;
  verdict: "confirm" | "override" | "unclear";
  prose_notes: string | null;
  created_at: string;
};

export async function loadFeedbackMap(
  admin: SupabaseClient,
  emailIds: string[],
  stage: 0 | 1 | 2 | 3,
  viewerId: string | null,
): Promise<FeedbackMap> {
  // Seed empty entries for every requested email_id so callers get a total map.
  const out: FeedbackMap = {};
  for (const id of emailIds) out[id] = { own_latest: null, others: [] };
  if (emailIds.length === 0) return out;

  const { data, error } = await admin
    .from("email_feedback")
    .select("email_id, operator_id, verdict, prose_notes, created_at")
    .in("email_id", emailIds)
    .eq("stage", stage)
    .order("created_at", { ascending: false });

  if (error || !data) return out;

  const rows = data as Row[];

  // Resolve operator display names after the main query so the IN list is
  // already the minimal distinct set.
  const distinctOps = Array.from(new Set(rows.map((r) => r.operator_id)));
  const displayMap = await loadOperatorDisplayMap(admin, distinctOps);

  // First-write-wins on the desc-ordered scan (Pattern E / W4 determinism).
  const ownClaimed = new Set<string>(); // email_ids that already have own_latest
  const otherClaimed = new Set<string>(); // `${email_id}|${operator_id}` already added to others

  for (const r of rows) {
    const entry = out[r.email_id];
    if (!entry) continue; // shouldn't happen — seeded above

    if (viewerId && r.operator_id === viewerId) {
      if (!ownClaimed.has(r.email_id)) {
        entry.own_latest = {
          prose_notes: r.prose_notes,
          verdict: r.verdict,
          created_at: r.created_at,
        };
        ownClaimed.add(r.email_id);
      }
    } else {
      const key = `${r.email_id}|${r.operator_id}`;
      if (!otherClaimed.has(key)) {
        const note: FeedbackOtherNote = {
          display_name: displayMap[r.operator_id] ?? r.operator_id.slice(0, 8),
          verdict: r.verdict,
          prose_notes: r.prose_notes,
          created_at: r.created_at,
        };
        entry.others.push(note);
        otherClaimed.add(key);
      }
    }
  }

  return out;
}
