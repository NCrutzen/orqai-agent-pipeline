import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SwarmLayoutShell } from "@/components/v7/swarm-layout-shell";
import { AgentRunBoard } from "@/components/automations/agent-run-board";
import { getAutomationBackingForSwarm } from "@/lib/automations/swarm-registry";

/**
 * `/swarm/[swarmId]` entry point. The parent layout has already gated
 * `project_members` access; this page fetches the swarm metadata used in
 * the header.
 *
 * Routing split:
 *   - If the swarm is registered as automation-backed (swarm-registry), we
 *     render the reusable AgentRunBoard filtered on that prefix.
 *   - Otherwise we fall back to the generic V7 placeholder shell while
 *     Phase 51/52/53 components are pending.
 */
export default async function SwarmPage({
  params,
}: {
  params: Promise<{ swarmId: string }>;
}) {
  const { swarmId } = await params;

  const supabase = await createClient();
  const { data: swarm } = await supabase
    .from("projects")
    .select("id, name, description")
    .eq("id", swarmId)
    .single();

  if (!swarm) {
    notFound();
  }

  const backing = getAutomationBackingForSwarm(swarmId);

  if (backing) {
    return (
      <div className="flex h-full flex-col p-6">
        <AgentRunBoard
          title={swarm.name}
          prefix={backing.prefix}
          description={backing.hint ?? swarm.description ?? undefined}
        />
      </div>
    );
  }

  return (
    <SwarmLayoutShell
      swarmName={swarm.name}
      swarmDescription={swarm.description}
    />
  );
}
