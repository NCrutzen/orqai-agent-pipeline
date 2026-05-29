"use client";

// Phase 2 Plan 02-01 — InlineExpandRow (the canonical per-row 2-col body).
//
// Sketch 002 + canonical-patterns §4 lock the container shape: stage tab
// strip → 2-col Read/Decide body → footer affordance line. Stage content
// slots are render-props so Wave 2 plans (Stage 0/1/2/3 detail columns)
// inject their content without touching this container.
//
// Window-event bridge: registers the canonical bulk-review:* listeners so
// keyboard-shortcuts.tsx keeps working. Eval-type-* listeners are
// intentionally NOT registered (sketch 003 lock — the eval-type radio
// is removed from operator UI). Phase 3 axis-2/3 override event listeners (override-
// submit / override-discard) are wired as no-op forwarders so Phase 3 can
// attach without container changes.
//
// Hard-separation lock: this container is presentation-only. It reads
// row.stage_2?.entity_brand for the header badge (already validated
// against swarms.entity_brand registry by the hydrator) and forwards
// stage-N slot data through to the per-stage Read/Decide content props.
// It never reads swarm_noise_categories or swarm_intents directly; the
// hard separation is preserved by Phase 1's hydrator and the Stage 1 /
// Stage 3 Read column components built in Wave 2.
//
// Also reuses the canonical stage-tab-strip semantics (label vocabulary
// from derive-stage-tabs.ts) — see comment in deriveLocalTabs below.

import { useState, type ReactNode } from "react";
import type { BulkReviewRow } from "@/lib/bulk-review/types";
import { deriveCellState } from "./row-strip";
import { kanbanUrlFor } from "@/lib/bulk-review/routes";
// Phase 5 Plan 05-01 Task 2 (D-02, RESEARCH Pitfall 1) — the /review detail
// stack is THIS container, NOT the stage-1 unified pane. EmailBodyBlock
// (Phase 04.1) mounts HERE so /review shows the email body + the "View full
// thread" launcher. Real projected conversation_id/message_count activate the
// thread button (gated in email-body-block.tsx:81-84). The /review stack stays
// on InlineExpandRow (sketch 002 Variant C) — the legacy stage-1 pane is never
// pulled into this NEW code (anti-drift #4).
import { EmailBodyBlock } from "./email-body-block";
// stage-tab-strip reuse marker — this container mirrors the StageTabStrip
// visual language locally because StageTabStrip itself is a routed nav
// component (renders <Link>); the inline-expand needs local active-state
// switching, not navigation. Tab labels match the canonical vocabulary
// from derive-stage-tabs.ts.

export interface InlineExpandRowProps {
  row: BulkReviewRow;
  /** Wave 2 plans pass these in; container renders empty/placeholder if missing. */
  stage0Content?: { read: ReactNode; decide: ReactNode };
  stage1Content?: { read: ReactNode; decide: ReactNode };
  stage2Content?: { read: ReactNode; decide?: ReactNode };
  stage3Content?: { read: ReactNode; decide?: ReactNode };
  stage4Content?: { read: ReactNode; decide?: ReactNode };
  /**
   * Phase 3 Plan 02 Task 1 — when true, Stage 3 + Stage 4 tabs become
   * non-interactive (50% opacity, pointer-events: none, aria-disabled). The
   * row's RowStrip cells separately render a pulse badge. P3-D-08.
   */
  rerunInFlight?: boolean;
  /**
   * Phase 5 Plan 05-01 Task 2 (D-02) — projected email fields for the
   * EmailBodyBlock mount. All optional; absent → body block renders its own
   * empty states and the thread button is gated off. Sourced from
   * loadReviewPageData maps threaded through RowStripList.
   */
  bodyText?: string | null;
  conversationId?: string | null;
  messageCount?: number | null;
  swarmType?: string;
}

type StageIdx = 0 | 1 | 2 | 3 | 4;

const TAB_LABELS: Readonly<Record<StageIdx, string>> = {
  0: "Stage 0 · Safety",
  1: "Stage 1 · Noise",
  2: "Stage 2 · Customer",
  3: "Stage 3 · Intent",
  4: "Stage 4 · Handler",
};

/** Pick the default active stage: first stage in 'blocked' or 'warn' state,
 *  else Stage 1. Mirrors UI-SPEC §2 mental model.
 *
 *  Plan 03 (live UAT 2026-05-28): with Stage 2 now reading 'warn' (amber) for
 *  low-confidence / AI-tiebreaker resolutions, this loop already lands the
 *  operator on the first uncertain stage — the rows that actually need review. */
function pickDefaultActive(row: BulkReviewRow): StageIdx {
  for (const idx of [0, 1, 2, 3, 4] as StageIdx[]) {
    const s = deriveCellState(row, idx);
    if (s === "blocked" || s === "warn") return idx;
  }
  return 1;
}

export function InlineExpandRow({
  row,
  stage0Content,
  stage1Content,
  stage2Content,
  stage3Content,
  stage4Content,
  rerunInFlight = false,
  bodyText,
  conversationId,
  messageCount,
  swarmType,
}: InlineExpandRowProps) {
  const [activeStage, setActiveStage] = useState<StageIdx>(() =>
    pickDefaultActive(row),
  );

  // Window-event bridge: the canonical `bulk-review:*` action handlers now
  // live in the per-stage Decide columns (stage-N-widget.tsx listens for
  // override-submit / override-discard / eval-type-*) and the EmailBodyBlock
  // owns `bulk-review:toggle-body` (email-body-block.tsx). This container
  // therefore registers NO listeners — the former no-op approve/reject/skip/
  // toggle-body forwarders were dead and have been removed (IN-03 / IN-05).

  const brand = row.stage_2?.entity_brand ?? null;
  const stages: ReadonlyArray<StageIdx> = [0, 1, 2, 3, 4];

  const contentFor = (
    idx: StageIdx,
  ): { read: ReactNode; decide: ReactNode } => {
    const map = {
      0: stage0Content,
      1: stage1Content,
      2: stage2Content,
      3: stage3Content,
      4: stage4Content,
    } as const;
    const c = map[idx];
    const read = c?.read ?? (
      <div
        data-testid={`empty-read-${idx}`}
        style={{
          fontSize: 12,
          color: "var(--v7-text-muted)",
          fontStyle: "italic",
        }}
      >
        Stage {idx} read column ships in Plan 02-{String(idx + 2).padStart(2, "0")}
      </div>
    );
    // All five Decide columns are now wired via row-strip-list.tsx; the
    // fallback only renders for fixture rows that omit a Decide slot.
    const decide = c?.decide ?? (
      <div
        data-testid={`empty-decide-${idx}`}
        style={{
          fontSize: 12,
          color: "var(--v7-text-muted)",
          fontStyle: "italic",
        }}
      >
        Stage {idx} decide column ships in a later Plan
      </div>
    );
    return { read, decide };
  };

  const active = contentFor(activeStage);

  return (
    <div
      data-testid="inline-expand-row"
      data-row-id={row.email_label_id}
      data-active-stage={activeStage}
      style={{
        background: "var(--v7-bg-2)",
        borderBottom: "1px solid var(--v7-border)",
      }}
    >
      {/* Header: row metadata left + brand badge right */}
      <div
        data-testid="inline-expand-header"
        style={{
          display: "flex",
          alignItems: "center",
          padding: "var(--space-2) var(--space-4)",
          borderBottom: "1px solid var(--v7-border)",
          gap: "var(--space-3)",
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontFamily: "var(--font-mono)",
            color: "var(--v7-text-muted)",
          }}
        >
          {row.email_label_id.slice(0, 8)}
        </span>
        <span style={{ flex: 1 }} />
        {/* Phase 2 Plan 02-06 — S14 cross-surface nav button. Uses a real
            <a href> so the browser preserves history and the back-button
            returns the operator to Bulk Review with ?bulk_review_focus=
            still pointing at this row (auto-expand via useSelection()).
            kanbanUrlFor() strict-validates email_label_id as a UUID and
            swarm_type against the registry pattern; if either is missing
            or malformed (defensive — should never occur on real rows but
            covers fixture rows in tests) the link is silently omitted. */}
        {(() => {
          // Compute the (throwing) href inside try/catch, but construct the JSX
          // OUTSIDE it — react-hooks/error-boundaries: JSX built within try/catch
          // isn't covered by the catch (render errors escape it).
          let kanbanHref: string | null = null;
          try {
            kanbanHref = kanbanUrlFor({
              email_label_id: row.email_label_id,
              swarm_type: row.swarm_type,
            });
          } catch {
            kanbanHref = null;
          }
          if (!kanbanHref) return null;
          return (
            <a
              data-testid="open-in-kanban-link"
              href={kanbanHref}
              style={{
                fontSize: 12,
                fontFamily: "var(--font-mono)",
                color: "var(--v7-text-muted)",
                textDecoration: "none",
                padding: "2px 8px",
                borderRadius: "var(--v7-radius-pill)",
                border: "1px solid var(--v7-line)",
                whiteSpace: "nowrap",
              }}
            >
              ↗ Open in Kanban
            </a>
          );
        })()}
        {brand ? (
          <span
            data-testid="inline-expand-brand-badge"
            data-brand={brand}
            style={{
              display: "inline-flex",
              alignItems: "center",
              padding: "2px 10px",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
              background: "var(--v7-brand-secondary-soft)",
              color: "var(--v7-brand-secondary)",
              borderRadius: "var(--v7-radius-pill)",
              lineHeight: 1.4,
              whiteSpace: "nowrap",
            }}
          >
            {brand}
          </span>
        ) : null}
      </div>

      {/* Stage tab strip — local presentation mirroring the canonical
          stage-tab-strip vocabulary (file: ../stage-tab-strip.tsx). The
          routed StageTabStrip component is unsuitable here because it
          renders <Link> for navigation; this container needs local active-
          state switching. */}
      <nav
        data-testid="inline-expand-stage-tab-strip"
        role="tablist"
        aria-label="Inline-expand stage tabs"
        style={{
          display: "flex",
          gap: "var(--space-2)",
          padding: "var(--space-2) var(--space-4)",
          borderBottom: "1px solid var(--v7-border)",
        }}
      >
        {stages.map((idx) => {
          const isActive = idx === activeStage;
          // Phase 3 Plan 02 Task 1 — when a re-run is in flight, Stage 3 + 4
          // tabs go non-interactive (P3-D-08). Stages 0/1/2 remain
          // interactive so the operator can still inspect/edit the upstream
          // surfaces while waiting.
          const isRerunDisabled = rerunInFlight && (idx === 3 || idx === 4);
          return (
            <button
              key={idx}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={isRerunDisabled ? "true" : undefined}
              data-testid={`inline-expand-tab-${idx}`}
              data-rerun-disabled={isRerunDisabled ? "true" : undefined}
              onClick={() => {
                if (isRerunDisabled) return;
                setActiveStage(idx);
              }}
              style={{
                fontSize: 13,
                fontWeight: isActive ? 500 : 400,
                padding: "var(--space-2) var(--space-3)",
                color: isActive ? "var(--v7-text)" : "var(--v7-text-muted)",
                background: "transparent",
                cursor: isRerunDisabled ? "not-allowed" : "pointer",
                // Longhand-only borders (GAP 3): mixing a `border`/`borderBottom`
                // shorthand with the borderBottom* longhands below triggers
                // React's "Don't mix shorthand and non-shorthand" warning. Zero
                // the non-bottom edges per-edge; the bottom edge draws the tab
                // underline.
                borderTopWidth: 0,
                borderLeftWidth: 0,
                borderRightWidth: 0,
                borderBottomWidth: 2,
                borderBottomStyle: "solid",
                borderBottomColor: isActive
                  ? "var(--v7-brand-primary)"
                  : "transparent",
                opacity: isRerunDisabled ? 0.5 : 1,
                pointerEvents: isRerunDisabled ? "none" : "auto",
              }}
            >
              {TAB_LABELS[idx]}
            </button>
          );
        })}
      </nav>

      {/* Phase 5 Plan 05-01 Task 2 (D-02) — email body + thread launcher.
          Mounted above the 2-col body so the operator sees the raw message
          before deciding. Real projected conversation_id/message_count
          activate the "View full thread" button (gate in email-body-block).
          active_stage_border_token reuses the local activeStage state. */}
      <EmailBodyBlock
        email_id={row.email_id ?? ""}
        conversation_id={conversationId ?? null}
        message_count={messageCount ?? null}
        swarm_type={swarmType ?? row.swarm_type}
        body_text={bodyText ?? null}
        active_stage_border_token={`var(--v7-stage-${activeStage}-accent)`}
      />

      {/* 2-col body: Read (left, always visible) + Decide (right) */}
      <div
        data-testid="inline-expand-body"
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          minHeight: 380,
        }}
      >
        <div
          data-testid="inline-expand-read-col"
          style={{
            borderRight: "1px solid var(--v7-border)",
            background: "var(--v7-bg-2)",
            padding: "var(--space-4)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--v7-text-muted)",
              marginBottom: "var(--space-2)",
            }}
          >
            Read · how the system decided
          </div>
          {active.read}
        </div>
        <div
          data-testid="inline-expand-decide-col"
          style={{
            background: "var(--v7-bg)",
            padding: "var(--space-4)",
          }}
        >
          <div
            style={{
              fontSize: 10,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              color: "var(--v7-text-muted)",
              marginBottom: "var(--space-2)",
            }}
          >
            Decide · your verdict
          </div>
          {active.decide}
        </div>
      </div>

      {/* Footer affordance line — UI-SPEC §1 S4 locked vocabulary. */}
      <div
        data-testid="inline-expand-footer"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-4)",
          padding: "var(--space-2) var(--space-4)",
          borderTop: "1px solid var(--v7-border)",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          color: "var(--v7-text-muted)",
        }}
      >
        <span>⏎ Confirm rule</span>
        <span>J / K next-prev</span>
        <span>Esc collapse</span>
        <span>N skip</span>
      </div>
    </div>
  );
}
