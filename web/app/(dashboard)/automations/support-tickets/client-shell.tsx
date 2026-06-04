"use client";

// Phase 5 Plan 04 — support-tickets submissions client shell (ADMIN-01).
//
// Read-only operator surface (T-05-04-02 mitigated): NO edit / delete / save /
// create affordance. RTL asserts absence of those controls.
//
// Columns: User type, Submitter, Submitted, Proposed intent, Final intent,
//   Δ (override-delta badge), Proposed system, Final system, Status,
//   Time-to-resolve.
//
// Filters: system / intent / status — server-side via searchParams, driven
// by useRouter.push (mirrors [swarm]/intent-proposals onFilterChange).

import { useRouter } from "next/navigation";
import {
  computeOverrideDelta,
  type SubmissionRow,
} from "./_lib/load-submissions";

// ── Canonical vocabulary ───────────────────────────────────────────────────

// Mirrors the 5 swarm_intents.intent_key values seeded in Phase 1 migration (K).
const INTENT_OPTIONS = [
  "clarification-needed",
  "duplicate",
  "info-answer",
  "clickup-escalate",
  "vendor-draft",
] as const;

// Canonical outbound statuses from clickup-status-map.ts (Plan 05-01).
const STATUS_OPTIONS = ["assigned", "in-progress", "resolved", "closed"] as const;

// ── Component ─────────────────────────────────────────────────────────────

interface Props {
  rows: SubmissionRow[];
  activeSystem: string;
  activeIntent: string;
  activeStatus: string;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function SupportTicketsClientShell({
  rows,
  activeSystem,
  activeIntent,
  activeStatus,
}: Props) {
  const router = useRouter();

  // Derive system options from the rows that are present (plus the active
  // filter value so the current selection is always visible).
  const systemsInRows = Array.from(
    new Set(
      rows
        .flatMap((r) => [r.proposed_system, r.final_system])
        .filter((s): s is string => s !== null && s !== ""),
    ),
  ).sort();
  const systemOptions = Array.from(
    new Set([...(activeSystem ? [activeSystem] : []), ...systemsInRows]),
  );

  function onFilterChange(key: "system" | "intent" | "status", value: string) {
    const params = new URLSearchParams();
    if (key !== "system" && activeSystem) params.set("system", activeSystem);
    if (key !== "intent" && activeIntent) params.set("intent", activeIntent);
    if (key !== "status" && activeStatus) params.set("status", activeStatus);
    if (value) params.set(key, value);
    const qs = params.toString();
    router.push(`/automations/support-tickets${qs ? `?${qs}` : ""}`);
  }

  return (
    <section
      style={{
        padding: "var(--space-4) var(--space-5)",
        background: "var(--v7-bg-1)",
        color: "var(--v7-text)",
      }}
    >
      {/* Header */}
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          marginBottom: "var(--space-4)",
          flexWrap: "wrap",
        }}
      >
        <h2
          style={{
            fontSize: "16px",
            fontWeight: 500,
            margin: 0,
            color: "var(--v7-text)",
          }}
        >
          Support tickets — AI vs human outcomes
        </h2>
        <span
          style={{
            fontSize: "12px",
            color: "var(--v7-text-muted)",
          }}
        >
          Read-only. {rows.length} row{rows.length !== 1 ? "s" : ""}.
        </span>

        {/* Filters */}
        <div
          style={{
            marginLeft: "auto",
            display: "flex",
            gap: "var(--space-3)",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          {/* System filter */}
          <label
            style={{
              fontSize: "12px",
              color: "var(--v7-text-muted)",
              display: "inline-flex",
              gap: "var(--space-2)",
              alignItems: "center",
            }}
          >
            System:
            <select
              aria-label="Filter by system"
              value={activeSystem}
              onChange={(e) => onFilterChange("system", e.target.value)}
              style={{
                fontSize: "12px",
                background: "var(--v7-bg-2)",
                color: "var(--v7-text)",
                border: "1px solid var(--v7-border)",
                padding: "var(--space-1) var(--space-2)",
                borderRadius: "4px",
              }}
            >
              <option value="">(any)</option>
              {systemOptions.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {/* Intent filter */}
          <label
            style={{
              fontSize: "12px",
              color: "var(--v7-text-muted)",
              display: "inline-flex",
              gap: "var(--space-2)",
              alignItems: "center",
            }}
          >
            Intent:
            <select
              aria-label="Filter by intent"
              value={activeIntent}
              onChange={(e) => onFilterChange("intent", e.target.value)}
              style={{
                fontSize: "12px",
                background: "var(--v7-bg-2)",
                color: "var(--v7-text)",
                border: "1px solid var(--v7-border)",
                padding: "var(--space-1) var(--space-2)",
                borderRadius: "4px",
              }}
            >
              <option value="">(any)</option>
              {INTENT_OPTIONS.map((i) => (
                <option key={i} value={i}>
                  {i}
                </option>
              ))}
            </select>
          </label>

          {/* Status filter */}
          <label
            style={{
              fontSize: "12px",
              color: "var(--v7-text-muted)",
              display: "inline-flex",
              gap: "var(--space-2)",
              alignItems: "center",
            }}
          >
            Status:
            <select
              aria-label="Filter by status"
              value={activeStatus}
              onChange={(e) => onFilterChange("status", e.target.value)}
              style={{
                fontSize: "12px",
                background: "var(--v7-bg-2)",
                color: "var(--v7-text)",
                border: "1px solid var(--v7-border)",
                padding: "var(--space-1) var(--space-2)",
                borderRadius: "4px",
              }}
            >
              <option value="">(any)</option>
              {STATUS_OPTIONS.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {/* Table or empty state */}
      {rows.length === 0 ? (
        <div style={{ padding: "var(--space-6) var(--space-4)" }}>
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 500,
              margin: 0,
              color: "var(--v7-text)",
            }}
          >
            No submissions found
          </h3>
          <p
            style={{
              fontSize: "13px",
              color: "var(--v7-text-muted)",
              marginTop: "var(--space-2)",
            }}
          >
            Try adjusting your filters or wait for the pipeline to process new
            tickets.
          </p>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: "12px",
              color: "var(--v7-text)",
            }}
          >
            <thead>
              <tr
                style={{
                  borderBottom: "1px solid var(--v7-border)",
                  textAlign: "left",
                }}
              >
                {[
                  "User type",
                  "Submitter",
                  "Submitted",
                  "Proposed intent",
                  "Final intent",
                  "Δ",
                  "Proposed system",
                  "Final system",
                  "Status",
                  "Time-to-resolve",
                ].map((col) => (
                  <th
                    key={col}
                    style={{
                      padding: "var(--space-2) var(--space-3)",
                      fontWeight: 500,
                      color: "var(--v7-text-muted)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => {
                const delta = computeOverrideDelta(row);
                const anyChanged =
                  delta.intent.changed ||
                  delta.system.changed ||
                  delta.assignee.changed;
                const ai = row.ai_thinking;

                const mainRow = (
                  <tr
                    key={`${row.id}-main`}
                    style={{
                      borderBottom: ai ? "none" : "1px solid var(--v7-border)",
                      background: anyChanged
                        ? "color-mix(in srgb, var(--v7-brand-primary-soft) 20%, transparent)"
                        : "transparent",
                    }}
                  >
                    {/* User type */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.user_chosen_type}
                    </td>

                    {/* Submitter */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        maxWidth: "160px",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.submitter_id}
                    </td>

                    {/* Submitted */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        whiteSpace: "nowrap",
                        color: "var(--v7-text-muted)",
                      }}
                    >
                      {formatDate(row.submitted_at)}
                    </td>

                    {/* Proposed intent */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--v7-text-muted)",
                      }}
                    >
                      {row.proposed_intent ?? "—"}
                    </td>

                    {/* Final intent */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                      }}
                    >
                      {row.final_intent ?? "—"}
                    </td>

                    {/* Override-delta badge (Δ) */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        textAlign: "center",
                      }}
                    >
                      {delta.intent.changed ? (
                        <span
                          aria-label="intent overridden"
                          title={`Proposed: ${delta.intent.proposed ?? "—"} → Final: ${delta.intent.final}`}
                          style={{
                            display: "inline-block",
                            background: "var(--v7-brand-primary)",
                            color: "#fff",
                            borderRadius: "4px",
                            fontSize: "10px",
                            padding: "1px 5px",
                            fontWeight: 600,
                            letterSpacing: "0.04em",
                          }}
                          data-testid="override-delta-badge"
                        >
                          Δ
                        </span>
                      ) : null}
                    </td>

                    {/* Proposed system */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                        color: "var(--v7-text-muted)",
                      }}
                    >
                      {row.proposed_system ?? "—"}
                    </td>

                    {/* Final system */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "11px",
                      }}
                    >
                      {row.final_system ?? "—"}
                    </td>

                    {/* Status */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {row.clickup_status ?? "—"}
                    </td>

                    {/* Time-to-resolve */}
                    <td
                      style={{
                        padding: "var(--space-2) var(--space-3)",
                        textAlign: "right",
                        whiteSpace: "nowrap",
                        color:
                          row.time_to_resolve_minutes === null
                            ? "var(--v7-text-muted)"
                            : "var(--v7-text)",
                      }}
                    >
                      {row.time_to_resolve_minutes === null
                        ? "—"
                        : `${row.time_to_resolve_minutes} min`}
                    </td>
                  </tr>
                );
                const aiRow = (
                  <tr
                    key={`${row.id}-ai`}
                    style={{ borderBottom: "1px solid var(--v7-border)" }}
                  >
                    <td
                      colSpan={10}
                      style={{
                        padding: "4px var(--space-3) 6px",
                        fontSize: "11px",
                        color: "var(--v7-text-muted)",
                        background: "var(--v7-bg-1)",
                      }}
                    >
                      {ai === null ? (
                        <span style={{ fontStyle: "italic" }}>
                          Geen Stage-3 denkwerk vastgelegd.
                        </span>
                      ) : (
                        <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 8px", alignItems: "flex-start" }}>
                          <span style={{ fontWeight: 600, marginRight: 4 }}>{"🧠 AI-denkwerk"}</span>
                          {ai.reasoning && (
                            <span style={{ flex: "1 1 100%", color: "var(--v7-text)", marginBottom: 2 }}>
                              {ai.reasoning}
                            </span>
                          )}
                          <span style={{ background: "var(--v7-bg-2)", borderRadius: 3, padding: "1px 5px", border: "1px solid var(--v7-border)" }}>
                            {`compleet: ${ai.completeness_verdict_raw ?? "—"}→${ai.effective_verdict ?? "—"}`}
                          </span>
                          <span style={{ background: "var(--v7-bg-2)", borderRadius: 3, padding: "1px 5px", border: "1px solid var(--v7-border)" }}>
                            {`intent: ${ai.chosen_intent_raw ?? "—"}→${ai.effective_intent ?? "—"}`}
                          </span>
                          <span style={{ background: "var(--v7-bg-2)", borderRadius: 3, padding: "1px 5px", border: "1px solid var(--v7-border)" }}>
                            {`vertrouwen: ${ai.confidence_raw ?? "—"}`}
                          </span>
                          {ai.missing_information && ai.missing_information.length > 0 && (
                            <span style={{ background: "var(--v7-bg-2)", borderRadius: 3, padding: "1px 5px", border: "1px solid var(--v7-border)" }}>
                              {`ontbrekend: ${ai.missing_information.join("; ")}`}
                            </span>
                          )}
                          {ai.override_reason && (
                            <span style={{ background: "var(--v7-bg-2)", borderRadius: 3, padding: "1px 5px", border: "1px solid var(--v7-border)" }}>
                              {`override: ${ai.override_reason}`}
                            </span>
                          )}
                          {ai.model_used && (
                            <span style={{ background: "var(--v7-bg-2)", borderRadius: 3, padding: "1px 5px", border: "1px solid var(--v7-border)" }}>
                              {`model: ${ai.model_used}`}
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
                return [mainRow, aiRow];
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
