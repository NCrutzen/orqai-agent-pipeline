"use client";

// Phase 5 Plan 04 — support-tickets registries client shell (ADMIN-02 + ADMIN-03).
//
// Read-only surface (T-05-04-02 mitigated):
//   - ADMIN-02 "read in v1, prepared for write later" — no write affordance.
//   - ADMIN-03 "read in v1, prepared for write later" — no write affordance.
//   RTL asserts absence of edit/delete/save/create.
//
// Section 1 — Intents (read-only):
//   intent_key / handler_event / handler_status
//
// Section 2 — Software systems registry (read-only):
//   system_key / display_name / clickup_list_id / vendor_locale / enabled /
//   Sync status (last_clickup_sync_at: NULL → "Never synced"; else ISO timestamp)

import type { IntentRow, SystemRow } from "../_lib/load-registries";

interface Props {
  intents: IntentRow[];
  systems: SystemRow[];
}

function formatSyncAt(ts: string | null): string {
  if (ts === null) return "Never synced";
  try {
    return new Date(ts).toLocaleString("nl-NL", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
}

const cellStyle: React.CSSProperties = {
  padding: "var(--space-2) var(--space-3)",
  fontSize: "12px",
  whiteSpace: "nowrap",
};

const monoStyle: React.CSSProperties = {
  ...cellStyle,
  fontFamily: "var(--font-mono)",
  fontSize: "11px",
};

const headerStyle: React.CSSProperties = {
  ...cellStyle,
  fontWeight: 500,
  color: "var(--v7-text-muted)",
};

export function RegistriesClientShell({ intents, systems }: Props) {
  return (
    <section
      style={{
        padding: "var(--space-4) var(--space-5)",
        background: "var(--v7-bg-1)",
        color: "var(--v7-text)",
        display: "flex",
        flexDirection: "column",
        gap: "var(--space-6)",
      }}
    >
      {/* ── Section 1: Intents ──────────────────────────────────────────── */}
      <div>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-3)",
          }}
        >
          <h2
            style={{
              fontSize: "15px",
              fontWeight: 500,
              margin: 0,
              color: "var(--v7-text)",
            }}
          >
            Intents (read-only)
          </h2>
          <span style={{ fontSize: "12px", color: "var(--v7-text-muted)" }}>
            {intents.length} row{intents.length !== 1 ? "s" : ""} —{" "}
            {"swarm_type='support-tickets'"}
          </span>
        </header>

        {intents.length === 0 ? (
          <p
            style={{
              fontSize: "13px",
              color: "var(--v7-text-muted)",
            }}
          >
            No intents found for {"swarm_type='support-tickets'"}.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: "var(--v7-bg-2)",
                border: "1px solid var(--v7-border)",
                borderRadius: "6px",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--v7-border)" }}>
                  {["intent_key", "handler_event", "handler_status"].map(
                    (col) => (
                      <th
                        key={col}
                        style={{ ...headerStyle, textAlign: "left" }}
                      >
                        {col}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {intents.map((intent) => (
                  <tr
                    key={intent.intent_key}
                    style={{ borderBottom: "1px solid var(--v7-border)" }}
                  >
                    <td style={monoStyle}>{intent.intent_key}</td>
                    <td
                      style={{
                        ...monoStyle,
                        color: "var(--v7-text-muted)",
                      }}
                    >
                      {intent.handler_event}
                    </td>
                    <td style={cellStyle}>
                      <span
                        style={{
                          display: "inline-block",
                          padding: "1px 6px",
                          borderRadius: "4px",
                          fontSize: "10px",
                          fontWeight: 600,
                          background:
                            intent.handler_status === "registered"
                              ? "color-mix(in srgb, var(--v7-brand-primary) 20%, transparent)"
                              : "color-mix(in srgb, var(--v7-text-muted) 15%, transparent)",
                          color:
                            intent.handler_status === "registered"
                              ? "var(--v7-brand-primary)"
                              : "var(--v7-text-muted)",
                        }}
                      >
                        {intent.handler_status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Section 2: Software systems ────────────────────────────────── */}
      <div>
        <header
          style={{
            display: "flex",
            alignItems: "center",
            gap: "var(--space-3)",
            marginBottom: "var(--space-3)",
          }}
        >
          <h2
            style={{
              fontSize: "15px",
              fontWeight: 500,
              margin: 0,
              color: "var(--v7-text)",
            }}
          >
            Software systems registry (read-only)
          </h2>
          <span style={{ fontSize: "12px", color: "var(--v7-text-muted)" }}>
            {systems.length} row{systems.length !== 1 ? "s" : ""}
          </span>
        </header>

        {systems.length === 0 ? (
          <p style={{ fontSize: "13px", color: "var(--v7-text-muted)" }}>
            No systems found. Phase 2/4 ClickUp sync populates this registry.
          </p>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                background: "var(--v7-bg-2)",
                border: "1px solid var(--v7-border)",
                borderRadius: "6px",
              }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--v7-border)" }}>
                  {[
                    "system_key",
                    "display_name",
                    "clickup_list_id",
                    "vendor_locale",
                    "enabled",
                    "Sync status",
                  ].map((col) => (
                    <th
                      key={col}
                      style={{ ...headerStyle, textAlign: "left" }}
                    >
                      {col}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {systems.map((sys) => (
                  <tr
                    key={sys.system_key}
                    style={{ borderBottom: "1px solid var(--v7-border)" }}
                  >
                    <td style={monoStyle}>{sys.system_key}</td>
                    <td style={cellStyle}>{sys.display_name}</td>
                    <td
                      style={{
                        ...monoStyle,
                        color: "var(--v7-text-muted)",
                      }}
                    >
                      {sys.clickup_list_id ?? "—"}
                    </td>
                    <td style={cellStyle}>{sys.vendor_locale ?? "—"}</td>
                    <td style={cellStyle}>
                      {sys.enabled ? (
                        <span style={{ color: "var(--v7-brand-primary)" }}>
                          enabled
                        </span>
                      ) : (
                        <span style={{ color: "var(--v7-text-muted)" }}>
                          disabled
                        </span>
                      )}
                    </td>
                    <td
                      style={{
                        ...cellStyle,
                        color:
                          sys.last_clickup_sync_at === null
                            ? "var(--v7-text-muted)"
                            : "var(--v7-text)",
                      }}
                    >
                      {formatSyncAt(sys.last_clickup_sync_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
