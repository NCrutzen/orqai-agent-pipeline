import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InviteMemberModal } from "@/components/invite-member-modal";
import { RunListLive } from "@/components/dashboard/run-list-live";
import { SwarmGraph } from "@/components/graph/swarm-graph";
import { ProjectCredentialLinker } from "@/components/credentials/project-credential-linker";
import { ChevronRight, Calendar, Play, Plus, Network } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS ensures only members can access this project
  const { data: project, error } = await supabase
    .from("projects")
    .select("*, project_members(user_id)")
    .eq("id", id)
    .single();

  if (error || !project) {
    notFound();
  }

  // Fetch pipeline runs for this project
  const { data: runs } = await supabase
    .from("pipeline_runs")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  // Fetch latest successful run for Swarm Graph tab
  const { data: latestCompleteRun } = await supabase
    .from("pipeline_runs")
    .select("*, pipeline_steps(*)")
    .eq("project_id", id)
    .eq("status", "complete")
    .order("completed_at", { ascending: false })
    .limit(1)
    .single();

  const latestRunSteps = latestCompleteRun
    ? (latestCompleteRun.pipeline_steps ?? []).sort(
        (a: { step_order: number }, b: { step_order: number }) =>
          a.step_order - b.step_order
      )
    : [];

  // Fetch credentials linked to this project
  const { data: credentialLinks } = await supabase
    .from("credential_project_links")
    .select("credential_id")
    .eq("project_id", id);
  const linkedIds = new Set(
    (credentialLinks ?? []).map(
      (l: { credential_id: string }) => l.credential_id
    )
  );

  // Fetch all user's credentials
  const { data: allCredentials } = await supabase
    .from("credentials")
    .select("id, name, auth_type, status");

  const linkedCredentials = (allCredentials ?? []).filter(
    (c: { id: string }) => linkedIds.has(c.id)
  );
  const availableCredentials = (allCredentials ?? []).filter(
    (c: { id: string }) => !linkedIds.has(c.id)
  );

  // Fetch member emails for display
  const members: { user_id: string; email?: string }[] = (
    project.project_members ?? []
  ).map((m: { user_id: string }) => ({
    user_id: m.user_id,
    email: undefined,
  }));

  const createdDate = new Date(project.created_at).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  const pipelineRuns = runs ?? [];

  return (
    <div className="p-5">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-[12px] text-[var(--v7-muted)]">
        <Link
          href="/"
          className="hover:text-[var(--v7-text)] transition-colors"
        >
          Dashboard
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-[var(--v7-text)]">
          {project.name}
        </span>
      </nav>

      {/* Project header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-[32px] leading-[1.1] tracking-[-0.03em] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
            {project.name}
          </h1>
          {project.description && (
            <p className="mt-1 max-w-2xl text-[14px] text-[var(--v7-muted)]">
              {project.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-[12px] text-[var(--v7-faint)]">
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" />
              Created {createdDate}
            </span>
          </div>
        </div>
        <InviteMemberModal projectId={project.id} currentMembers={members} />
      </div>

      {/* Tabbed content */}
      <Tabs defaultValue="runs" className="mt-8">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="runs">Creations</TabsTrigger>
          <TabsTrigger value="swarm-graph">Swarm Graph</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>

        {/* Overview tab -- members */}
        <TabsContent value="overview">
          <div className="grid gap-6 lg:grid-cols-3">
            <GlassCard className="lg:col-span-1 p-5">
              <div className="pb-3">
                <h2 className="text-[14px] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
                  Members ({members.length})
                </h2>
              </div>
              <div>
                <div className="flex flex-col gap-2">
                  {members.map((member) => (
                    <div
                      key={member.user_id}
                      className="flex items-center gap-2"
                    >
                      <Avatar className="size-7">
                        <AvatarFallback className="text-xs">
                          {member.email?.[0]?.toUpperCase() || "U"}
                        </AvatarFallback>
                      </Avatar>
                      <span className="truncate text-[14px] text-[var(--v7-text)]">
                        {member.email ||
                          `User ${member.user_id.slice(0, 8)}...`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </GlassCard>
          </div>
        </TabsContent>

        {/* Runs tab */}
        <TabsContent value="runs">
          <div className="flex items-center justify-between">
            <h2 className="text-[20px] leading-[1.2] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
              Agent Swarms
            </h2>
            <Button asChild size="sm">
              <Link href={`/projects/${id}/new-run`}>
                <Plus className="mr-1.5 size-4" />
                Create Agent Swarm
              </Link>
            </Button>
          </div>

          {pipelineRuns.length > 0 ? (
            <div className="mt-4">
              <RunListLive initialRuns={pipelineRuns} />
            </div>
          ) : (
            <GlassCard className="mt-6 p-10 flex flex-col items-center text-center">
              <div className="rounded-full bg-[var(--v7-panel-2)] p-3">
                <Play className="size-5 text-[var(--v7-muted)]" />
              </div>
              <p className="mt-3 text-[14px] font-medium text-[var(--v7-text)]">
                No agent swarms yet
              </p>
              <p className="mt-1 text-[12px] text-[var(--v7-muted)]">
                Create your first agent swarm to see results here.
              </p>
              <Button asChild size="sm" className="mt-4">
                <Link href={`/projects/${id}/new-run`}>
                  <Plus className="mr-1.5 size-4" />
                  Create your first agent swarm
                </Link>
              </Button>
            </GlassCard>
          )}
        </TabsContent>

        {/* Swarm Graph tab */}
        <TabsContent value="swarm-graph">
          {latestCompleteRun ? (
            <div className="h-[calc(100vh-theme(spacing.64))]">
              <SwarmGraph
                runId={latestCompleteRun.id}
                steps={latestRunSteps}
                runStatus="complete"
              />
            </div>
          ) : (
            <GlassCard className="mt-6 p-10 flex flex-col items-center text-center">
              <div className="rounded-full bg-[var(--v7-panel-2)] p-3">
                <Network className="size-5 text-[var(--v7-muted)]" />
              </div>
              <p className="mt-3 text-[14px] font-medium text-[var(--v7-text)]">
                No agent swarm yet
              </p>
              <p className="mt-1 text-[12px] text-[var(--v7-muted)]">
                Complete a pipeline run to see the agent swarm graph here.
              </p>
            </GlassCard>
          )}
        </TabsContent>

        {/* Settings tab */}
        <TabsContent value="settings">
          <div className="mt-4">
            <ProjectCredentialLinker
              projectId={id}
              linkedCredentials={linkedCredentials}
              availableCredentials={availableCredentials}
            />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
