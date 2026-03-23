"use client";

import { useCallback, useState } from "react";
import { RunCard } from "@/components/run-card";
import { useBroadcast } from "@/lib/supabase/broadcast-client";
import type { RunUpdatePayload } from "@/lib/supabase/broadcast";

interface PipelineRun {
  id: string;
  project_id: string;
  name: string;
  use_case: string | null;
  status: string;
  step_count: number;
  steps_completed: number;
  agent_count: number;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  last_error?: string | null;
  projects?: { name: string } | null;
}

interface RunListLiveProps {
  initialRuns: PipelineRun[];
  showProject?: boolean;
}

export function RunListLive({
  initialRuns,
  showProject,
}: RunListLiveProps) {
  const [runs, setRuns] = useState<PipelineRun[]>(initialRuns);

  const handleRunUpdate = useCallback((payload: RunUpdatePayload) => {
    setRuns((prev) =>
      prev.map((run) =>
        run.id === payload.runId
          ? {
              ...run,
              status: payload.status,
              steps_completed: payload.stepsCompleted,
              agent_count: payload.agentCount ?? run.agent_count,
            }
          : run
      )
    );
  }, []);

  useBroadcast<RunUpdatePayload>("runs:live", "run-update", handleRunUpdate);

  return (
    <div className="flex flex-col gap-3">
      {runs.map((run) => (
        <RunCard key={run.id} run={run} showProject={showProject} />
      ))}
    </div>
  );
}
