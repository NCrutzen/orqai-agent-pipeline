// Phase 76 Plan 06 Task 2 — Stage 3 RSC entry point.
//
// Loads Kanban rows filtered to result.kanban_reason ∈ {no_handler, low_confidence}
// and mounts the registry-driven shell + AutomationRealtimeProvider for the
// `${swarmType}-kanban` channel. Stage 4 count is computed in the same query
// so the tab strip can show a live badge for that tab too (handler_error).
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/README.md):
//   - Replay dropdown source: swarm_intents.handler_status='registered' (Stage 3).
//   - Reclassify-as-noise dropdown source: swarm_noise_categories minus 'unknown' (Stage 1).
//   - Hard separation: this page consumes both registries but never blurs them.
//
// W3 single-field rule (web/lib/swarms/types.ts:86): the canonical noise field
// is `category_key`. No legacy fallback to a non-existent secondary field.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadSwarm,
  loadSwarmIntents,
  loadSwarmNoiseCategories,
} from "@/lib/swarms/registry";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { loadKanbanRows } from "../_lib/kanban-loader";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { SelectionProvider } from "./selection-context";
import { Stage3Client } from "./row-list";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string }>;
}

export default async function Stage3Page({ params }: PageProps) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();

  // Spoofing gate (T-76-06-01): unknown or disabled swarm → 404.
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  // Parallel server-side fetch — RESEARCH §Pattern 7 (no chained awaits).
  const [allRows, intents, noiseCategories] = await Promise.all([
    loadKanbanRows(admin, swarmType),
    loadSwarmIntents(admin, swarmType),
    loadSwarmNoiseCategories(admin, swarmType),
  ]);

  const stage3Rows = allRows.filter(
    (r) =>
      r.result.kanban_reason === "no_handler" ||
      r.result.kanban_reason === "low_confidence",
  );
  const stage4Count = allRows.filter(
    (r) => r.result.kanban_reason === "handler_error",
  ).length;

  // Replay dropdown: Stage 3 — only registered intents (R-4 mitigation: prevent
  // operator from picking a placeholder intent and triggering silent fan-out).
  const replayIntents = intents.filter((i) => i.handler_status === "registered");
  // Reclassify dropdown: Stage 1 — exclude 'unknown' (CONTEXT.md deferred-ideas;
  // 'unknown' would round-trip the email back through the pipeline, overlapping
  // with Replay's purpose).
  const reclassifyNoiseCategories = noiseCategories.filter(
    (c) => c.category_key !== "unknown",
  );

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip
        swarm={swarm}
        currentStage={3}
        counts={{ 3: stage3Rows.length, 4: stage4Count }}
      />
      <AutomationRealtimeProvider
        automations={[`${swarmType}-kanban`]}
        initialLimit={500}
      >
        <SelectionProvider rowIds={stage3Rows.map((r) => r.id)}>
          <Stage3Client
            swarmType={swarmType}
            rows={stage3Rows}
            intents={replayIntents}
            noiseCategories={reclassifyNoiseCategories}
          />
        </SelectionProvider>
      </AutomationRealtimeProvider>
    </>
  );
}
