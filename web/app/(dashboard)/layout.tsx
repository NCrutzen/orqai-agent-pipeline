import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SwarmSidebar } from "@/components/v7/swarm-sidebar";
import { fetchSwarmsWithCounts } from "@/lib/v7/swarm-data";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // Fetch user's swarms + initial Realtime snapshot for the V7 sidebar.
  // RLS via project_members ensures we only see accessible swarms.
  const { swarms, initialJobs, initialAgents } = await fetchSwarmsWithCounts();

  return (
    <div className="flex min-h-screen">
      <SwarmSidebar
        user={user}
        swarms={swarms}
        initialJobs={initialJobs}
        initialAgents={initialAgents}
      />
      <main className="flex-1 overflow-auto bg-[var(--v7-bg)] text-[var(--v7-text)] min-h-screen">
        {children}
      </main>
    </div>
  );
}
