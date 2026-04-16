import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SwarmLayoutShell } from "@/components/v7/swarm-layout-shell";

/**
 * `/swarm/[swarmId]` entry point. The parent layout has already gated
 * `project_members` access; this page fetches the swarm metadata used in
 * the header and hands everything to `SwarmLayoutShell`.
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

  return (
    <SwarmLayoutShell
      swarmName={swarm.name}
      swarmDescription={swarm.description}
    />
  );
}
