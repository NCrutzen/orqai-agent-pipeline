"use client";

/**
 * Phase 71-04 (REVW-01..06). Recipient chip strip.
 *
 * Implements UI-SPEC §Recipient chip strip behaviour:
 *   - URL-driven single-select (`?inbox=…`); "All" chip default.
 *   - role="tablist" + role="tab" + aria-selected per chip.
 *   - Active chip uses --v7-brand-secondary-soft bg / --v7-brand-secondary border + text.
 *   - 8px brand dot per chip; 11px mono row-count badge.
 *
 * Source props mirror the chip-row-count contract from Plan 03 row-summary.
 * The brand-dot CSS var name is resolved via brandColorToken (Plan 71-01).
 */
import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { brandColorToken } from "@/lib/swarms/brand-color";

interface ChipInput {
  inbox: string;
  brand: string; // Entity (Plan 71-01) — typed loosely here for forward-compat.
  rowCount: number;
}

interface RecipientChipStripProps {
  chips: ChipInput[];
  /** "all" or a specific inbox; resolved by parent from `?inbox=` URL param. */
  activeInbox: string;
  /** Total row count across all chips (used for the "All" chip badge). */
  totalCount: number;
}

export function RecipientChipStrip({
  chips,
  activeInbox,
  totalCount,
}: RecipientChipStripProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const navigate = useCallback(
    (next: string) => {
      const qs = new URLSearchParams(search?.toString() ?? "");
      if (next === "all") qs.delete("inbox");
      else qs.set("inbox", next);
      const q = qs.toString();
      router.push(q ? `${pathname}?${q}` : pathname);
    },
    [router, pathname, search],
  );

  const isActive = (key: string) =>
    key === "all" ? activeInbox === "all" : activeInbox === key;

  return (
    <div
      role="tablist"
      aria-label="Filter predicted rows by recipient inbox"
      className="flex items-center gap-2 overflow-x-auto py-3"
    >
      <Chip
        active={isActive("all")}
        label="All"
        rowCount={totalCount}
        brandToken={null}
        onClick={() => navigate("all")}
      />
      {chips.map((c) => (
        <Chip
          key={c.inbox}
          active={isActive(c.inbox)}
          label={c.inbox}
          rowCount={c.rowCount}
          brandToken={brandColorToken(c.brand)}
          onClick={() => navigate(c.inbox)}
        />
      ))}
    </div>
  );
}

interface ChipProps {
  active: boolean;
  label: string;
  rowCount: number;
  /** CSS var name (e.g. "--v7-lime") OR null for the "All" chip. */
  brandToken: string | null;
  onClick: () => void;
}

function Chip({ active, label, rowCount, brandToken, onClick }: ChipProps) {
  const display =
    rowCount >= 1000 ? rowCount.toLocaleString("en-US") : String(rowCount);
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      aria-label={`${label} — ${rowCount} predicted rows`}
      onClick={onClick}
      className="inline-flex items-center gap-2 shrink-0 px-3 py-1.5 rounded-[var(--v7-radius-pill)] border transition-colors duration-150 focus:outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{
        background: active
          ? "var(--v7-brand-secondary-soft)"
          : "var(--v7-panel-2)",
        borderColor: active
          ? "var(--v7-brand-secondary)"
          : "var(--v7-line)",
        color: active ? "var(--v7-brand-secondary)" : "var(--v7-text)",
        outlineColor: "var(--v7-brand-secondary)",
      }}
    >
      {brandToken && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-block",
            width: 8,
            height: 8,
            borderRadius: "50%",
            background: `var(${brandToken})`,
          }}
        />
      )}
      <span className="text-[13px] leading-[1.3] font-mono truncate max-w-[260px]">
        {label}
      </span>
      <span
        className="text-[11px] leading-[1.3] font-mono px-1.5 py-0.5 rounded-[var(--v7-radius-pill)]"
        style={{
          background: active
            ? "rgba(105,168,255,0.18)"
            : "rgba(255,255,255,0.06)",
          fontVariantNumeric: "tabular-nums",
        }}
      >
        {display}
      </span>
    </button>
  );
}
