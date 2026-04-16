import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { GlassCard } from "@/components/ui/glass-card";
import { Activity, CheckCircle, Clock, FolderOpen, Plus } from "lucide-react";
import { CreateProjectModal } from "@/components/create-project-modal";
import { Button } from "@/components/ui/button";
import { ProjectSearch } from "./project-search";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  void user;
  const { data: projects } = await supabase
    .from("projects")
    .select("*, project_members(user_id)")
    .order("updated_at", { ascending: false });

  const projectList = projects ?? [];

  return (
    <div className="p-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-[32px] leading-[1.1] tracking-[-0.03em] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
            Dashboard
          </h1>
          <p className="mt-1 text-[14px] text-[var(--v7-muted)]">
            Overview of your projects and activity
          </p>
        </div>
        {projectList.length > 0 && <CreateProjectModal />}
      </div>

      {/* Activity overview stats */}
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 pb-2">
            <Activity className="size-4 text-[var(--v7-muted)]" />
            <span className="text-[12px] uppercase tracking-[0.1em] text-[var(--v7-faint)]">
              Runs This Week
            </span>
          </div>
          <p className="text-[26.4px] leading-[1.1] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
            0
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 pb-2">
            <CheckCircle className="size-4 text-[var(--v7-muted)]" />
            <span className="text-[12px] uppercase tracking-[0.1em] text-[var(--v7-faint)]">
              Success Rate
            </span>
          </div>
          <p className="text-[26.4px] leading-[1.1] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
            --
          </p>
        </GlassCard>
        <GlassCard className="p-5">
          <div className="flex items-center gap-2 pb-2">
            <Clock className="size-4 text-[var(--v7-muted)]" />
            <span className="text-[12px] uppercase tracking-[0.1em] text-[var(--v7-faint)]">
              Pending Approvals
            </span>
          </div>
          <p className="text-[26.4px] leading-[1.1] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
            0
          </p>
        </GlassCard>
      </div>

      {/* Project list or empty state */}
      {projectList.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="rounded-full bg-[var(--v7-panel-2)] p-4">
            <FolderOpen className="size-8 text-[var(--v7-muted)]" />
          </div>
          <h2 className="mt-4 text-[20px] leading-[1.2] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
            Create your first project to get started
          </h2>
          <p className="mt-1 max-w-sm text-[14px] text-[var(--v7-muted)]">
            Projects help you organize agent swarm creations, manage team access,
            and track results.
          </p>
          <div className="mt-6">
            <CreateProjectModal
              trigger={
                <Button size="lg">
                  <Plus className="size-4" />
                  Create Project
                </Button>
              }
            />
          </div>
        </div>
      ) : (
        <Suspense fallback={null}>
          <ProjectSearch projects={projectList} />
        </Suspense>
      )}
    </div>
  );
}
