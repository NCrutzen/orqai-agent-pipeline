"use client";

import * as React from "react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { USER_CHOSEN_TYPES } from "@/lib/automations/support-tickets/types";
import { cn } from "@/lib/utils";

// Dutch display labels per UI-SPEC §Section 1
const TYPE_LABELS: Record<(typeof USER_CHOSEN_TYPES)[number], string> = {
  bug: "Storing / fout",
  "feature-request": "Verzoek / verbetering",
  "info-request": "Informatieverzoek",
  question: "Vraag",
  other: "Anders",
};

interface TypeSelectorProps {
  value: string;
  onValueChange: (value: string) => void;
}

export function TypeSelector({ value, onValueChange }: TypeSelectorProps) {
  return (
    <RadioGroup
      value={value}
      onValueChange={onValueChange}
      aria-required="true"
      className="flex flex-wrap gap-2"
    >
      {USER_CHOSEN_TYPES.map((type) => (
        <label
          key={type}
          className={cn(
            "rounded-full border px-4 py-2 text-sm cursor-pointer transition-colors",
            value === type
              ? "border-[var(--v7-brand-primary)] bg-[var(--v7-brand-primary-soft)] font-semibold text-[var(--v7-text)]"
              : "border-[var(--v7-line)] text-[var(--v7-muted)] hover:text-[var(--v7-text)]",
          )}
        >
          {/* Hidden radio input — pill label handles click */}
          <RadioGroupItem value={type} className="sr-only" />
          {TYPE_LABELS[type]}
        </label>
      ))}
    </RadioGroup>
  );
}
