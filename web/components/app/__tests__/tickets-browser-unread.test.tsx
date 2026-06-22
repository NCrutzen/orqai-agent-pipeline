// Behavioral test for the unread badge dot on TicketsBrowser rows.
//
// Covers the D-02 / D-03 unread surface:
//   - When hasUnread=false: the unread dot is absent from the DOM entirely.
//   - When hasUnread=true:  the unread dot is present and carries the correct aria-label.

import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";

import { TicketsBrowser, type TicketRow } from "../tickets-browser";

afterEach(() => cleanup());

const UNREAD_LABEL = "Nieuw";

const baseTicket: TicketRow = {
  id: "abc123",
  title: "Mijn laptop start niet op",
  statusLabel: "Open",
  statusColor: "#3b82f6",
  group: "open",
  createdAtLabel: "18-06-2026",
  hasUnread: false,
};

// Minimal dict subset — only the keys TicketsBrowser reads.
const t = {
  searchPlaceholder: "Zoek in tickets…",
  searchLabel: "Zoek in tickets",
  filterLabel: "Filter op status",
  filters: { all: "Alle", open: "Open", rejected: "Afgewezen", resolved: "Opgelost" },
  noneInGroup: "Geen tickets in deze groep.",
  noSearchResults: "Geen tickets gevonden voor \"{q}\".",
  unreadBadge: UNREAD_LABEL,
  navLabelUnread: "Mijn tickets — nieuwe updates",
  title: "Mijn tickets",
  empty: { title: "", body: "", cta: "" },
  error: { title: "", body: "" },
} as Parameters<typeof TicketsBrowser>[0]["t"];

describe("TicketsBrowser unread badge dot", () => {
  it("is absent from the DOM when hasUnread is false", () => {
    render(<TicketsBrowser tickets={[{ ...baseTicket, hasUnread: false }]} t={t} />);
    expect(screen.queryByLabelText(UNREAD_LABEL)).toBeNull();
  });

  it("is present in the DOM when hasUnread is true", () => {
    render(<TicketsBrowser tickets={[{ ...baseTicket, hasUnread: true }]} t={t} />);
    expect(screen.getByLabelText(UNREAD_LABEL)).toBeInTheDocument();
  });

  it("shows the dot only for the unread ticket when the list has multiple rows", () => {
    const tickets: TicketRow[] = [
      { ...baseTicket, id: "t1", title: "Ticket A", hasUnread: true },
      { ...baseTicket, id: "t2", title: "Ticket B", hasUnread: false },
    ];
    render(<TicketsBrowser tickets={tickets} t={t} />);
    // Only one unread dot for the single unread ticket.
    const dots = screen.getAllByLabelText(UNREAD_LABEL);
    expect(dots).toHaveLength(1);
  });
});
