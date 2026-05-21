"use client";

// Phase 86 Plan 03 — Intent Proposals client shell (read-only).
//
// Renders one card per cluster row (expandable <details> for sample emails),
// the cross-swarm filter (when >1 swarm has clusters), and the manual
// refresh button (debounced 5s client-side, 5min server-side via the Plan 02
// cron).
//
// Read-only surface (D-04): NO promote / approve / dismiss buttons. The
// V9.0 Learning Inbox will own promotion to swarm_intents. This UI never
// writes swarm_intents and never reads swarm_noise_categories.
//
// On mount: useEffect fires logTabView() to record the page open in
// intent_proposal_views. Errors are swallowed (best-effort telemetry) so
// the surface still renders if the telemetry path is broken.

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { ClusterRow } from "@/lib/automations/intent-proposals/types";
import { logTabView, triggerRefresh } from "./actions";

interface Props {
  swarmType: string;
  filter: "current" | "all";
  clusters: ClusterRow[];
  crossSwarmDropdownVisible: boolean;
}

const EMPTY_STATE = {
  title: "No novel intent proposals yet",
  body:
    "The classifier flags emails that don't fit existing intents. Wait for the first week of live traffic.",
} as const;

export function IntentProposalsClientShell({
  swarmType,
  filter,
  clusters,
  crossSwarmDropdownVisible,
}: Props) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [refreshDisabled, setRefreshDisabled] = useState(false);
  const [refreshMessage, setRefreshMessage] = useState<string | null>(null);

  // Mount-only telemetry insert. Telemetry is best-effort: failures are
  // logged but never propagate to the operator.
  useEffect(() => {
    logTabView({
      swarm_type: filter === "all" ? null : swarmType,
      cluster_id: null,
    }).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("logTabView failed (telemetry best-effort):", err);
    });
    // Intentionally one-shot on mount; deps frozen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onFilterChange = (next: "current" | "all") => {
    const params = new URLSearchParams();
    if (next === "all") params.set("swarm_filter", "all");
    const qs = params.toString();
    router.push(
      `/automations/${swarmType}/intent-proposals${qs ? `?${qs}` : ""}`,
    );
  };

  const onRefresh = () => {
    if (refreshDisabled) return;
    setRefreshDisabled(true);
    setRefreshMessage("Refreshing…");
    startTransition(async () => {
      try {
        await triggerRefresh();
        setRefreshMessage(
          "Refresh queued. New clusters appear after the next cron tick.",
        );
      } catch (err) {
        setRefreshMessage(
          `Refresh failed: ${err instanceof Error ? err.message : "unknown error"}`,
        );
      } finally {
        // Server-side debounce is 5min; client-side hold is 5s purely to
        // prevent double-click spam.
        window.setTimeout(() => {
          setRefreshDisabled(false);
        }, 5000);
      }
    });
  };

  return (
    <section
      style={{
        padding: "var(--space-4) var(--space-5)",
        background: "var(--v7-bg-1)",
        color: "var(--v7-text)",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: "var(--space-3)",
          marginBottom: "var(--space-4)",
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
          Intent proposals
        </h2>
        <span
          style={{
            fontSize: "12px",
            color: "var(--v7-text-muted)",
          }}
        >
          Read-only. Clusters of novel intents flagged by the Stage 3
          classifier. Promotion to handlers lands in V9.0.
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: "var(--space-3)", alignItems: "center" }}>
          {crossSwarmDropdownVisible ? (
            <label
              style={{
                fontSize: "12px",
                color: "var(--v7-text-muted)",
                display: "inline-flex",
                gap: "var(--space-2)",
                alignItems: "center",
              }}
            >
              Scope:
              <select
                aria-label="Cross-swarm filter"
                value={filter}
                onChange={(e) =>
                  onFilterChange(e.target.value as "current" | "all")
                }
                style={{
                  fontSize: "12px",
                  background: "var(--v7-bg-2)",
                  color: "var(--v7-text)",
                  border: "1px solid var(--v7-border)",
                  padding: "var(--space-1) var(--space-2)",
                  borderRadius: "4px",
                }}
              >
                <option value="current">Current swarm</option>
                <option value="all">All swarms</option>
              </select>
            </label>
          ) : null}
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshDisabled}
            aria-label="Refresh clusters"
            style={{
              fontSize: "12px",
              padding: "var(--space-1) var(--space-3)",
              background: refreshDisabled
                ? "var(--v7-bg-2)"
                : "var(--v7-brand-primary-soft)",
              color: refreshDisabled
                ? "var(--v7-text-muted)"
                : "var(--v7-brand-primary)",
              border: "1px solid var(--v7-border)",
              borderRadius: "4px",
              cursor: refreshDisabled ? "not-allowed" : "pointer",
            }}
          >
            {refreshDisabled ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </header>

      {refreshMessage ? (
        <p
          role="status"
          style={{
            fontSize: "12px",
            color: "var(--v7-text-muted)",
            margin: "0 0 var(--space-3) 0",
          }}
        >
          {refreshMessage}
        </p>
      ) : null}

      {clusters.length === 0 ? (
        <div style={{ padding: "var(--space-6) var(--space-4)" }}>
          <h3
            style={{
              fontSize: "14px",
              fontWeight: 500,
              margin: 0,
              color: "var(--v7-text)",
            }}
          >
            {EMPTY_STATE.title}
          </h3>
          <p
            style={{
              fontSize: "13px",
              color: "var(--v7-text-muted)",
              marginTop: "var(--space-2)",
            }}
          >
            {EMPTY_STATE.body}
          </p>
        </div>
      ) : (
        <ul
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-2)",
          }}
        >
          {clusters.map((c) => (
            <li
              key={c.id}
              style={{
                background: "var(--v7-bg-2)",
                border: "1px solid var(--v7-border)",
                borderRadius: "6px",
                padding: "var(--space-3) var(--space-4)",
              }}
            >
              <details>
                <summary
                  style={{
                    cursor: "pointer",
                    listStyle: "none",
                    fontSize: "13px",
                    color: "var(--v7-text)",
                    display: "flex",
                    gap: "var(--space-3)",
                    alignItems: "baseline",
                  }}
                >
                  <span
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontWeight: 500,
                    }}
                  >
                    {c.centroid_label}
                  </span>
                  <span
                    style={{
                      fontSize: "12px",
                      color: "var(--v7-text-muted)",
                    }}
                  >
                    {c.member_count} this window
                  </span>
                  {filter === "all" ? (
                    <span
                      style={{
                        fontSize: "11px",
                        color: "var(--v7-text-muted)",
                      }}
                    >
                      swarm: {c.swarm_type}
                    </span>
                  ) : null}
                </summary>
                <div
                  style={{
                    marginTop: "var(--space-3)",
                    fontSize: "12px",
                    color: "var(--v7-text-muted)",
                  }}
                >
                  <div style={{ marginBottom: "var(--space-2)" }}>
                    Member labels: {c.member_labels.join(", ") || "—"}
                  </div>
                  <div>
                    Sample pipeline_event_ids:{" "}
                    {c.sample_email_ids.length === 0
                      ? "—"
                      : c.sample_email_ids.join(", ")}
                  </div>
                  <div style={{ marginTop: "var(--space-2)" }}>
                    Window: {new Date(c.window_start).toISOString()} →{" "}
                    {new Date(c.window_end).toISOString()}
                  </div>
                </div>
              </details>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
