"use client";

import { useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { Wrench } from "lucide-react";
import type { AgentNodeData } from "@/lib/pipeline/graph-mapper";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AgentDetailPanelProps {
  agent: AgentNodeData | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// ---------------------------------------------------------------------------
// Section label component
// ---------------------------------------------------------------------------

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
      {children}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AgentDetailPanel
// ---------------------------------------------------------------------------

export function AgentDetailPanel({
  agent,
  open,
  onOpenChange,
}: AgentDetailPanelProps) {
  const [instructionsExpanded, setInstructionsExpanded] = useState(false);

  if (!agent) return null;

  const hasLongInstructions =
    agent.instructions && agent.instructions.length > 200;
  const displayInstructions =
    agent.instructions && hasLongInstructions && !instructionsExpanded
      ? agent.instructions.slice(0, 200) + "..."
      : agent.instructions;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[400px] sm:w-[400px] overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="text-2xl font-semibold">
            {agent.name}
          </SheetTitle>
        </SheetHeader>

        {/* Role */}
        <div className="py-4">
          <SectionLabel>Role</SectionLabel>
          <p className="text-sm">{agent.role}</p>
        </div>

        <Separator />

        {/* Description */}
        <div className="py-4">
          <SectionLabel>Description</SectionLabel>
          {agent.description ? (
            <p className="text-sm">{agent.description}</p>
          ) : (
            <p className="text-sm text-muted-foreground">
              No description available
            </p>
          )}
        </div>

        <Separator />

        {/* Model */}
        <div className="py-4">
          <SectionLabel>Model</SectionLabel>
          <p className="text-sm">{agent.model}</p>
        </div>

        <Separator />

        {/* Instructions */}
        <div className="py-4">
          <SectionLabel>Instructions</SectionLabel>
          {agent.instructions ? (
            <div>
              <p className="text-sm whitespace-pre-wrap">
                {displayInstructions}
              </p>
              {hasLongInstructions && (
                <button
                  type="button"
                  onClick={() => setInstructionsExpanded(!instructionsExpanded)}
                  className="text-sm text-primary mt-1 hover:underline"
                >
                  {instructionsExpanded ? "Show less" : "Show more"}
                </button>
              )}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No instructions available
            </p>
          )}
        </div>

        <Separator />

        {/* Tools */}
        <div className="py-4">
          <SectionLabel>Tools</SectionLabel>
          {agent.tools.length > 0 ? (
            <ul className="space-y-1.5">
              {agent.tools.map((tool) => (
                <li
                  key={tool}
                  className="flex items-center gap-2 text-sm"
                >
                  <Wrench className="size-3 text-muted-foreground" />
                  {tool}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No tools assigned</p>
          )}
        </div>

        <Separator />

        {/* Performance */}
        <div className="py-4">
          <SectionLabel>Performance</SectionLabel>
          {agent.score !== undefined ? (
            <div className="space-y-2">
              <p className="text-sm font-semibold">{agent.score}%</p>
              <div className="h-2 w-full rounded-full bg-muted">
                <div
                  className="h-2 rounded-full bg-green-500 transition-all duration-500"
                  style={{ width: `${agent.score}%` }}
                />
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              Score available after testing
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
