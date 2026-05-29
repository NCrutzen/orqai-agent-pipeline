// Phase 4 Plan 03 Task 2 — candidate detail server-component route.
//
// /automations/[swarm]/patterns/[candidate_id]
//
// Flow:
//   1. Hydrate the candidate + evidence emails (cross-swarm tampering returns 404).
//   2. Fire idempotent open→in_review status flip (P4-D-11 lifecycle).
//   3. Mount CandidateDetailShell (client component, full surface in Task 3).

import { notFound } from "next/navigation";
import {
  hydrateCandidateDetail,
  flipStatusOpenToInReview,
} from "../_lib/hydrate-candidate-detail";
import { CandidateDetailShell } from "./candidate-detail-shell";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string; candidate_id: string }>;
}

export default async function Page({ params }: PageProps) {
  const { swarm, candidate_id } = await params;
  const bundle = await hydrateCandidateDetail(swarm, candidate_id);
  if (!bundle) notFound();
  // Status auto-flip side-effect — idempotent for non-open rows.
  await flipStatusOpenToInReview(candidate_id);
  return <CandidateDetailShell swarm={swarm} bundle={bundle} />;
}
