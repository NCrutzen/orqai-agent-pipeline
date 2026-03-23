import { createClient } from "@/lib/supabase/server";
import { RunListLive } from "@/components/dashboard/run-list-live";
import { Play } from "lucide-react";

export default async function RunsPage() {
  const supabase = await createClient();

  // RLS scopes to user's projects automatically
  const { data: runs } = await supabase
    .from("pipeline_runs")
    .select("*, projects(name)")
    .order("created_at", { ascending: false });

  const pipelineRuns = runs ?? [];

  return (
    <div className="p-6">
      <div>
        <h1 className="text-2xl font-semibold">All Pipeline Runs</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pipeline runs across all your projects
        </p>
      </div>

      {pipelineRuns.length > 0 ? (
        <div className="mt-6">
          <RunListLive initialRuns={pipelineRuns} showProject />
        </div>
      ) : (
        <div className="mt-12 flex flex-col items-center py-12 text-center">
          <div className="rounded-full bg-muted p-3">
            <Play className="size-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">No pipeline runs yet</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Start a pipeline run from one of your projects to see it here.
          </p>
        </div>
      )}
    </div>
  );
}
