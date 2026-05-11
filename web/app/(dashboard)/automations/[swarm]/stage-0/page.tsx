// Phase 82 Plan 02 — Stage 0 page on the unified `_shell/` library.
//
// Stage 0 = safety / prompt-injection filter. Per the locked RFC
// (docs/agentic-pipeline/README.md) Stage 0 is upstream of and orthogonal to
// the Stage 1 noise / Stage 3 intent hard-separation split: it touches NEITHER
// swarm_noise_categories NOR swarm_intents. Categories and intents are passed
// to the unified detail pane as empty arrays.
//
// Wave 2 scope:
//   - Render the same shell as Stages 1/3/4 even with zero row data (D-15/D-16).
//   - Info banner preserved verbatim above the row list (D-16).
//   - Empty-state copy "No rows yet — Stage 0 awaits backend wiring..." (D-15).
//   - Mailbox filter visible (no-op when no rows; D-12 multi-select still works).
//   - Empty detail pane copy ("Select a row to inspect...").
//   - NO AutomationRealtimeProvider — Stage 0 has no realtime channel today
//     (RESEARCH §Realtime). Phase 82 explicitly does NOT unify channels.
//
// Phase 999.x will wire the backend data source (pipeline_events with
// stage=0 / decision='injection_suspected'). Until then this surface stays
// empty by design — UX consistency wins over hiding the surface.

import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadSwarm } from "@/lib/swarms/registry";
import { PageHeader } from "../_shell/page-header";
import { StageTabStrip } from "../_shell/stage-tab-strip";
import { RowList } from "../_shell/row-list";
import { MailboxFilter } from "../_shell/mailbox-filter";
import { UnifiedDetailPane } from "../_shell/detail-pane";
import { SelectionProvider } from "../_shell/selection-context";
import { getSwarmMailboxes } from "../_shell/_lib/get-swarm-mailboxes";
import type { Row } from "../_shell/_lib/types";

export const dynamic = "force-dynamic";

// D-16: Stage 0 info banner copy. Preserved verbatim from the Phase 76 Plan 08
// placeholder so operators see continuity through the unified-shell migration.
// Wording locked — change only when the backend wiring lands and the banner
// needs to reference live data shape.
const STAGE_0_INFO_BANNER =
  "Stage 0 (Safety) — prompt-injection filter. The dedicated safety-review " +
  "surface is out of scope for Phase 76 and will be built in a follow-up " +
  "phase. Stage 0 today emits to pipeline_events with stage=0 and " +
  "decision='injection_suspected' for any email that fails the safety " +
  "filter; those rows surface in the existing queue (stage 1) for now.";

interface PageProps {
  params: Promise<{ swarm: string }>;
  searchParams: Promise<{ mailbox?: string | string[]; selected?: string }>;
}

export default async function Stage0Page({ params, searchParams }: PageProps) {
  const { swarm: swarmType } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  // Spoofing gate: unknown/disabled swarm → 404 (mirrors stage-2/page.tsx).
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  // Stage 0 data wiring deferred to a follow-up phase. Empty rows + empty
  // detail pane render the unified-shell skeleton intentionally.
  const rows: Row[] = [];
  const mailboxes = getSwarmMailboxes(swarmType, rows);
  const selectedMailboxes = parseSelectedMailboxes(sp.mailbox);
  const selectedId = sp.selected ?? null;

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip swarm={swarm} currentStage={0} />
      <SelectionProvider rowIds={[]} initialSelectedId={selectedId}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
          }}
        >
          {/* D-16: Stage 0 info banner sits ABOVE the row list. */}
          <div
            role="note"
            style={{
              padding: "var(--space-3)",
              borderLeft: "2px solid var(--v7-brand-secondary)",
              background: "var(--v7-panel-2)",
              color: "var(--v7-text-muted)",
              fontSize: 13,
              lineHeight: 1.5,
              borderRadius: "var(--v7-radius-sm)",
            }}
          >
            {STAGE_0_INFO_BANNER}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-3)",
            }}
          >
            {/* Stage 0 primary "chip strip" = single 'All' chip with count=0
                (D-14/D-15). Real chip taxonomy lands when Stage 0 backend
                wiring exposes per-decision counts. */}
            <div role="tablist" aria-label="Stage 0 filter">
              <button
                type="button"
                role="tab"
                aria-selected="true"
                disabled
                style={{
                  padding: "var(--space-1) var(--space-3)",
                  borderRadius: "var(--v7-radius-pill)",
                  background: "var(--v7-brand-secondary-soft)",
                  border: "1px solid var(--v7-brand-secondary)",
                  color: "var(--v7-brand-secondary)",
                  fontSize: 12,
                  cursor: "default",
                }}
              >
                All <span style={{ opacity: 0.6 }}>0</span>
              </button>
            </div>
            <MailboxFilter
              mailboxes={mailboxes}
              selected={selectedMailboxes}
            />
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) 460px",
              gap: "var(--space-3)",
              minHeight: 320,
            }}
          >
            <RowList
              rows={rows}
              emptyState={{
                title: "No rows yet",
                body: "Stage 0 awaits backend wiring in a follow-up phase.",
              }}
            />
            {/* Hard-separation contract: Stage 0 page passes categories=[] AND
                intents=[] — Stage 0 is upstream of both registries. */}
            <UnifiedDetailPane
              row={null}
              swarmType={swarmType}
              activeStage={0}
              categories={[]}
              intents={[]}
              timeline={[]}
              bodyText={null}
            />
          </div>
        </div>
      </SelectionProvider>
    </>
  );
}

function parseSelectedMailboxes(
  p: string | string[] | undefined,
): number[] {
  const arr = Array.isArray(p) ? p : p ? [p] : [];
  return arr
    .map((s) => Number.parseInt(s, 10))
    .filter((n) => !Number.isNaN(n));
}
