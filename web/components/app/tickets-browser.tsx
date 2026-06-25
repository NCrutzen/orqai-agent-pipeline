"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
import type { Dictionary } from "@/lib/i18n";
import { interpolate } from "@/lib/i18n/config";

/** View-model row passed from the server page (no Date — pre-formatted). */
export interface TicketRow {
  id: string;
  title: string;
  statusLabel: string;
  statusColor: string;
  group: "open" | "rejected" | "resolved";
  createdAtLabel: string;
  hasUnread: boolean;
}

type GroupKey = "all" | "open" | "rejected" | "resolved";
const GROUP_KEYS: GroupKey[] = ["all", "open", "rejected", "resolved"];

export function TicketsBrowser({
  tickets,
  t,
}: {
  tickets: TicketRow[];
  t: Dictionary["tickets"];
}) {
  const [group, setGroup] = useState<GroupKey>("all");
  const [query, setQuery] = useState("");

  const counts = useMemo(() => {
    const c: Record<GroupKey, number> = {
      all: tickets.length,
      open: 0,
      rejected: 0,
      resolved: 0,
    };
    for (const ticket of tickets) c[ticket.group] += 1;
    return c;
  }, [tickets]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((ticket) => {
      if (group !== "all" && ticket.group !== group) return false;
      if (
        q &&
        !ticket.title.toLowerCase().includes(q) &&
        !ticket.statusLabel.toLowerCase().includes(q)
      ) {
        return false;
      }
      return true;
    });
  }, [tickets, group, query]);

  const pillBase =
    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--v7-brand-primary)]";
  const pillActive =
    "border-[var(--v7-brand-primary)] bg-[var(--v7-brand-primary)] text-[var(--v7-inverse)] font-semibold";
  const pillIdle =
    "border-[var(--v7-line)] bg-[var(--v7-panel-2)] text-[var(--v7-text)] hover:border-[var(--v7-brand-primary)]";

  return (
    <div>
      {/* Search */}
      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 size-4 text-[var(--v7-muted)]"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchLabel}
          className="w-full rounded-lg border border-[var(--v7-line)] bg-[var(--v7-panel)] py-2 pl-9 pr-3 text-sm text-[var(--v7-text)] placeholder:text-[var(--v7-muted)] focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-[var(--v7-brand-primary)]"
        />
      </div>

      {/* Status group filter */}
      <nav
        aria-label={t.filterLabel}
        className="flex flex-wrap items-center gap-2 mb-6"
      >
        {GROUP_KEYS.map((key) => {
          const isActive = group === key;
          return (
            <button
              key={key}
              type="button"
              onClick={() => setGroup(key)}
              aria-pressed={isActive}
              className={`${pillBase} ${isActive ? pillActive : pillIdle}`}
            >
              {t.filters[key]}
              <span className={isActive ? "opacity-80" : "text-[var(--v7-muted)]"}>
                ({counts[key]})
              </span>
            </button>
          );
        })}
      </nav>

      {/* Results */}
      {visible.length === 0 ? (
        <p className="text-sm text-[var(--v7-muted)] py-8 text-center">
          {query.trim()
            ? interpolate(t.noSearchResults, { q: query.trim() })
            : t.noneInGroup}
        </p>
      ) : (
        <ul className="space-y-3">
          {visible.map((ticket) => (
            <li
              key={ticket.id}
              className="rounded-lg border border-[var(--v7-line)] bg-[var(--v7-panel)] px-4 py-3 cursor-pointer hover:bg-[var(--v7-panel-2)] transition-colors"
            >
              <Link href={`/app/tickets/${ticket.id}`}>
                <div className="flex items-center gap-2">
                  {ticket.hasUnread && (
                    <span
                      className="inline-block size-2 rounded-full flex-shrink-0 bg-[var(--v7-brand-primary)]"
                      aria-label={t.unreadBadge}
                    />
                  )}
                  <p className="text-sm font-semibold text-[var(--v7-text)]">
                    {ticket.title}
                  </p>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span
                    className="inline-block size-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: ticket.statusColor }}
                    aria-hidden="true"
                  />
                  <span className="text-sm text-[var(--v7-muted)]">
                    {ticket.statusLabel}
                  </span>
                  <span className="text-sm text-[var(--v7-faint)]">·</span>
                  <span className="text-sm text-[var(--v7-muted)]">
                    {ticket.createdAtLabel}
                  </span>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
