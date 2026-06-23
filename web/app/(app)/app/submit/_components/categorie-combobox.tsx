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

export type Categorie = { type_key: string; label_nl: string };

// Sentinel value for "staat er niet bij" — maps to onChange(null) (D-05)
const NIET_GEVONDEN_VALUE = "__niet_gevonden__";

interface CategorieComboboxProps {
  categories: Categorie[];
  value: string | null;
  onChange: (key: string | null) => void;
  triggerPlaceholder: string;
  searchPlaceholder: string;
  sentinelLabel: string;
}

export function CategorieCombobox({
  categories,
  value,
  onChange,
  triggerPlaceholder,
  searchPlaceholder,
  sentinelLabel,
}: CategorieComboboxProps) {
  const [open, setOpen] = React.useState(false);

  const selected = categories.find((c) => c.type_key === value);

  // Track if user explicitly chose "staat er niet bij"
  const isNietGevonden = value === null;
  const hasSelection = selected !== undefined || isNietGevonden;

  const displayLabel = selected
    ? selected.label_nl
    : isNietGevonden
      ? sentinelLabel
      : triggerPlaceholder;

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
            <CommandInput placeholder={searchPlaceholder} />
            <CommandList>
              <CommandEmpty>
                Niets gevonden. Kies &apos;staat er niet bij&apos;.
              </CommandEmpty>
              <CommandGroup>
                {categories.map((c) => (
                  <CommandItem
                    key={c.type_key}
                    value={c.type_key}
                    onSelect={() => {
                      onChange(c.type_key);
                      setOpen(false);
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === c.type_key ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {c.label_nl}
                  </CommandItem>
                ))}
              </CommandGroup>
              {/* WR-06: sentinel in its own group with forceMount so it is always
                  visible regardless of search query and is never matched by the
                  cmdk fuzzy-search filter (NIET_GEVONDEN_VALUE would match on
                  "niet"/"gevonden"/"__" when in the same group as real items). */}
              <CommandGroup forceMount>
                <CommandItem
                  value={NIET_GEVONDEN_VALUE}
                  forceMount
                  onSelect={() => {
                    onChange(null);
                    setOpen(false);
                  }}
                  className="italic text-[var(--v7-muted)]"
                >
                  {sentinelLabel}
                </CommandItem>
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
