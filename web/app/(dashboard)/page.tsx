import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Activity, CheckCircle, Clock, FolderOpen, Plus } from "lucide-react";
import { ProjectCard } from "@/components/project-card";
import { CreateProjectModal } from "@/components/create-project-modal";
import { Button } from "@/components/ui/button";
import { ProjectSearch } from "./project-search";

export default async function DashboardPage() {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  const { data: { session } } = await supabase.auth.getSession();
  const { data: projects, error } = await supabase
    .from("projects")
    .select("*, project_members(user_id)")
    .order("updated_at", { ascending: false });

  console.log("[DEBUG-ALL]", JSON.stringify({
    userId: user?.id,
    email: user?.email,
    hasSession: !!session,
    hasAccessToken: !!session?.access_token,
    projectCount: projects?.length ?? 0,
    queryError: error,
  }));

  const projectList = projects ?? [];

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Overview of your projects and activity
          </p>
        </div>
        {projectList.length > 0 && <CreateProjectModal />}
      </div>

      {/* Activity overview stats */}
      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <Card size="sm">
          <CardHeader className="flex-row items-center gap-2">
            <Activity className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Runs This Week
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">0</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader className="flex-row items-center gap-2">
            <CheckCircle className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Success Rate
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">--</p>
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader className="flex-row items-center gap-2">
            <Clock className="size-4 text-muted-foreground" />
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Pending Approvals
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-semibold">0</p>
          </CardContent>
        </Card>
      </div>

      {/* Project list or empty state */}
      {projectList.length === 0 ? (
        <div className="mt-16 flex flex-col items-center text-center">
          <div className="rounded-full bg-muted p-4">
            <FolderOpen className="size-8 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-lg font-semibold">
            Create your first project to get started
          </h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Projects help you organize pipeline runs, manage team access, and
            track results.
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
