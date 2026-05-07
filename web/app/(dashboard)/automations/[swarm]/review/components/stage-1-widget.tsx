"use client";

/**
 * Phase 71-04 (REVW-01). Stage 1 category override widget.
 *
 * Implements UI-SPEC §Per-stage override widgets — S1:
 *   - Single Select dropdown.
 *   - Items: synthetic { key:'noise', label:'Noise / spam' } and
 *            { key:'archive', label:'Archive without action' } at TOP,
 *     a separator, then enabled categories from loadSwarmNoiseCategories.
 *   - Placeholder: "Pick a category…".
 */
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { SwarmNoiseCategoryRow } from "@/lib/swarms/types";

interface Stage1WidgetProps {
  categories: SwarmNoiseCategoryRow[];
  value: string | null;
  onChange: (categoryKey: string) => void;
}

const SYNTHETIC = [
  { key: "noise", label: "Noise / spam" },
  { key: "archive", label: "Archive without action" },
] as const;

export function Stage1Widget({
  categories,
  value,
  onChange,
}: Stage1WidgetProps) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Pick a Stage 1 category"
        className="w-full"
      >
        <SelectValue placeholder="Pick a category…" />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {SYNTHETIC.map((s) => (
            <SelectItem key={s.key} value={s.key}>
              {s.label}
            </SelectItem>
          ))}
        </SelectGroup>
        <SelectSeparator />
        <SelectGroup>
          {categories.map((c) => (
            <SelectItem key={c.category_key} value={c.category_key}>
              {c.category_key}
            </SelectItem>
          ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
