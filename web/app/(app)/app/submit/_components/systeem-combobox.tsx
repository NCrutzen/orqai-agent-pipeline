"use client";

import * as React from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SoftwareSystem = { system_key: string; display_name: string };

// Sentinel value for "mijn systeem staat er niet bij" — maps to onChange(null)
const NIET_GEVONDEN_VALUE = "__niet_gevonden__";

interface SysteemComboboxProps {
  systems: SoftwareSystem[];
  value: string | null;
  onChange: (key: string | null) => void;
}

export function SysteemCombobox({ systems, value, onChange }: SysteemComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selected = systems.find((s) => s.system_key === value);

  // Determine trigger label
  const triggerLabel =
    value === null && selected === undefined && value !== undefined
      ? "Mijn systeem staat er niet bij →"
      : selected?.display_name ?? "Zoek een software-systeem…";

  // Track if user explicitly chose "staat er niet bij"
  const isNietGevonden = value === null;
  const hasSelection = selected !== undefined || isNietGevonden;

  const displayLabel = selected
    ? selected.display_name
    : isNietGevonden
      ? "Mijn systeem staat er niet bij →"
      : "Zoek een software-systeem…";

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between font-normal"
        >
          <span
            className={cn(
              "truncate",
              !hasSelection && "text-[var(--v7-muted)]",
            )}
          >
            {displayLabel}
          </span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="z-50 w-[var(--radix-popover-trigger-width)] min-w-[220px] rounded-xl border border-[var(--v7-line)] bg-[var(--v7-panel)] shadow-md p-0"
          sideOffset={4}
          align="start"
        >
          <Command>
            <CommandInput placeholder="Systeem zoeken…" />
            <CommandList>
              <CommandEmpty>
                Geen systemen gevonden. Kies &apos;Mijn systeem staat er niet bij&apos;.
              </CommandEmpty>
              <CommandGroup>
                {systems.map((sys) => (
                  <CommandItem
                    key={sys.system_key}
                    value={sys.system_key}
                    onSelect={() => {
                      onChange(sys.system_key);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === sys.system_key ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {sys.display_name}
                  </CommandItem>
                ))}
                {/* Sentinel option: maps to systeem=null (D-15) */}
                <CommandItem
                  value={NIET_GEVONDEN_VALUE}
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="italic text-[var(--v7-muted)]"
                >
                  Mijn systeem staat er niet bij →
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
