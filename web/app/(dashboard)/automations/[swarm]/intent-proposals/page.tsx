// Phase 86 Plan 03 — Intent Proposals RSC page.
//
// Read-only discovery surface (D-04) for novel intents the classifier flags
// but cannot map to swarm_intents. Reads the Plan 02 snapshot table
// (intent_proposal_clusters), NOT the live intent_proposals_v1 view —
// re-clustering on every request would defeat the cron's purpose.
//
// 404 contract:
//   - unknown swarm → notFound()
//   - swarm without stage3_coordinator_agent_key → notFound()
//     (no Stage 3 = no proposals possible; the discovery tab is also hidden)
//
// Cross-swarm filter (D-05): searchParams.swarm_filter ∈ {"current","all"}.
//   - "current" (default) → WHERE swarm_type = swarm.swarm_type
//   - "all"              → no swarm filter (admin overview)
//
// Hard-separation (docs/agentic-pipeline/README.md):
//   Reads only intent_proposal_clusters. Never reads swarm_noise_categories.
//   Never writes swarm_intents. Telemetry → intent_proposal_views via the
//   client shell's mount effect (actions.ts logTabView).

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { PageHeader } from "../_shell/page-header";
import { DiscoveryTabStrip } from "../_shell/discovery-tab-strip";
import { IntentProposalsClientShell } from "./client-shell";
import type { ClusterRow } from "@/lib/automations/intent-proposals/types";

export const dynamic = "force-dynamic";

type SwarmFilter = "current" | "all";

interface PageProps {
  params: Promise<{ swarm: string }>;
  searchParams: Promise<{ swarm_filter?: string }>;
}

function parseFilter(raw: string | undefined): SwarmFilter {
  return raw === "all" ? "all" : "current";
}

export default async function IntentProposalsPage({
  params,
  searchParams,
}: PageProps) {
  const { swarm: swarmType } = await params;
  const sp = await searchParams;
  const filter = parseFilter(sp.swarm_filter);

  const admin = createAdminClient();
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();
  if (!swarm.stage3_coordinator_agent_key) notFound();

  // Cluster list — most-populous first, then most-recently refreshed.
  let q = admin
    .from("intent_proposal_clusters")
    .select("*")
    .order("member_count", { ascending: false })
    .order("refreshed_at", { ascending: false })
    .limit(50);
  if (filter === "current") q = q.eq("swarm_type", swarm.swarm_type);
  const { data: clusterData, error: clusterErr } = await q;
  if (clusterErr) throw clusterErr;
  const clusters = (clusterData ?? []) as ClusterRow[];

  // Distinct-swarm count drives whether the cross-swarm dropdown renders
  // at all (RESEARCH Q3 default: hide the dropdown if only one swarm
  // currently has clusters).
  const { data: distinctRows } = await admin
    .from("intent_proposal_clusters")
    .select("swarm_type")
    .limit(200);
  const distinctSwarms = new Set(
    (distinctRows ?? []).map(
      (r) => (r as { swarm_type: string }).swarm_type,
    ),
  );

  return (
    <>
      <PageHeader swarm={swarm} />
      <DiscoveryTabStrip swarm={swarm} current="intent-proposals" />
      <IntentProposalsClientShell
        swarmType={swarm.swarm_type}
        filter={filter}
        clusters={clusters}
        crossSwarmDropdownVisible={distinctSwarms.size > 1}
      />
    </>
  );
}
