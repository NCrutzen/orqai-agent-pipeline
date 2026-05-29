// Phase 4 Plan 02 Task 1 — /automations/[swarm]/patterns route.
//
// Third top-level mode in Bulk Review (sibling of /review). Server component:
// loads the swarm registry row + hydrates promotion_candidates, then hands
// off to PatternsListingShell (client) which owns the URL state, the
// stage-grouped layout, and the chrome.
//
// Out-of-band guarantee: this route never imports the Inngest cron module
// (web/lib/inngest/functions/promotion-recommender-cron.ts). It is a
// read-only consumer of the table the cron populates.

import { notFound } from "next/navigation";

import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { getModeBarCounts } from "../_shell/_lib/mode-bar-counts";
import { hydrateCandidatesForSwarm } from "./_lib/hydrate-candidates";
import { PatternsListingShell } from "./components/patterns-listing-shell";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string }>;
}

export default async function PatternsPage({ params }: PageProps) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();

  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm || !swarm.enabled) {
    notFound();
  }

  const [candidates, modeBarCounts] = await Promise.all([
    hydrateCandidatesForSwarm(swarmType),
    getModeBarCounts(admin, swarmType),
  ]);

  return (
    <div className="px-6 pt-6 pb-12 w-full">
      <PatternsListingShell
        swarm={swarm}
        candidates={candidates}
        modeBarCounts={modeBarCounts}
      />
    </div>
  );
}
