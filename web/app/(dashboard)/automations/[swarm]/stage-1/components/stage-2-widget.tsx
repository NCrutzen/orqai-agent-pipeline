"use client";

/**
 * Phase 71-04 (REVW-02). Stage 2 customer combobox + re-run Switch.
 *
 * Source: Plan 71-01 Task 6 checkpoint = option (a) — thin SELECT-RPC over
 * `coordinator_runs DISTINCT customer_account_id, customer_name`. Helper:
 * `./stage-2-search.ts` (Server Action).
 *
 * Implements UI-SPEC §S2:
 *   - Combobox role="combobox" + aria-expanded.
 *   - 250ms debounce, min 2 chars, max 20 results.
 *   - Display: `{customer_name} · {nxt_account_id}`.
 *   - Switch labelled "Re-run downstream stages with the corrected customer".
 *   - Helper text: "Costs additional LLM tokens. Default: off — leave existing draft as-is."
 */
import { useEffect, useMemo, useState } from "react";
import { Switch } from "@/components/ui/switch";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  searchCustomers,
  type CustomerSearchHit,
} from "./stage-2-search";

export interface CustomerSelection {
  customer_account_id: string;
  customer_name: string;
}

interface Stage2WidgetProps {
  value: CustomerSelection | null;
  onChange: (next: CustomerSelection) => void;
  reRun: boolean;
  onReRunChange: (next: boolean) => void;
}

function useDebouncedValue<T>(value: T, ms: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return debounced;
}

export function Stage2Widget({
  value,
  onChange,
  reRun,
  onReRunChange,
}: Stage2WidgetProps) {
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query, 250);
  const [hits, setHits] = useState<CustomerSearchHit[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Phase 88.2-03 (D-14): all setState calls are deferred to a microtask
    // so RC's "no synchronous setState in effect" rule passes. The effect
    // body itself only schedules; nothing runs synchronously in the same
    // render commit. Cancellation via `cancelled` still works because every
    // setState is gated behind `!cancelled`.
    let cancelled = false;
    if (debounced.trim().length < 2) {
      Promise.resolve().then(() => {
        if (!cancelled) setHits((prev) => (prev.length === 0 ? prev : []));
      });
      return () => {
        cancelled = true;
      };
    }
    Promise.resolve().then(() => {
      if (!cancelled) setLoading(true);
    });
    searchCustomers(debounced)
      .then((results) => {
        if (!cancelled) setHits(results);
      })
      .catch(() => {
        if (!cancelled) setHits((prev) => (prev.length === 0 ? prev : []));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced]);

  const selectedLabel = useMemo(() => {
    if (!value) return null;
    return `${value.customer_name} · ${value.customer_account_id}`;
  }, [value]);

  return (
    <div className="flex flex-col gap-3">
      <div
        role="combobox"
        aria-expanded={hits.length > 0}
        aria-label="Search customers by name or account ID"
        className="rounded-[var(--v7-radius-sm)] border"
        style={{
          background: "var(--v7-panel-2)",
          borderColor: "var(--v7-line)",
        }}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={
              selectedLabel ?? "Search by name or account ID…"
            }
            value={query}
            onValueChange={setQuery}
          />
          <CommandList>
            {loading && (
              <div
                className="px-3 py-2 text-[12px] leading-[1.3]"
                style={{ color: "var(--v7-muted)" }}
              >
                Searching…
              </div>
            )}
            {!loading && debounced.length >= 2 && hits.length === 0 && (
              <CommandEmpty>No customers match &quot;{debounced}&quot;.</CommandEmpty>
            )}
            {hits.length > 0 && (
              <CommandGroup>
                {hits.map((h) => (
                  <CommandItem
                    key={`${h.customer_account_id}|${h.customer_name}`}
                    value={`${h.customer_account_id}|${h.customer_name}`}
                    onSelect={() => {
                      onChange({
                        customer_account_id: h.customer_account_id,
                        customer_name: h.customer_name,
                      });
                      setQuery("");
                    }}
                  >
                    <span className="font-mono">
                      {h.customer_name}
                    </span>
                    <span
                      className="ml-2 font-mono text-[12px]"
                      style={{ color: "var(--v7-muted)" }}
                    >
                      · {h.customer_account_id}
                    </span>
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
        </Command>
      </div>

      <div
        className="flex items-start gap-3 p-3 rounded-[var(--v7-radius-sm)] border"
        style={{
          background: "var(--v7-panel-2)",
          borderColor: "var(--v7-line)",
        }}
      >
        <Switch
          checked={reRun}
          onCheckedChange={onReRunChange}
          aria-label="Re-run downstream stages with the corrected customer"
          id="stage-2-rerun"
        />
        <label htmlFor="stage-2-rerun" className="flex flex-col gap-1 cursor-pointer">
          <span className="text-[13px] font-medium leading-[1.3]">
            Re-run downstream stages with the corrected customer
          </span>
          <span
            className="text-[12px] leading-[1.4]"
            style={{ color: "var(--v7-muted)" }}
          >
            Costs additional LLM tokens. Default: off — leave existing draft as-is.
          </span>
        </label>
      </div>
    </div>
  );
}
