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
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Check, MailOpen, SkipForward, Undo2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import type { SwarmNoiseCategoryRow, SwarmIntentRow } from "@/lib/swarms/types";
import type { OverrideAxis } from "@/lib/pipeline-events/types";
import type { FeedbackReadBack } from "@/lib/automations/debtor-email/feedback/types";
// Phase 82.8-07 D-03 mount — Stage 1 before/after iController screenshot strip.
// Reuses the Plan 06 component built in isolation; here we wire the path map
// through detail-pane and render the strip inside the Stage 1 audit expander.
import { StageScreenshotStrip } from "@/components/automations/bulk-review/audit/StageScreenshotStrip";

// PipelineTimelineEvent currently lives in stage-1/page.tsx (exported). Plan
// 06 will lift it to _shell/_lib/ when the unified shell becomes the single
// timeline consumer. Wave 1: declare a structural alias so _shell/ stays
// import-decoupled from stage-1/page.
export interface PipelineTimelineEvent {
  stage: number;
  decision?: string | null;
  // 2026-05-19 — buildStageAuditMap's bridges read decision_details and
  // confidence at runtime. Marked optional so client shells that fetch a
  // narrower projection still type-check; pages that want working audit
  // panels (stages 0/1/2/3) must select these columns and push them into
  // their timelineMap.
  decision_details?: Record<string, unknown> | null;
  confidence?: number | null;
}

import { PipelineFlow, type StageData, type StageState } from "../stage-1/components/pipeline-flow";
import { Stage1Widget } from "./components/stage-1-widget";
import { Stage2OverrideWidget } from "./components/stage-2-widget";
import { Stage3OverrideWidget } from "./components/stage-3-widget";
import { Stage0Widget } from "./components/stage-0-widget";
import type { PredictedRow } from "../stage-1/page";
import { approvePrediction } from "../stage-1/actions";
import { useSelection } from "./selection-context";
// NOTE: Stage2Widget / Stage4Widget have non-trivial prop shapes
// (CustomerSelection async search, Stage4Quality + reason text) — Plan 06
// wires them when migrating Stage 1. Wave 1 renders placeholder slots for
// stages 2 and 4 so the 5-cell skeleton is verifiable in isolation.

import type { ActiveStage, Row } from "./_lib/types";
import type { StageAuditMap } from "./_lib/audit-types";
import { buildStageAuditMap } from "./_lib/build-stage-audit-map";
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
  /** DB-derived mailbox_id → display label. Pages load via loadMailboxLabels.
   *  Falls back to "mailbox {id}" when an id isn't in the map. */
  mailboxLabels?: Record<number, string>;
  /** Phase 82.5 Plan 06 — per-stage feedback read-back for the selected row.
   *  Optional, accepted-but-ignored at this layer; Plan 05 wires the consumer
   *  (StageFeedbackPanel inside DetailPaneInner). Threading the prop through
   *  Plan 06 first lets Plan 05 land its render without touching shells. */
  feedbackMap?: Partial<Record<0 | 1 | 2 | 3, import("@/lib/automations/debtor-email/feedback/types").FeedbackReadBack>>;
  /** Phase 82.7 Plan 04 (D-01) — operator's filtered visible row ids (same
   *  array driving <RowList>, BEFORE pendingRemoval trimming). Used by the
   *  Approve branch of `handlePrimary` to compute the next selection target.
   *  Optional for non-Stage-1 callers (Stage 0/2/3/4 footer is hidden per
   *  Phase 82.6 D-02b, so the auto-advance path is unreachable there). When
   *  omitted, defaults to `[]` and auto-advance falls back to `null` (selection
   *  clears). */
  visibleRowIds?: string[];
  /** Phase 82.8-07 D-03 — per-email iController screenshot paths (before /
   *  after) sourced from `debtor.email_labels.screenshot_*_path`. Pages load
   *  the map once (single SELECT keyed on the visible email_id set) and pass
   *  it through; detail-pane renders <StageScreenshotStrip> inside the Stage 1
   *  audit expander for the selected row. Empty / missing entries render the
   *  strip's empty state ("No screenshots available"). Swarms without an
   *  iController side-effect simply omit the prop. */
  screenshotPathsByEmailId?: Record<string, { before: string | null; after: string | null }>;
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
  mailboxLabels,
  feedbackMap,
  visibleRowIds,
  screenshotPathsByEmailId,
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
      mailboxLabels={mailboxLabels}
      feedbackMap={feedbackMap}
      visibleRowIds={visibleRowIds}
      screenshotPathsByEmailId={screenshotPathsByEmailId}
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
  mailboxLabels,
  feedbackMap,
  visibleRowIds,
  screenshotPathsByEmailId,
}: UnifiedDetailPaneProps & { row: Row }) {
  // Track dirty axes. Stays {} on mount — the operator opts into override
  // for a stage by clicking that stage's inline "override stage" link
  // (stage-step.tsx 'ok'/'skipped' branches → onMarkDirty). Defaulting the
  // activeStage to dirty (a Wave-1 placeholder from Phase 82-01 that Plan 06
  // was meant to remove) shipped two visible UX bugs:
  //   1. Footer button reads "Submit override (Stage N)" even when the
  //      operator wants to approve the current verdict.
  //   2. Clicking that button hits the override path → silent no-op (or, post
  //      Phase 82.5 toast, a misleading "pick a new category" error) when
  //      the operator simply wanted to confirm.
  // With dirty={} on mount, the row defaults to "Approve verdicts that ran"
  // semantics and stays there until the operator explicitly overrides a stage.
  const [dirty, setDirty] = useState<Record<number, boolean>>({});

  // Reset dirty state when the selected row changes — without this, a stage
  // marked dirty on row A leaks into row B (the footer would mislabel and
  // the widget-pickers would render against a stale axis).
  useEffect(() => {
    setDirty({});
  }, [row.id]);

  // Phase 82.7 Plan 04 (D-01) — Approve path uses the atomic
  // markPendingRemovalAndAdvance helper to auto-advance to the next visible
  // row in one render cycle. Submit-override path (anyDirty===true branch
  // above) intentionally doesn't auto-advance — see handlePrimary comment.
  const { markPendingRemovalAndAdvance } = useSelection();

  const [stage0Value, setStage0Value] = useState<boolean | null>(null);
  const [bodyOpen, setBodyOpen] = useState(false);

  // Phase 82.5 Plan 05 (R6) — future-pill expansion state. Reset to false on
  // row change so each selection starts with trailing skipped stages collapsed.
  const [futureExpanded, setFutureExpanded] = useState(false);
  useEffect(() => {
    setFutureExpanded(false);
  }, [row.id]);

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

  // Phase 82.7 Plan 02 (D-03) — cancel-override escape hatches. Pure
  // client-side dirty-map mutations; no server traffic. resetAllStageFeedback
  // backs the footer Cancel button (clears every dirty stage at once);
  // onCancelDirty is the per-stage variant threaded into PipelineFlow for
  // Plan 03 to wire into stage-step.tsx.
  const resetAllStageFeedback = useCallback(() => {
    setDirty({});
  }, []);

  const onCancelDirty = useCallback((stageN: number) => {
    setDirty((prev) => {
      const { [stageN]: _omit, ...rest } = prev;
      return rest;
    });
  }, []);

  // Phase 82.7.1 D-01/D-02 — per-stage Submit affordance for Stage 0/2/3/4.
  // Fires the same `bulk-review:override-submit` window event the footer
  // Submit dispatches on Stage 1 (see handlePrimary below), preserving the
  // W6 single-write contract — a direct POST here would double-write. Footer
  // remains scoped to activeStage === 1 (Phase 82.6 D-02b) — this callback is
  // the per-stage parallel for Stages 0/2/3/4. stageN is currently unused
  // because the listening Stage widget already knows which stage it owns;
  // accepted for prop-shape parity with onCancelDirty.
  const onSubmitDirty = useCallback((_stageN: number) => {
    window.dispatchEvent(new Event(KEYBOARD_EVENTS.overrideSubmit));
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
    const merged: StageAuditMap = { ...(stageAudit ?? {}), ...fromTimeline };

    // Phase 82.8-07 D-03 — append the iController before/after screenshot strip
    // INSIDE the Stage 1 audit expander, directly after the existing
    // Stage1EvidencePanel content. Direct-prop channel per Plan 07:
    // `screenshotPathsByEmailId` is read straight off the row's email_id; we do
    // NOT route paths through build-stage-audit-map.ts (audit-map plumbing
    // stays untouched). Empty / both-null entries render the strip's own
    // "No screenshots available" empty state, so it is always safe to mount.
    const paths = screenshotPathsByEmailId?.[row.id];
    const stripNode = (
      <StageScreenshotStrip
        beforePath={paths?.before ?? null}
        afterPath={paths?.after ?? null}
      />
    );
    const existing = merged[1] as ReactNode | undefined;
    merged[1] = (
      <Fragment>
        {existing ?? null}
        {stripNode}
      </Fragment>
    );
    return merged;
  }, [stageAudit, timeline, screenshotPathsByEmailId, row.id]);

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
              emailId={row.id}
              swarmType={swarmType}
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
          // Phase 88 Plan 02 — Stage 2 customer override widget. Wraps the
          // existing async customer-search picker with fused note textarea
          // (D-01b) + override POST handler. Requires predictedRow for the
          // POST + recordVerdict args; absent → render nothing (parity with
          // Stage 1 widget guard above).
          if (predictedRow) {
            widget = (
              <Stage2OverrideWidget
                value={null}
                onChange={() => onMarkDirty(2)}
                row={predictedRow}
                swarmType={swarmType}
              />
            );
          } else {
            widget = null;
          }
        } else if (n === 3) {
          // Phase 88 Plan 02 — Stage 3 intent override widget. HARD-SEP:
          // consumes `intents` ONLY. Requires predictedRow for the override
          // POST + recordVerdict args.
          if (predictedRow) {
            widget = (
              <Stage3OverrideWidget
                intents={_intents}
                value={ev?.decision ?? null}
                onChange={() => onMarkDirty(3)}
                row={predictedRow}
                swarmType={swarmType}
              />
            );
          } else {
            widget = null;
          }
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
        // Phase 82.5 Plan 05 (R1) — server-prefetched feedback read-back for
        // this stage. <StageStep> uses it to seed the controlled textarea +
        // render OthersSaidBlock inside <StageFeedbackPanel>. Stage 4 omitted
        // (out_of_scope per 82.3 CONTEXT).
        feedbackReadBack:
          n === 4 ? undefined : feedbackMap?.[n as 0 | 1 | 2 | 3],
      });
    }
    return out;
  }, [dirty, timeline, _categories, _intents, stage0Value, predictedRow, swarmType, onMarkDirty, effectiveStageAudit, feedbackMap, row.id]);

  // Phase 82.5 Plan 05 (R6) — compute futureRange from stagesData. Walk
  // backwards over stages [4..0] while state==='skipped'. Require ≥2
  // consecutive trailing skipped stages to collapse (one alone isn't worth a
  // pill).
  const futureRange = useMemo<{ startN: number; endN: number } | null>(() => {
    let endN = -1;
    let startN = 5;
    for (let i = 4; i >= 0; i--) {
      if (stagesData[i]?.state === "skipped") {
        if (endN === -1) endN = stagesData[i].n;
        startN = stagesData[i].n;
      } else {
        break;
      }
    }
    if (endN === -1 || endN - startN < 1) return null;
    return { startN, endN };
  }, [stagesData]);

  // Phase 82.5 Plan 05 (R7) — bottom-button morph state.
  const anyDirty = stagesData.some((s) => s.state === "dirty");
  const dirtyStages = stagesData
    .filter((s) => s.state === "dirty")
    .map((s) => s.n);
  const visibleOkStages = stagesData
    .filter((s) => s.state === "ok")
    .map((s) => s.n);

  const primaryLabel = anyDirty
    ? dirtyStages.length === 1
      ? `Submit override (Stage ${dirtyStages[0]})`
      : `Submit overrides (Stages ${dirtyStages.join(", ")})`
    : `Approve (Stages ${visibleOkStages.join("+")})`;

  async function handlePrimary() {
    if (anyDirty) {
      // Override mode: dispatch the same window event the keyboard shortcut
      // fires. Stage widgets (stage-1-widget.tsx, client-shell.tsx for
      // stage-3/stage-4) listen for `bulk-review:override-submit` and invoke
      // the existing Phase 71/82 override pipeline (Inngest dispatch +
      // fireFeedback dual-write). A footer-level POST here would double-write
      // (W6 single-write contract).
      window.dispatchEvent(new Event(KEYBOARD_EVENTS.overrideSubmit));
      return;
    }
    // Approve mode: batch-confirm every ok stage. Nothing in stage-step
    // listens for a "confirm everything" signal — the per-stage fireFeedback
    // only fires on the override branch. The footer is the canonical writer.
    await Promise.all(
      visibleOkStages.map((n) =>
        fetch("/api/automations/debtor-email/feedback", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({
            email_id: row.id,
            stage: n,
            verdict: "confirm",
          }),
        }),
      ),
    );

    // Phase 82.6 (D-01) — also fire recordVerdict via the approvePrediction
    // wrapper so the row actually leaves the Stage 1 queue. The feedback
    // POSTs above are the Phase 82.4 learning substrate; without this
    // additional call, automation_runs.status never flips and the row
    // stays visible. Stage 1 only — the footer button is hidden on
    // Stages 0/2/3/4 (D-02b, see footer JSX below) so this code path is
    // only reachable when activeStage === 1.
    try {
      await approvePrediction({
        row_id: row.id,
        swarm_type: swarmType,
        decision: "approve",
      });
    } catch {
      // D-03: non-fatal silent recovery. Mirrors the override-flow precedent
      // at stage-1-widget.tsx:188-191. The feedback rows are durable; if
      // the status flip failed, the next realtime broadcast / server
      // roundtrip will reconcile. No toast — same as override path.
    }

    // D-04: Optimistic removal regardless of approvePrediction outcome.
    // selection-context.tsx auto-trims this set when the server's next
    // fetch omits the id (see selection-context.tsx:66-79), so a failed
    // recordVerdict that left the row present will naturally restore
    // visibility on the next refresh.
    //
    // Phase 82.7 Plan 04 (D-01) — auto-advance to the next visible row in
    // the operator's filtered list (active stage tab + mailbox + needs-action
    // filter). Compute `nextId` BEFORE mutating pendingRemovalIds so the
    // index reflects the list the operator is currently looking at. If the
    // approved row was the last (or somehow not in the visible list), fall
    // back to `null` — the detail pane will render the empty/idle state.
    // Silent UX (no toast) per Phase 82.6 D-03 precedent. Override-branch
    // path above (anyDirty===true) does NOT auto-advance — operator may
    // want to verify their override before moving on.
    const ids = visibleRowIds ?? [];
    const idx = ids.indexOf(row.id);
    const nextId =
      idx >= 0 && idx + 1 < ids.length ? ids[idx + 1] : null;
    markPendingRemovalAndAdvance(row.id, nextId);
  }

  // Mailbox header label — DB-derived map passed by the page (no hardcoded
  // ids). Falls back to "mailbox {id}" when the row's id isn't in the map.
  const mailboxLbl = (() => {
    if (row.mailbox_id === null) return "(no mailbox)";
    const lbl = mailboxLabels?.[row.mailbox_id];
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
        style={{ padding: "var(--space-4)" }}
        data-testid="pipeline-section"
      >
        <div
          data-testid={`stages-grid`}
          // Render 5 cells. Each cell becomes a <li> inside PipelineFlow's
          // <ol>. We attach the activeCellRef wrapper via the cell that
          // matches `activeStage` — see below.
        >
          <PipelineFlow
            stages={stagesData}
            onMarkDirty={onMarkDirty}
            onCancelDirty={onCancelDirty}
            onSubmitDirty={onSubmitDirty}
            futureRange={futureRange}
            futureExpanded={futureExpanded}
            onToggleFuture={() => setFutureExpanded((p) => !p)}
          />
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
          flexWrap: "wrap",
          gap: "var(--space-2)",
          position: "sticky",
          bottom: 0,
          background: "var(--v7-panel)",
          zIndex: 1,
        }}
        data-testid="action-footer"
      >
        {/* Phase 82.6 D-02b kept the batch-Approve button Stage-1-only because
            batch-approve is a Stage-1 concept (visible-ok stages → kanban
            status flip). Phase 82.7.3 H-01 deleted the inline per-stage Submit
            assuming the footer would cover overrides — but the footer's
            activeStage===1 guard hid Submit on Stage 0/2/3 too, leaving the
            'Note and override saved together' hint pointing at a nonexistent
            button. 2026-05-18 fix: show Submit on any stage with a dirty
            override (except Stage 4 read-only); keep Approve Stage-1-only. */}
        {activeStage !== 4 && (anyDirty || activeStage === 1) ? (
          <>
            <Button
              type="button"
              size="sm"
              onClick={handlePrimary}
              data-testid="detail-pane-primary"
              data-mode={anyDirty ? "override" : "approve"}
              style={{
                background: "var(--v7-lime)",
                color: "var(--v7-bg)",
                fontFamily: "var(--font-mono)",
              }}
            >
              <Check className="h-4 w-4 mr-1" aria-hidden="true" />
              {primaryLabel}
            </Button>
            {anyDirty && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={resetAllStageFeedback}
                data-testid="detail-pane-cancel-override"
              >
                <Undo2 className="h-4 w-4 mr-1" aria-hidden="true" />
                Cancel override
              </Button>
            )}
          </>
        ) : null}
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
