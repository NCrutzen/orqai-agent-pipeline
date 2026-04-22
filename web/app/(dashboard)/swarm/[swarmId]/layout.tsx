import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SwarmRealtimeProvider } from "@/components/v7/swarm-realtime-provider";

/**
 * Per-swarm access gate. Runs server-side before any client Realtime
 * activity so unauthorized users never flash the shell before 404ing.
 *
 * This layout also establishes the `SwarmRealtimeProvider` boundary: the
 * provider's useEffect unmounts (and therefore runs its removeChannel
 * cleanup) when the `[swarmId]` dynamic segment changes, satisfying RT-01
 * teardown semantics.
 */
export default async function SwarmLayout({
  params,
  children,
}: {
  params: Promise<{ swarmId: string }>;
  children: React.ReactNode;
}) {
  const { swarmId } = await params;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Parent (dashboard) layout already redirected unauthenticated users.
  // Defensive check here prevents bypass if that parent is ever moved.
  if (!user) {
    notFound();
  }

  const { count } = await supabase
    .from("project_members")
    .select("*", { count: "exact", head: true })
    .eq("user_id", user.id)
    .eq("project_id", swarmId);

  if (!count) {
    notFound();
  }

  return (
    <SwarmRealtimeProvider swarmId={swarmId}>{children}</SwarmRealtimeProvider>
  );
}
