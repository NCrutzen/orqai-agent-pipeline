// Phase 3 Plan 03 Task 3 (P3-D-10 + P3-D-12) — legacy per-stage operator
// route retired.
//
// REQ-01 success criterion #2 lock: per-mailbox / per-stage override flows are
// reachable ONLY via Bulk Review (`/automations/[swarm]/review`). This page
// historically rendered the legacy side-pane container; Phase 3 deletes that
// container (anti-drift #4 — no side-pane reverts) and redirects operators
// to the inline-expand Bulk Review surface mounted by Plan 01 Task 0b.
//
// Hard-separation lock (docs/agentic-pipeline/README.md): Stage 2 (entity /
// customer mapping) sits between Stage 1 (noise) and Stage 3 (intent) — it
// touches neither registry. This redirect file touches neither registry.

import { redirect } from "next/navigation";

interface PageProps {
  params: Promise<{ swarm: string }>;
}

export default async function Stage2Page({ params }: PageProps) {
  const { swarm: swarmType } = await params;
  redirect(`/automations/${swarmType}/review`);
}
