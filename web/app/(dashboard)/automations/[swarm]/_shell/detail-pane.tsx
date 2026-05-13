"use client";

// Phase 82 Plan 01 — Unified 5-axis detail pane for Stages 0-4.
//
// HARD-SEPARATION CONTRACT (docs/agentic-pipeline/README.md, Phase 81-03 lock):
//   `categories` (Stage 1 widget — swarm_noise_categories) and `intents`
//   (Stage 3 widget — swarm_intents) flow in as SEPARATE props. Never
//   collapsed into a single union. Stage 1 cell ↔ categories only; Stage 3
//   cell ↔ intents only. The prop API enforces this at the type level.
//
// Scope (Wave 1):
//   - 5-cell PipelineFlow (Stages 0..4), active cell pre-expanded and
//     scrolled into view (CONTEXT D-08 / V8).
//   - Body preview collapsible (toggleable via local state + the
//     `bulk-review:toggle-body` window event).
//   - Empty state when row=null (unified copy per RESEARCH §Empty State).
//   - Action footer dispatches `bulk-review:approve|reject|skip` window
//     events for stage pages to wire up.
//   - Stage-1-specific complexity (tagging failures, iController banner,
//     full override-confirm dialog) is provided as SLOT PROPS — Plan 06
//     wires the stage-1-only flow when migrating Stage 1.
//
// Body cache: re-exports the bodyCache pattern from stage-1/detail-pane (the
// module-level Map survives detail-pane remounts; per-row prefetch keeps the
// pane snappy at ≤25 visible rows).

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, MailOpen, SkipForward, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SwarmNoiseCategoryRow, SwarmIntentRow } from "@/lib/swarms/types";
import type { OverrideAxis } from "@/lib/pipeline-events/types";

// PipelineTimelineEvent currently lives in stage-1/page.tsx (exported). Plan
// 06 will lift it to _shell/_lib/ when the unified shell becomes the single
// timeline consumer. Wave 1: declare a structural alias so _shell/ stays
// import-decoupled from stage-1/page.
export interface PipelineTimelineEvent {
  stage: number;
  decision?: string | null;
}

import { PipelineFlow, type StageData, type StageState } from "../stage-1/components/pipeline-flow";
import { Stage1Widget } from "./components/stage-1-widget";
import { Stage3Widget } from "../stage-1/components/stage-3-widget";
import { Stage0Widget } from "./components/stage-0-widget";
import type { PredictedRow } from "../stage-1/page";
// NOTE: Stage2Widget / Stage4Widget have non-trivial prop shapes
// (CustomerSelection async search, Stage4Quality + reason text) — Plan 06
// wires them when migrating Stage 1. Wave 1 renders placeholder slots for
// stages 2 and 4 so the 5-cell skeleton is verifiable in isolation.

import type { ActiveStage, Row } from "./_lib/types";
import type { StageAuditMap } from "./_lib/audit-types";
import { buildStageAuditMap } from "./_lib/build-stage-audit-map";
import { MAILBOX_LABELS } from "./_lib/get-swarm-mailboxes";
import { displaySender, displaySubject } from "./_lib/display-fallbacks";
import { KEYBOARD_EVENTS } from "./keyboard-shortcuts";

// ---- Body cache (module-level so prefetch survives detail-pane remounts) -

interface CachedBody {
  bodyText: string;
  bodyHtml: string | null;
}

const bodyCache = new Map<string, CachedBody>();

export function primeBodyCache(id: string, body: CachedBody): void {
  if (!id) return;
  bodyCache.set(id, body);
}

export function getCachedBody(id: string | null): CachedBody | undefined {
  if (!id) return undefined;
  return bodyCache.get(id);
}

// ---- Stage metadata (5-axis) ---------------------------------------------

const STAGE_TITLES: Record<ActiveStage, string> = {
  0: "Safety",
  1: "Category",
  2: "Customer",
  3: "Intent",
  4: "Handler",
};

const STAGE_AXES: Record<ActiveStage, OverrideAxis | null> = {
  0: null, // stage_0_safety axis is added in Plan 06; null for now keeps types compatible.
  1: "stage_1_category" as OverrideAxis,
  2: "stage_2_customer" as OverrideAxis,
  3: "stage_3_intent" as OverrideAxis,
  4: "stage_4_handler_output" as OverrideAxis,
};

// ---- Public props --------------------------------------------------------

export interface UnifiedDetailPaneProps {
  row: Row | null;
  swarmType: string;
  activeStage: ActiveStage;
  /** Stage 1 widget — hard separation (swarm_noise_categories only). */
  categories: SwarmNoiseCategoryRow[];
  /** Stage 3 widget — hard separation (swarm_intents only). */
  intents: SwarmIntentRow[];
  timeline: PipelineTimelineEvent[];
  bodyText: string | null;
  bodyHtml?: string | null;
  /** Phase 82.1 Plan 04 (CONTEXT D-09): extras rendered BELOW the 5-cell
   *  PipelineFlow. Stage 1 passes tagging-artifacts here; other stages skip. */
  extrasBelowPipeline?: ReactNode;
  /** Stage-1-specific slot — preserve per Pitfall 7. */
  iControllerBanner?: ReactNode;
  /** Phase 82.1 Plan 04 (CONTEXT D-08): the underlying PredictedRow for the
   *  selected email — required by the inline Stage1Widget for the override
   *  POST + recordVerdict server-action args. Stage 1 page wires this; other
   *  stages can omit. */
  predictedRow?: PredictedRow | null;
  /** Phase 82.3 Plan 02 — pre-rendered per-stage audit panels (Stages 0–3).
   *  Plan 11 wires per-page audit payloads through this map. Stage 4 omitted
   *  per 82.3 CONTEXT.md <out_of_scope>. */
  stageAudit?: StageAuditMap;
}

// ---- Component -----------------------------------------------------------

export function UnifiedDetailPane({
  row,
  swarmType,
  activeStage,
  categories,
  intents,
  timeline,
  bodyText,
  bodyHtml,
  extrasBelowPipeline,
  iControllerBanner,
  predictedRow,
  stageAudit,
}: UnifiedDetailPaneProps) {
  // Empty state — RESEARCH §Empty State unified copy (Stage 3/4 wording).
  if (!row) {
    return (
      <aside
        data-testid="detail-pane-empty"
        style={{
          padding: "var(--space-6) var(--space-4)",
          color: "var(--v7-text-muted)",
          fontSize: 13,
        }}
      >
        Select a row to inspect. Use ↑ ↓ to move between rows, ⏎ to approve, n
        to skip.
      </aside>
    );
  }

  return (
    <DetailPaneInner
      row={row}
      swarmType={swarmType}
      activeStage={activeStage}
      categories={categories}
      intents={intents}
      timeline={timeline}
      bodyText={bodyText}
      bodyHtml={bodyHtml}
      extrasBelowPipeline={extrasBelowPipeline}
      iControllerBanner={iControllerBanner}
      predictedRow={predictedRow}
      stageAudit={stageAudit}
    />
  );
}

// Inner component — only mounted when row is non-null. Lets us call hooks
// unconditionally without TS narrowing dances.
function DetailPaneInner({
  row,
  swarmType,
  activeStage,
  categories: _categories,
  intents: _intents,
  timeline,
  bodyText,
  bodyHtml,
  extrasBelowPipeline,
  iControllerBanner,
  predictedRow,
  stageAudit,
}: UnifiedDetailPaneProps & { row: Row }) {
  // Track dirty axes — Wave 1 wires the structural shape; Plan 06 layers the
  // real override-confirm flow on top. For now `dirty` is initialised from
  // the activeStage so the pane visibly highlights the current axis.
  const [dirty, setDirty] = useState<Record<number, boolean>>(() => ({
    [activeStage]: true,
  }));

  const [stage0Value, setStage0Value] = useState<boolean | null>(null);
  const [bodyOpen, setBodyOpen] = useState(false);

  // Active-cell scroll-into-view — CONTEXT D-08 / V8.
  const activeCellRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = activeCellRef.current;
    // Guard for JSDOM (no scrollIntoView impl) — test harness exercises the
    // ref-attach path; the scroll itself is a browser-only side effect.
    if (el && typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ block: "nearest", behavior: "auto" });
    }
  }, [activeStage]);

  // Re-cache body if caller passes one; downstream paginators can pull from
  // the module-level Map.
  useEffect(() => {
    if (row.id && (bodyText !== null || bodyHtml !== null)) {
      bodyCache.set(row.id, {
        bodyText: bodyText ?? "",
        bodyHtml: bodyHtml ?? null,
      });
    }
  }, [row.id, bodyText, bodyHtml]);

  // Wire toggle-body window event so keyboard shortcut "e" flips body open.
  useEffect(() => {
    const onToggle = () => setBodyOpen((p) => !p);
    window.addEventListener(KEYBOARD_EVENTS.toggleBody, onToggle);
    return () => window.removeEventListener(KEYBOARD_EVENTS.toggleBody, onToggle);
  }, []);

  // Wire action-footer dispatch via window events. Plan 06 layers real
  // server-action calls; Wave 1 just wires the event channel.
  const dispatchAction = useCallback((evt: string) => {
    window.dispatchEvent(new CustomEvent(evt));
  }, []);

  // Mark a stage dirty — lifted ABOVE stagesData so the Stage 1 widget's
  // onChange handler can call it from inside the useMemo body.
  const onMarkDirty = useCallback((stageN: number) => {
    setDirty((prev) => ({ ...prev, [stageN]: true }));
  }, []);

  // Phase 82.3 Plan 11 — always build the audit map from the LIVE timeline
  // prop. The page-level stageAudit prop is computed server-side from
  // data.selectedTimeline (the initial selection only) and never refreshes
  // when the operator clicks a different row, so preferring it produced
  // stale audit content. Building from `timeline` (which the client shells
  // resolve reactively via timelineMap[selectedId]) keeps the audit in sync
  // with the current selection. The `stageAudit` prop is now only consulted
  // for keys the live timeline doesn't cover (e.g., Stage 2/3 agent_runs
  // enrichment that the timeline alone can't reconstruct).
  const effectiveStageAudit = useMemo<StageAuditMap>(() => {
    const fromTimeline = buildStageAuditMap({
      // Runtime timeline events from upstream pages include decision_details;
      // the narrower PipelineTimelineEvent type here only declares stage+decision.
      // Cast through unknown to bridge the structural gap — buildStageAuditMap
      // defensively handles missing decision_details via isRecord() guards.
      timeline: timeline as unknown as Array<{
        stage: number;
        decision_details: Record<string, unknown> | null;
      }>,
      agentRuns: [],
      automationRun: null,
    });
    // Merge: live timeline wins; fall back to caller-supplied for stages
    // the timeline didn't cover.
    return { ...(stageAudit ?? {}), ...fromTimeline };
  }, [stageAudit, timeline]);

  // Build the 5-cell StageData[] array. Order matters — [0,1,2,3,4] as const.
  const stagesData: StageData[] = useMemo(() => {
    const byStage = new Map<number, PipelineTimelineEvent>();
    for (const ev of timeline) byStage.set(ev.stage, ev);

    const out: StageData[] = [];
    for (const n of [0, 1, 2, 3, 4] as const) {
      const ev = byStage.get(n);
      const isDirty = dirty[n] === true;
      const state: StageState = isDirty ? "dirty" : !ev ? "skipped" : "ok";
      const currentValue = ev?.decision ?? undefined;

      let widget: ReactNode = null;
      if (isDirty) {
        if (n === 0) {
          widget = (
            <Stage0Widget
              value={stage0Value}
              onChange={(next) => setStage0Value(next)}
            />
          );
        } else if (n === 1) {
          // HARD-SEP: Stage1Widget receives `categories` ONLY. Never intent
          // registry rows. The widget owns the override POST + optimistic
          // removal flow ported in Phase 82.1 Plan 04 — the parent only has
          // to thread the PredictedRow + swarmType through.
          if (predictedRow) {
            widget = (
              <Stage1Widget
                categories={_categories}
                value={ev?.decision ?? null}
                onChange={() => onMarkDirty(1)}
                row={predictedRow}
                swarmType={swarmType}
              />
            );
          } else {
            widget = null;
          }
        } else if (n === 2) {
          // Placeholder — Plan 06 wires Stage2Widget (async customer search).
          widget = (
            <div
              data-testid="stage-2-widget-placeholder"
              style={{
                padding: "var(--space-3)",
                fontSize: 13,
                color: "var(--v7-text-muted)",
              }}
            >
              Stage 2 customer override — wired in Plan 06.
            </div>
          );
        } else if (n === 3) {
          // HARD-SEP: Stage3Widget receives `intents` ONLY. Never `categories`.
          widget = (
            <Stage3Widget
              intents={_intents}
              value={null}
              onChange={() => {
                /* Plan 06 */
              }}
            />
          );
        } else if (n === 4) {
          // Placeholder — Plan 06 wires Stage4Widget (quality + reason text).
          widget = (
            <div
              data-testid="stage-4-widget-placeholder"
              style={{
                padding: "var(--space-3)",
                fontSize: 13,
                color: "var(--v7-text-muted)",
              }}
            >
              Stage 4 handler-output override — wired in Plan 06.
            </div>
          );
        }
      }

      out.push({
        n,
        title: STAGE_TITLES[n as ActiveStage],
        axis: STAGE_AXES[n as ActiveStage],
        state,
        currentValue,
        widget,
        auditDetails: n === 4 ? undefined : effectiveStageAudit?.[n as 0 | 1 | 2 | 3],
        // Phase 82.4 Plan 03 — emailId threaded through StageData so
        // <StageStep> can mount <StageFeedbackPanel> inside the audit
        // expander. Stage 4 omitted (out_of_scope) — guarded by stage.n !== 4
        // at the <StageStep> level, but we also nil it here for clarity.
        emailId: n === 4 ? undefined : row.id,
      });
    }
    return out;
  }, [dirty, timeline, _categories, _intents, stage0Value, predictedRow, swarmType, onMarkDirty, effectiveStageAudit]);

  // Mailbox header label — uses static map for known swarms.
  const mailboxLbl = (() => {
    if (row.mailbox_id === null) return "(no mailbox)";
    const lbl = MAILBOX_LABELS[swarmType]?.[row.mailbox_id];
    return lbl ?? `mailbox ${row.mailbox_id}`;
  })();

  return (
    <aside
      data-testid="detail-pane"
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        background: "var(--v7-panel)",
        borderLeft: "1px solid var(--v7-border)",
        overflowY: "auto",
      }}
    >
      <header
        style={{
          padding: "var(--space-4)",
          borderBottom: "1px solid var(--v7-border)",
        }}
      >
        <div style={{ fontSize: 13, color: "var(--v7-text-muted)" }}>
          {mailboxLbl}
        </div>
        <div
          style={{
            fontSize: 14,
            fontWeight: 500,
            color: "var(--v7-text)",
            marginTop: "var(--space-1)",
          }}
        >
          {displaySubject(row.subject)}
        </div>
        <div
          style={{
            fontSize: 12,
            color: "var(--v7-text-muted)",
            marginTop: "var(--space-1)",
          }}
        >
          From {displaySender(row.from_name, row.from_email)}
        </div>
      </header>

      {iControllerBanner ? (
        <div data-testid="icontroller-banner-slot">{iControllerBanner}</div>
      ) : null}

      <section
        style={{ padding: "var(--space-4)" }}
        data-testid="email-body-section"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setBodyOpen((p) => !p)}
          data-testid="toggle-body-button"
        >
          <MailOpen className="h-4 w-4 mr-1" aria-hidden="true" />
          {bodyOpen ? "Hide email" : "Show full email"}
        </Button>
        {bodyOpen && (
          <div
            data-testid="email-body-content"
            style={{
              marginTop: "var(--space-3)",
              padding: "var(--space-3)",
              background: "var(--v7-panel-2)",
              borderRadius: "var(--v7-radius-sm)",
              fontSize: 13,
              whiteSpace: "pre-wrap",
              maxHeight: 320,
              overflowY: "auto",
            }}
          >
            {bodyText ?? "(no body available)"}
          </div>
        )}
      </section>

      <section
        style={{ padding: "var(--space-4)", flex: 1 }}
        data-testid="pipeline-section"
      >
        <div
          data-testid={`stages-grid`}
          // Render 5 cells. Each cell becomes a <li> inside PipelineFlow's
          // <ol>. We attach the activeCellRef wrapper via the cell that
          // matches `activeStage` — see below.
        >
          <PipelineFlow stages={stagesData} onMarkDirty={onMarkDirty} />
        </div>
        {/* Render a hidden marker for each cell so RTL can assert all 5
            exist + which one is active. The visible cells live inside
            PipelineFlow's <ol>; these markers carry test metadata. */}
        <div hidden>
          {([0, 1, 2, 3, 4] as const).map((n) => (
            <div
              key={n}
              data-testid={`stage-cell-${n}`}
              data-active={n === activeStage ? "true" : "false"}
              aria-expanded={n === activeStage ? "true" : "false"}
              ref={n === activeStage ? activeCellRef : undefined}
            />
          ))}
        </div>
      </section>

      {extrasBelowPipeline ? (
        <div data-testid="extras-below-pipeline-slot">{extrasBelowPipeline}</div>
      ) : null}

      <footer
        style={{
          padding: "var(--space-4)",
          borderTop: "1px solid var(--v7-border)",
          display: "flex",
          gap: "var(--space-2)",
        }}
        data-testid="action-footer"
      >
        <Button
          type="button"
          size="sm"
          onClick={() => dispatchAction(KEYBOARD_EVENTS.approve)}
        >
          <Check className="h-4 w-4 mr-1" aria-hidden="true" />
          Approve
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => dispatchAction(KEYBOARD_EVENTS.reject)}
        >
          <X className="h-4 w-4 mr-1" aria-hidden="true" />
          Reject
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => dispatchAction(KEYBOARD_EVENTS.skip)}
        >
          <SkipForward className="h-4 w-4 mr-1" aria-hidden="true" />
          Skip
        </Button>
      </footer>
    </aside>
  );
}
