// Phase 76 Plan 07 Task 2 — Stage 4 RSC entry point.
//
// Loads Kanban rows filtered to result.kanban_reason === 'handler_error'.
// Mounts the registry-driven shell + AutomationRealtimeProvider for the
// `${swarmType}-kanban` channel. Stage 3 count is computed in the same
// query so the tab strip can show a live badge for that tab too.
//
// Pipeline architecture lock (RFC docs/agentic-pipeline/README.md):
//   - Stage 4 surfaces handler-error rows ONLY (Stage 4 dispatch failures).
//   - Reclassify-as-noise dropdown source: swarm_noise_categories minus 'unknown' (Stage 1).
//   - Stage 4 has NO Replay-edit path (no intents loaded) — handler-errors
//     are either Reclassified to noise or Closed manually.
//   - Hard separation: Stage 1 noise registry vs Stage 3 intent registry —
//     never blurred. This page only needs the noise registry.
//
// W3 single-field rule (web/lib/swarms/types.ts:86): the canonical noise
// field is `category_key`. No legacy fallback.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  loadSwarm,
  loadSwarmNoiseCategories,
} from "@/lib/swarms/registry";
import { AutomationRealtimeProvider } from "@/components/automations/automation-realtime-provider";
import { loadKanbanRows } from "../_lib/kanban-loader";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { SelectionProvider } from "./selection-context";
import { Stage4Client } from "./row-list";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string }>;
}

export default async function Stage4Page({ params }: PageProps) {
  const { swarm: swarmType } = await params;
  const admin = createAdminClient();

  // Spoofing gate (T-76-07-01): unknown or disabled swarm → 404.
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  const [allRows, noiseCategories] = await Promise.all([
    loadKanbanRows(admin, swarmType),
    loadSwarmNoiseCategories(admin, swarmType),
  ]);

  const stage4Rows = allRows.filter(
    (r) => r.result.kanban_reason === "handler_error",
  );
  const stage3Count = allRows.filter(
    (r) =>
      r.result.kanban_reason === "no_handler" ||
      r.result.kanban_reason === "low_confidence",
  ).length;

  // W3 single-field rule: canonical field is `category_key`.
  const reclassifyNoiseCategories = noiseCategories.filter(
    (c) => c.category_key !== "unknown",
  );

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip
        swarm={swarm}
        currentStage={4}
        counts={{ 3: stage3Count, 4: stage4Rows.length }}
      />
      <AutomationRealtimeProvider
        automations={[`${swarmType}-kanban`]}
        initialLimit={500}
      >
        <SelectionProvider rowIds={stage4Rows.map((r) => r.id)}>
          <Stage4Client
            swarmType={swarmType}
            rows={stage4Rows}
            noiseCategories={reclassifyNoiseCategories}
          />
        </SelectionProvider>
      </AutomationRealtimeProvider>
    </>
  );
}
