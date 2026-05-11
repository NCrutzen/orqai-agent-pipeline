// Phase 82 Plan 03 — Stage 2 on the unified `_shell/` library.
//
// Stage 2 = entity / customer mapping. Per the locked RFC
// (docs/agentic-pipeline/README.md) Stage 2 sits BETWEEN Stage 1 (noise filter,
// swarm_noise_categories) and Stage 3 (intent coordinator, swarm_intents). It
// touches NEITHER registry directly — categories and intents are passed to the
// unified detail pane as empty arrays.
//
// Wave 3 scope (CONTEXT D-02 / D-14 / D-15 / D-17, OQ-3 resolution):
//   - Render the same shell as Stages 0/1/3/4 even with zero row data.
//   - Phase 81 D-12 tagging-failures count banner preserved ABOVE the row list
//     (OQ-3 resolved as "banner-above", not folded into empty-state copy).
//   - debtor-email gets the live count + ↗ Open link to the tagging-failures
//     debug surface; other swarms render em-dash and no link (Phase 81-02
//     Assumption A3 — tagging telemetry is debtor-email-only today).
//   - Empty-state copy "No rows yet — Stage 2 awaits backend wiring..." (D-15).
//   - MailboxFilter visible (no-op when no rows; D-12 multi-select still works).
//   - Empty detail pane copy ("Select a row to inspect...").
//   - NO AutomationRealtimeProvider — Stage 2 has no realtime channel today
//     (RESEARCH §Realtime). Phase 82 explicitly does NOT unify channels.
//
// Phase 77 will replace this placeholder with the real Stage 2 surface; this
// is the bridge until then.

import { notFound } from "next/navigation";
import Link from "next/link";
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
import { loadStage2WeeklyCount } from "./_lib/load-stage-2-weekly-count";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ swarm: string }>;
  searchParams: Promise<{ mailbox?: string | string[]; selected?: string }>;
}

export default async function Stage2Page({ params, searchParams }: PageProps) {
  const { swarm: swarmType } = await params;
  const sp = await searchParams;
  const admin = createAdminClient();

  // Spoofing gate: unknown/disabled swarm → 404 (mirrors stage-0/page.tsx).
  const swarm = await loadSwarm(admin, swarmType);
  if (!swarm) notFound();

  // Phase 81-02 Pitfall 3 / Assumption A3: tagging telemetry is
  // debtor-email-only today; other swarms render "—" (em-dash) and omit the
  // ↗ deep-link. Phase 77's real Stage 2 surface will generalise this.
  const stage2Count =
    swarmType === "debtor-email" ? await loadStage2WeeklyCount(admin) : null;

  // Stage 2 data wiring deferred to Phase 77. Empty rows + empty detail pane
  // render the unified-shell skeleton intentionally (D-15/D-17).
  const rows: Row[] = [];
  const mailboxes = getSwarmMailboxes(swarmType, rows);
  const selectedMailboxes = parseSelectedMailboxes(sp.mailbox);
  const selectedId = sp.selected ?? null;

  return (
    <>
      <PageHeader swarm={swarm} />
      <StageTabStrip
        swarm={swarm}
        currentStage={2}
        counts={{ 2: stage2Count ?? 0 }}
      />
      <SelectionProvider rowIds={[]} initialSelectedId={selectedId}>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-3)",
            padding: "var(--space-4)",
          }}
        >
          {/* OQ-3 resolution: Phase 81 D-12 tagging-failures count banner
              sits ABOVE the row list, not folded into the empty-state copy.
              Preserved verbatim from the Phase 81-02 placeholder shape.   */}
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
            Customer-mapping issues this week:{" "}
            <strong style={{ fontVariantNumeric: "tabular-nums" }}>
              {stage2Count ?? "—"}
            </strong>
            {stage2Count !== null && (
              <Link
                href={`/swarm/${swarmType}/tagging-failures`}
                style={{ marginLeft: 8 }}
              >
                ↗ Open
              </Link>
            )}
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "var(--space-3)",
            }}
          >
            {/* Stage 2 primary "chip strip" = single 'All' chip with count=0
                (D-14/D-15). Real chip taxonomy lands when Phase 77 backend
                wiring exposes per-decision counts. */}
            <div role="tablist" aria-label="Stage 2 filter">
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
              gridTemplateColumns: "1fr 2fr",
              gap: "var(--space-3)",
              minHeight: 320,
            }}
          >
            <RowList
              rows={rows}
              emptyState={{
                title: "No rows yet",
                body: "Stage 2 awaits backend wiring in a follow-up phase.",
              }}
            />
            {/* Hard-separation contract (docs/agentic-pipeline/README.md):
                Stage 2 sits between Stage 1 and Stage 3 — passes categories=[]
                AND intents=[]. Entity / customer mapping doesn't live in
                either registry. */}
            <UnifiedDetailPane
              row={null}
              swarmType={swarmType}
              activeStage={2}
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
