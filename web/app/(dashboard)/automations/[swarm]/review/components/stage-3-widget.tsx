"use client";

/**
 * Phase 71-04 (REVW-03). Stage 3 handler intent override widget.
 *
 * Implements UI-SPEC §S3:
 *   - Single Select dropdown sourced from loadSwarmIntents('debtor-email').
 *   - Items render `intent_key`; Tooltip on hover shows `handler_agent_key`.
 *   - Placeholder: "Pick a handler…".
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { SwarmIntentRow } from "@/lib/swarms/types";

interface Stage3WidgetProps {
  intents: SwarmIntentRow[];
  value: string | null;
  onChange: (intentKey: string) => void;
}

export function Stage3Widget({ intents, value, onChange }: Stage3WidgetProps) {
  return (
    <Select value={value ?? undefined} onValueChange={onChange}>
      <SelectTrigger
        aria-label="Pick a Stage 3 handler"
        className="w-full"
      >
        <SelectValue placeholder="Pick a handler…" />
      </SelectTrigger>
      <SelectContent>
        {intents.map((i) => (
          <TooltipProvider key={i.intent_key}>
            <Tooltip>
              <TooltipTrigger asChild>
                <SelectItem value={i.intent_key}>
                  <span className="font-mono">{i.intent_key}</span>
                </SelectItem>
              </TooltipTrigger>
              <TooltipContent>
                handler: <span className="font-mono">{i.handler_agent_key ?? i.handler_event}</span>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        ))}
      </SelectContent>
    </Select>
  );
}
