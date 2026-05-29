// Phase 4 Plan 03 Task 2 — single-candidate detail hydration.
//
// Loads one promotion_candidates row + up to 5 affected emails (joined via
// evidence_email_ids[] against email_pipeline.emails). Cross-swarm tampering
// guard: if candidate.swarm_type !== params.swarm, return null → page.tsx
// surfaces notFound().
//
// Email column names verified against migration
// supabase/migrations/20260507b_pipeline_events_email_summary_v2_email_meta.sql:50
// (e.id, e.subject, e.sender_email, e.sender_name, e.received_at).

import { createAdminClient } from "@/lib/supabase/admin";
import type { PromotionCandidateRow } from "@/lib/promotion-recommender/types";

export interface EvidenceEmail {
  id: string;
  sender_email: string;
  subject: string;
  received_at: string;
}

export interface CandidateDetailBundle {
  candidate: PromotionCandidateRow;
  evidence_emails: EvidenceEmail[];
  evidence_total_count: number;
}

const EVIDENCE_DISPLAY_LIMIT = 5;

export async function hydrateCandidateDetail(
  swarm_type: string,
  candidate_id: string,
): Promise<CandidateDetailBundle | null> {
  const admin = createAdminClient();

  const { data: candidate, error } = await admin
    .from("promotion_candidates")
    .select("*")
    .eq("id", candidate_id)
    .single();

  if (error || !candidate) return null;
  const row = candidate as unknown as PromotionCandidateRow;
  if (row.swarm_type !== swarm_type) return null;

  const all_ids = Array.isArray(row.evidence_email_ids)
    ? row.evidence_email_ids
    : [];
  const display_ids = all_ids.slice(0, EVIDENCE_DISPLAY_LIMIT);

  let evidence_emails: EvidenceEmail[] = [];
  if (display_ids.length > 0) {
    // Cross-schema query — supabase-js supports `.schema(...).from(...)` for
    // non-public schemas. Existing usage: see Inngest functions like
    // classifier-screen-worker.ts and debtor-email-coordinator.ts.
    const { data: emails } = await admin
      .schema("email_pipeline")
      .from("emails")
      .select("id, sender_email, subject, received_at")
      .in("id", display_ids);
    evidence_emails = (emails ?? []) as EvidenceEmail[];
  }

  return {
    candidate: row,
    evidence_emails,
    evidence_total_count: all_ids.length,
  };
}

export async function flipStatusOpenToInReview(
  candidate_id: string,
): Promise<void> {
  const admin = createAdminClient();
  // Idempotent: only matches the row when status='open'. If already in_review
  // or terminal, the UPDATE no-ops (0 rows affected).
  await admin
    .from("promotion_candidates")
    .update({ status: "in_review", updated_at: new Date().toISOString() })
    .eq("id", candidate_id)
    .eq("status", "open");
}
