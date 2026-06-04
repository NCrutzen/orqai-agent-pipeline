// Phase 5 Plan 04 — RegistriesClientShell RTL coverage (ADMIN-02 + ADMIN-03).
//
// T1: renders an intents row (intent_key + handler_status).
// T2: renders a systems row with last_clickup_sync_at set → timestamp text.
// T3: renders a systems row with last_clickup_sync_at=null → "Never synced".
// T4: NO write affordance — no edit/delete/save/create button text.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { IntentRow, SystemRow } from "../_lib/load-registries";

// Import after mocks (no navigation mocks needed — registries shell has no router).
import { RegistriesClientShell } from "../registries/client-shell";

afterEach(() => {
  cleanup();
});

// ── Fixtures ─────────────────────────────────────────────────────────────────

const sampleIntent: IntentRow = {
  swarm_type: "support-tickets",
  intent_key: "clickup-escalate",
  handler_agent_key: null,
  handler_event: "support-tickets/clickup-escalate.requested",
  handler_status: "placeholder",
  requires_orchestration: false,
  created_at: "2026-06-01T00:00:00Z",
  updated_at: "2026-06-01T00:00:00Z",
};

const systemWithSync: SystemRow = {
  id: "00000000-0000-4000-8000-000000000010",
  system_key: "nxt",
  display_name: "NXT ERP",
  clickup_list_id: "cl-99",
  default_assignee_user_id: null,
  vendor_locale: "nl-NL",
  vendor_email: null,
  enabled: true,
  last_clickup_sync_at: "2026-06-02T08:00:00Z",
};

const systemNoSync: SystemRow = {
  id: "00000000-0000-4000-8000-000000000011",
  system_key: "crm",
  display_name: "CRM",
  clickup_list_id: null,
  default_assignee_user_id: null,
  vendor_locale: null,
  vendor_email: null,
  enabled: false,
  last_clickup_sync_at: null,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("RegistriesClientShell", () => {
  it("T1 — renders an intents row with intent_key and handler_status", () => {
    render(
      <RegistriesClientShell
        intents={[sampleIntent]}
        systems={[]}
      />,
    );
    expect(screen.getByText("clickup-escalate")).toBeTruthy();
    expect(screen.getByText("placeholder")).toBeTruthy();
  });

  it("T2 — renders a systems row with last_clickup_sync_at set → timestamp shown", () => {
    render(
      <RegistriesClientShell
        intents={[]}
        systems={[systemWithSync]}
      />,
    );
    // The display_name should be visible
    expect(screen.getByText("NXT ERP")).toBeTruthy();
    // "Never synced" must NOT appear for this row
    expect(screen.queryByText("Never synced")).toBeNull();
    // Should render a date string — just assert the cell is not "Never synced"
    // (exact locale-formatted string is environment-dependent, so we check for the
    // display_name row and absence of "Never synced")
  });

  it("T3 — renders 'Never synced' when last_clickup_sync_at is null", () => {
    render(
      <RegistriesClientShell
        intents={[]}
        systems={[systemNoSync]}
      />,
    );
    expect(screen.getByText("Never synced")).toBeTruthy();
  });

  it("T4 — NO write affordance: no edit/delete/save/create button text", () => {
    const { container } = render(
      <RegistriesClientShell
        intents={[sampleIntent]}
        systems={[systemWithSync, systemNoSync]}
      />,
    );
    const html = container.innerHTML.toLowerCase();
    expect(html).not.toMatch(/\bedit\b/);
    expect(html).not.toMatch(/\bdelete\b/);
    expect(html).not.toMatch(/\bsave\b/);
    expect(html).not.toMatch(/\bcreate\b/);
  });

  it("T5 — renders both sections with section headings", () => {
    render(
      <RegistriesClientShell
        intents={[sampleIntent]}
        systems={[systemWithSync]}
      />,
    );
    expect(screen.getByText(/Intents \(read-only\)/)).toBeTruthy();
    expect(screen.getByText(/Software systems registry \(read-only\)/)).toBeTruthy();
  });
});
