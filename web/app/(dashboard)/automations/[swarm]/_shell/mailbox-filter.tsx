"use client";

// Phase 82 Plan 01 — Mailbox multi-select filter for the unified shell.
//
// URL state: writes `?mailbox=<id>` per selection (repeated params for multi-
// select per CONTEXT D-12). The trigger label reflects current selection:
//   0 selected → "All mailboxes"
//   1 selected → "Mailbox: <label>"
//  >1 selected → "<N> mailboxes"
//
// Uses shadcn DropdownMenu (the project's Popover primitive — see web/components/ui/).
// No registry imports; the per-stage page boundary resolves `mailboxes` via
// `_lib/get-swarm-mailboxes.ts`.

import { useCallback } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Check, ChevronDown } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface MailboxOption {
  id: number;
  label: string;
}

export interface MailboxFilterProps {
  mailboxes: MailboxOption[];
  /** Currently selected mailbox ids; empty array = "All mailboxes". */
  selected: number[];
}

export function MailboxFilter({ mailboxes, selected }: MailboxFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();

  const navigate = useCallback(
    (ids: number[]) => {
      const qs = new URLSearchParams(search?.toString() ?? "");
      qs.delete("mailbox");
      for (const id of ids) qs.append("mailbox", String(id));
      const q = qs.toString();
      router.push(q ? `${pathname}?${q}` : (pathname ?? ""));
    },
    [router, pathname, search],
  );

  const triggerLabel = (() => {
    if (selected.length === 0) return "All mailboxes";
    if (selected.length === 1) {
      const m = mailboxes.find((x) => x.id === selected[0]);
      return `Mailbox: ${m?.label ?? `mailbox ${selected[0]}`}`;
    }
    return `${selected.length} mailboxes`;
  })();

  const toggle = (id: number) => {
    const isSel = selected.includes(id);
    const next = isSel ? selected.filter((x) => x !== id) : [...selected, id];
    navigate(next);
  };

  const clear = () => navigate([]);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Filter by mailbox"
          className="inline-flex items-center gap-2"
        >
          <span>{triggerLabel}</span>
          <ChevronDown className="h-4 w-4" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[220px]">
        {mailboxes.map((m) => {
          const isSel = selected.includes(m.id);
          return (
            <DropdownMenuItem
              key={m.id}
              onSelect={(e) => {
                // Keep menu open on click so multi-select feels natural.
                e.preventDefault();
                toggle(m.id);
              }}
              role="menuitemcheckbox"
              aria-checked={isSel}
              data-testid={`mailbox-option-${m.id}`}
            >
              <span className="inline-flex items-center gap-2">
                <Check
                  className={`h-4 w-4 ${isSel ? "opacity-100" : "opacity-0"}`}
                  aria-hidden="true"
                />
                <span>{m.label}</span>
              </span>
            </DropdownMenuItem>
          );
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={(e) => {
            e.preventDefault();
            clear();
          }}
          data-testid="mailbox-clear"
        >
          Clear
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
