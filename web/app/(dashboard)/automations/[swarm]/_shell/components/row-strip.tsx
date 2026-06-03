"use client";

// Phase 2 Plan 02-01 — RowStrip (per-row 5-cell colored outcome strip).
//
// Pure presentation. Renders [sender · subject · 5-stage strip · timestamp]
// in the canonical sketch-001 / canonical-patterns §3 shape. Replaces the
// legacy single RowVerdictDot column for the Bulk Review surface.
//
// Hard-separation lock (RFC docs/agentic-pipeline/{stage-1-regex.md,
// stage-3-coordinator.md}): cell-state derivation reads ONLY the Stage 1
// noise-filter shape (predictor, matched_rule_id) for the Stage 1 cell and
// ONLY swarm_intents-derived ranked_intents for the Stage 3 cell. The two
// vocabularies NEVER cross — Stage 1 cell never reads stage_3, and vice
// versa. The hydrator already enforces this; the strip just renders.
//
// V7 tokens only — no raw hex. State vocabulary locked at
// safe/match/warn/llm-rescue/idle/blocked (canonical §3).

import type { ReactNode } from "react";
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { RerunPulseBadge } from "./rerun-pulse-badge";

export type CellState =
  | "safe"
  | "match"
  | "warn"
  | "llm-rescue"
  | "idle"
  | "blocked";

export interface RowStripProps {
  row: BulkReviewRow;
  mailboxLabel?: string | null;
  /** Right-edge ISO timestamp string; renderer formats it for display.
   *  Optional — when absent the timestamp column renders empty. */
  timestamp?: string | null;
  /** Optional sender for the left column. */
  senderLabel?: string | null;
  /** Optional subject for the middle column. */
  subjectLabel?: string | null;
  isSelected: boolean;
  onClick: () => void;
  /**
   * Phase 3 Plan 02 Task 1 — set of email_ids currently mid-re-run. When this
   * row's email_id is in the set, Stage 3 + Stage 4 cells overlay a 0.6s amber
   * pulse badge (P3-D-08). Optional — omitted on legacy per-stage routes that
   * don't mount the RerunContext.
   */
  rerunInFlightIds?: ReadonlySet<string>;
  /**
   * Phase 5 Plan 05-03 (D-06 / SC#2) — whether this row ran LIVE (dry_run=false).
   * When true, the strip renders the "Auto-applied" lime marker ("the system
   * already acted"). dry_run / unresolved rows (false / undefined) get NO
   * marker. Resolved by row-strip-list from dryRunByRow[email_label_id] ===
   * false (default true → not live). V7 tokens only.
   */
  isLive?: boolean;
  /**
   * Phase 5 Plan 05-03 (D-09) — History read-only browse posture. When true,
   * the row surfaces a "Corrigeer" affordance (amber). Clicking it calls
   * onClick (expands the row, revealing the SAME per-axis Decide controls used
   * in Queue, which call the existing override-actions verbatim). Default
   * false (Queue posture). History stays read-only by default; Corrigeer is
   * the one-click escape hatch, not a default-action surface.
   */
  correctionMode?: boolean;
}

// Plan 03 (live UAT 2026-05-28): the Live queue is, by construction, filtered
// to rows the operator must still act on, so a per-row "awaiting" marker on the
// Action cell is uniform (every queue row) and carries no signal — and it
// contradicts the Stage 4 pane ("nothing to decide") on dry-run rows where the
// handler never acts. Instead, the cells reflect AI CONFIDENCE: a low-confidence
// resolution (the AI guessed) presents as attention so the rows that actually
// need a human's eyes stand out from the confident-green majority. Below this
// floor a Stage 2 resolution is treated as "attention" (amber) rather than
// "match" (green). 0.7: a sender_map / identifier_match scores ~0.9 (stays
// green); an llm_tiebreaker scores ~0.4 (the AI had no decisive signal → amber).
const STAGE2_CONFIDENCE_FLOOR = 0.7;

/**
 * Pure derivation: given a BulkReviewRow and a stage index 0..4, return the
 * cell state vocabulary token. Co-located so tests can import + assert.
 */
export function deriveCellState(
  row: BulkReviewRow,
  stageIdx: 0 | 1 | 2 | 3 | 4,
): CellState {
  switch (stageIdx) {
    case 0: {
      // P2-D-03: null stage_0 (Phase 64 not shipped) defaults to safe.
      const s0 = row.stage_0;
      if (!s0) return "safe";
      if (s0.verdict === "safe") return "safe";
      if (s0.verdict === "injection_suspected") return "blocked";
      if (s0.verdict === "over_budget") return "warn";
      return "safe";
    }
    case 1: {
      const s1 = row.stage_1;
      if (!s1) return "idle";
      // Stage 1 vocabulary: swarm_noise_categories ONLY (hard-sep).
      if (s1.predictor === "llm_2nd_pass") return "llm-rescue";
      if (s1.matched_rule_id !== null) return "match";
      return "warn";
    }
    case 2: {
      const s2 = row.stage_2;
      if (!s2) return "idle";
      // Unresolved → attention.
      if (s2.resolver_source === null) return "warn";
      // Low-confidence resolution → attention: the AI guessed and the operator
      // should verify. An llm_tiebreaker means there was no decisive signal (it
      // weighs candidate customers and picks one), so it ALWAYS reads amber
      // regardless of the numeric confidence. Any other source below the floor
      // is likewise worth a second look. A high-confidence sender_map /
      // identifier_match stays "match" (green).
      if (s2.resolver_source === "llm_tiebreaker") return "warn";
      if (s2.confidence !== null && s2.confidence < STAGE2_CONFIDENCE_FLOOR)
        return "warn";
      return "match";
    }
    case 3: {
      const s3 = row.stage_3;
      if (!s3) return "idle";
      // Dispatcher escalation reads stage_3p5 (still Stage 3-side data —
      // hard-sep preserved; never reads stage_1).
      if (row.stage_3p5?.dispatcher_decision === "escalated") return "warn";
      if (s3.ranked_intents.length > 0) return "match";
      return "warn";
    }
    case 4: {
      const s4 = row.stage_4;
      if (!s4) return "idle";
      if (row.stage_3p5?.dispatcher_decision === "escalated") return "blocked";
      if (s4.handler_output_kind === "success") return "match";
      return "warn";
    }
  }
}

// Plan 03-19 (UAT r2/r3): operator outcome labels per stage (canonical §2).
// Each cell shows the stage NAME, not a bare 0-4 number, so operators read
// outcomes (the color carries the state; the label carries the stage).
const STAGE_OUTCOME_LABELS = [
  "Safety",
  "Noise",
  "Customer",
  "Topic",
  "Action",
] as const;

/**
 * Phase 5 Plan 05-02 D-10 — per-cell hover tooltip copy. Locked by UI-SPEC
 * § Copywriting. Operator language only: "AI" is allowed, "LLM" is jargon-
 * blocked (operator-language.md).
 *
 * Plan 03-19 (UAT r2/r3): made warn/blocked copy ACTIONABLE — it names the
 * stage AND what to do. Synchronous (feeds the native `title`) — no async.
 */
function tooltipFor(state: CellState, stageIdx: 0 | 1 | 2 | 3 | 4): string {
  const stage = STAGE_OUTCOME_LABELS[stageIdx];
  // Copy follows the human-color model (green=clear, orange=attention,
  // red=block, grey=idle). The "matched"/"AI recovered" nuance is dropped from
  // the operator-facing copy — both read as "all clear, nothing for you here".
  switch (humanColorFor(state)) {
    case "clear":
      return `${stage}: all clear — nothing needed from you`;
    case "attention":
      return `${stage}: something to check — open the row to take a look`;
    case "block":
      return `${stage} needs you — open the row to decide`;
    case "idle":
      return `${stage}: hasn't run yet`;
  }
}

// Plan 03-19 (UAT r3 operator feedback 2026-05-28): collapse the 6 derived
// states onto a 4-color HUMAN model — the operator reads colors as plain
// status, not pipeline internals:
//   green  = all clear / the step succeeded with NO human needed
//            (safe ∪ match ∪ llm-rescue — a blue "matched" or a purple "AI
//             rescued" both mean "done, nothing for you here")
//   orange = something is going on — worth a look (warn)
//   red    = a block — a human IS required here (blocked)
//   grey   = the step hasn't run yet (idle)
// deriveCellState stays untouched (the derivation lock); only the PRESENTATION
// folds the states into these four buckets.
type HumanColor = "clear" | "attention" | "block" | "idle";

function humanColorFor(state: CellState): HumanColor {
  switch (state) {
    case "safe":
    case "match":
    case "llm-rescue":
      return "clear";
    case "warn":
      return "attention";
    case "blocked":
      return "block";
    case "idle":
      return "idle";
  }
}

// Plan 06-03 (live UAT 2026-05-28) — per-row "what's expected" action cue.
// Resolves the recurring "what do I do with a green row?" confusion: every row
// now carries a single differentiated cue. The dry-run vs live split is the key
// — in dry-run the handler NEVER acted, so the cue says "review", not "an action
// happened". Pure derivation over the already-hydrated row + the isLive prop;
// co-located so tests can import + assert. Copy is operator-language compliant
// (operator-language.md): "AI" allowed; no "LLM"/"agent_runs"/"Kanban" jargon.
export function deriveActionCue(
  row: BulkReviewRow,
  isLive: boolean,
): { label: string; tone: HumanColor } {
  const colors = ([0, 1, 2, 3, 4] as const).map((i) =>
    humanColorFor(deriveCellState(row, i)),
  );
  if (colors.includes("block")) return { label: "Needs a decision", tone: "block" };
  if (colors.includes("attention"))
    return { label: "Check this one", tone: "attention" };
  return isLive
    ? { label: "Auto-applied — confirm or skip", tone: "clear" }
    : { label: "Review the AI's calls", tone: "clear" };
}

// Plan 06-03 — the CONTEXT-locked NARROW Stage-3 attention fold. An un-verified
// PREDICTED row's Topic cell folds to attention (orange) so the operator's eyes
// land on the one axis that needs a human verify. This is explicitly NOT the
// reverted uniform-orange-everywhere anti-pattern (see row-strip.tsx:69-79):
// only Stage 3, only for un-verified predicted dry-run rows; every OTHER cell
// stays confidence-driven via the untouched deriveCellState.
//
// Hard-separation lock (RFC stage-1-regex.md + stage-3-coordinator.md): the
// needs-verification signal derives ONLY from the Stage 3 slot + the row's
// verdict/decision posture (axis_1_human_verdict, stage_3p5) + isLive. It NEVER
// reads Stage 1 data (predictor / matched_rule_id / stage_1) into the Stage 3
// cell — the two vocabularies never cross.
function topicNeedsVerification(row: BulkReviewRow, isLive: boolean): boolean {
  return (
    row.stage_3 != null &&
    row.stage_3.ranked_intents.length > 0 &&
    row.overrides.axis_1_human_verdict == null &&
    row.stage_3p5?.dispatcher_decision !== "escalated" &&
    isLive !== true
  );
}

// Plan 06-03 — verify-oriented tooltip for the Topic cell when it folds to
// attention. Operator-language compliant ("AI" allowed; no "LLM"/jargon).
const TOPIC_VERIFY_TOOLTIP = "Topic: the AI picked this — open the row to verify";

function tokenBgFor(state: CellState): string {
  switch (humanColorFor(state)) {
    case "clear":
      return "var(--v7-state-safe-bg)";
    case "attention":
      return "var(--v7-state-warn-bg)";
    case "block":
      return "var(--v7-state-blocked-bg)";
    case "idle":
      return "var(--v7-state-idle-bg)";
  }
}

function tokenFgFor(state: CellState): string {
  switch (humanColorFor(state)) {
    case "clear":
      return "var(--v7-state-safe-fg)";
    case "attention":
      return "var(--v7-state-warn-fg)";
    case "block":
      return "var(--v7-state-blocked-fg)";
    case "idle":
      return "var(--v7-state-idle-fg)";
  }
}

// Plan 06-03 — HumanColor → V7 token (for the action-cue pill, which is keyed
// off the cue tone rather than a CellState). No raw hex.
function tokenBgForTone(tone: HumanColor): string {
  switch (tone) {
    case "clear":
      return "var(--v7-state-safe-bg)";
    case "attention":
      return "var(--v7-state-warn-bg)";
    case "block":
      return "var(--v7-state-blocked-bg)";
    case "idle":
      return "var(--v7-state-idle-bg)";
  }
}

function tokenFgForTone(tone: HumanColor): string {
  switch (tone) {
    case "clear":
      return "var(--v7-state-safe-fg)";
    case "attention":
      return "var(--v7-state-warn-fg)";
    case "block":
      return "var(--v7-state-blocked-fg)";
    case "idle":
      return "var(--v7-state-idle-fg)";
  }
}

function StageCell({
  state,
  stageIdx,
  rerunInFlight = false,
  titleOverride,
}: {
  state: CellState;
  stageIdx: 0 | 1 | 2 | 3 | 4;
  /** Phase 3 Plan 02 Task 1 — when true AND stageIdx ∈ {3,4}, overlay the
   *  amber pulse badge. P3-D-08. */
  rerunInFlight?: boolean;
  /** Plan 06-03 — when set, replaces the default per-state tooltip (used for
   *  the Topic-needs-verification verify-oriented copy). */
  titleOverride?: string;
}): ReactNode {
  const showPulse = rerunInFlight && (stageIdx === 3 || stageIdx === 4);
  const outcomeLabel = STAGE_OUTCOME_LABELS[stageIdx];
  return (
    <span
      data-testid={`row-strip-cell-${stageIdx}`}
      data-state={state}
      data-rerun-in-flight={showPulse ? "true" : undefined}
      aria-label={`${outcomeLabel} ${state}`}
      title={titleOverride ?? tooltipFor(state, stageIdx)}
      style={{
        position: "relative",
        minWidth: 56,
        height: 28,
        padding: "0 8px",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: tokenBgFor(state),
        color: tokenFgFor(state),
        fontFamily: "var(--font-sans)",
        fontSize: 10,
        fontWeight: 600,
        letterSpacing: "0.02em",
        borderRadius: 4,
        whiteSpace: "nowrap",
        // Plan 03-19: blocked cells get a ring so "needs you" reads at a glance.
        boxShadow:
          state === "blocked" ? "0 0 0 1px var(--v7-state-blocked-fg)" : undefined,
      }}
    >
      {outcomeLabel}
      {showPulse ? (
        <RerunPulseBadge testId={`row-strip-cell-${stageIdx}-pulse`} />
      ) : null}
    </span>
  );
}

export function RowStrip({
  row,
  mailboxLabel,
  timestamp,
  senderLabel,
  subjectLabel,
  isSelected,
  onClick,
  rerunInFlightIds,
  isLive,
  correctionMode = false,
}: RowStripProps) {
  const stages: ReadonlyArray<0 | 1 | 2 | 3 | 4> = [0, 1, 2, 3, 4];
  const isRerunning = rerunInFlightIds?.has(row.email_label_id) === true
    || (row.email_id !== null && rerunInFlightIds?.has(row.email_id) === true);
  // Plan 06-03 — the NARROW Stage-3 attention fold (un-verified predicted only)
  // and the per-row action cue both need the isLive posture (deriveCellState
  // has no isLive parameter, so the fold lives at this render layer).
  const live = isLive === true;
  const topicAttention = topicNeedsVerification(row, live);
  const cue = deriveActionCue(row, live);
  return (
    <div
      role="button"
      tabIndex={0}
      aria-selected={isSelected}
      data-testid="row-strip"
      data-row-id={row.email_label_id}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      style={{
        display: "grid",
        // Plan 03-19 (operator feedback): 4 real columns — sender · subject
        // (flexible) · the 5-cell strip (wide enough that all 5 cells sit on
        // ONE row, never wrapping) · timestamp. The strip track is sized to
        // the cells' intrinsic width via max-content so nothing wraps.
        gridTemplateColumns: "minmax(140px, 200px) minmax(180px, 1fr) max-content 150px",
        alignItems: "center",
        gap: "var(--space-3)",
        padding: isSelected
          ? "var(--space-2) var(--space-4) var(--space-2) calc(var(--space-4) - 2px)"
          : "var(--space-2) var(--space-4)",
        borderBottom: "1px solid var(--v7-border)",
        borderLeft: isSelected
          ? "2px solid var(--v7-brand-primary)"
          : "2px solid transparent",
        background: isSelected ? "var(--v7-bg-2)" : "transparent",
        cursor: "pointer",
      }}
    >
      <span
        data-testid="row-strip-sender"
        style={{
          fontSize: 13,
          color: "var(--v7-text)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          minWidth: 0,
          overflow: "hidden",
          whiteSpace: "nowrap",
        }}
      >
        {mailboxLabel ? (
          <span
            data-testid="row-strip-mailbox-chip"
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              padding: "1px 6px",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              background: "var(--v7-panel-2)",
              color: "var(--v7-text-muted)",
              border: "1px solid var(--v7-line)",
              borderRadius: "var(--v7-radius-pill)",
              lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}
          >
            {mailboxLabel}
          </span>
        ) : null}
        <span
          style={{
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            minWidth: 0,
          }}
        >
          {senderLabel ?? "(unknown sender)"}
        </span>
        {/* Phase 5 Plan 05-03 (D-06 / SC#2) — "Auto-applied" lime marker on
            live rows only ("the system already acted"). dry_run / unresolved
            rows render no marker. V7 tokens only. */}
        {isLive ? (
          <span
            data-testid="row-strip-auto-applied"
            style={{
              flexShrink: 0,
              display: "inline-flex",
              alignItems: "center",
              padding: "1px 6px",
              fontSize: 10,
              fontFamily: "var(--font-mono)",
              background: "var(--v7-lime-soft, var(--v7-bg-2))",
              color: "var(--v7-lime)",
              border: "1px solid var(--v7-lime)",
              borderRadius: "var(--v7-radius-pill)",
              lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}
          >
            Auto-applied
          </span>
        ) : null}
      </span>
      {/* Plan 03-19 (UAT r2/r3): render the FULL subject — wrap within the
          column instead of a single-line ellipsis truncation. No raw id ever
          surfaces here; the null fallback is "(no subject)" text. */}
      {/* Plan 06-03 — subject column also hosts the per-row action cue pill
          (inline, BELOW the subject text). It does NOT add a grid column or
          shift the 5-cell strip; the 4-column template is untouched. */}
      <span
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 4,
          minWidth: 0,
        }}
      >
        <span
          data-testid="row-strip-subject"
          style={{
            fontSize: 13,
            color: "var(--v7-text)",
            whiteSpace: "normal",
            overflowWrap: "anywhere",
            minWidth: 0,
            lineHeight: 1.35,
          }}
        >
          {subjectLabel ?? "(no subject)"}
        </span>
        <span
          data-testid="row-strip-action-cue"
          data-tone={cue.tone}
          style={{
            alignSelf: "flex-start",
            display: "inline-flex",
            alignItems: "center",
            padding: "1px 8px",
            fontSize: 10,
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            letterSpacing: "0.02em",
            background: tokenBgForTone(cue.tone),
            color: tokenFgForTone(cue.tone),
            border: `1px solid ${tokenFgForTone(cue.tone)}`,
            borderRadius: "var(--v7-radius-pill)",
            lineHeight: 1.4,
            whiteSpace: "nowrap",
          }}
        >
          {cue.label}
        </span>
      </span>
      <span
        data-testid="row-strip-strip"
        style={{
          display: "inline-flex",
          gap: 4,
          alignItems: "center",
          justifySelf: "end",
          flexWrap: "nowrap",
        }}
      >
        {stages.map((idx) => {
          // Plan 06-03 — ONLY the Topic (Stage 3) cell folds to attention for
          // un-verified predicted rows; cases 0/1/2/4 stay confidence-driven.
          const foldTopic = idx === 3 && topicAttention;
          return (
            <StageCell
              key={idx}
              stageIdx={idx}
              state={foldTopic ? "warn" : deriveCellState(row, idx)}
              rerunInFlight={isRerunning}
              titleOverride={foldTopic ? TOPIC_VERIFY_TOOLTIP : undefined}
            />
          );
        })}
      </span>
      <span
        data-testid="row-strip-timestamp"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "flex-end",
          gap: "var(--space-2)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--v7-text-muted)",
          whiteSpace: "nowrap",
          textAlign: "right",
        }}
      >
        {timestamp ? new Date(timestamp).toLocaleString("en-GB") : ""}
        {/* Phase 5 Plan 05-03 (D-09) — History "Corrigeer" escape hatch (amber).
            Clicking it expands the row (onClick), opening the same per-axis
            Decide controls the Queue uses; corrections flow through the
            existing override-actions verbatim. Read-only stays the default. */}
        {correctionMode ? (
          <button
            type="button"
            data-testid="row-strip-corrigeer"
            onClick={(e) => {
              e.stopPropagation();
              onClick();
            }}
            style={{
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              padding: "2px 8px",
              background: "var(--v7-amber-soft)",
              color: "var(--v7-amber)",
              border: "1px solid var(--v7-amber)",
              borderRadius: "var(--v7-radius-pill)",
              cursor: "pointer",
              whiteSpace: "nowrap",
            }}
          >
            Corrigeer
          </button>
        ) : null}
      </span>
    </div>
  );
}
