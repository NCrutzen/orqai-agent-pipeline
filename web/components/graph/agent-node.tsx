"use client";

import { memo, useState, useEffect, useRef } from "react";
import { Handle, Position, type NodeProps } from "@xyflow/react";
import { Wrench, CheckCircle2 } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { AgentNodeData } from "@/lib/pipeline/graph-mapper";

// ---------------------------------------------------------------------------
// Status-aware styling
// ---------------------------------------------------------------------------

const statusClasses: Record<AgentNodeData["status"], string> = {
  idle: "border-muted-foreground/30",
  running: "border-blue-500 shadow-blue-500/20 shadow-lg animate-pulse",
  complete: "border-green-500 shadow-green-500/10 shadow-md",
  failed: "border-destructive shadow-destructive/10 shadow-md",
};

// ---------------------------------------------------------------------------
// Score count-up hook
// ---------------------------------------------------------------------------

function useCountUp(target: number | undefined, duration = 1200): number {
  const [display, setDisplay] = useState(0);
  const prevTarget = useRef<number | undefined>(undefined);

  useEffect(() => {
    if (target === undefined || target === prevTarget.current) return;
    prevTarget.current = target;

    const start = performance.now();

    function tick(now: number) {
      const elapsed = now - start;
      const progress = Math.min(elapsed / duration, 1);
      // ease-out: 1 - (1 - t)^3
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * (target as number)));
      if (progress < 1) {
        requestAnimationFrame(tick);
      }
    }

    requestAnimationFrame(tick);
  }, [target, duration]);

  return display;
}

// ---------------------------------------------------------------------------
// AgentNode component
// ---------------------------------------------------------------------------

type AgentNodeProps = NodeProps & { data: AgentNodeData };

const AgentNode = memo(function AgentNode({ data }: AgentNodeProps) {
  const displayScore = useCountUp(
    data.status === "complete" ? data.score : undefined
  );

  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`relative rounded-lg border-2 bg-background p-4 min-w-[200px] transition-all duration-400 animate-in fade-in zoom-in-95 ${statusClasses[data.status]}`}
            data-testid="agent-node"
          >
            <Handle type="target" position={Position.Top} />

            {/* Complete checkmark */}
            {data.status === "complete" && (
              <CheckCircle2 className="absolute top-2 right-2 size-4 text-green-500" />
            )}

            {/* Agent name */}
            <div className="text-sm font-semibold truncate">{data.name}</div>

            {/* Role */}
            <div className="text-xs text-muted-foreground truncate">
              {data.role}
            </div>

            {/* Tool count */}
            {data.toolCount > 0 && (
              <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                <Wrench className="size-3" />
                {data.toolCount} tool{data.toolCount !== 1 ? "s" : ""}
              </div>
            )}

            {/* Score display */}
            {data.status === "complete" && data.score !== undefined && (
              <div className="text-lg font-semibold text-green-600 dark:text-green-400 mt-2">
                {displayScore}%
              </div>
            )}

            <Handle type="source" position={Position.Bottom} />
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" sideOffset={8}>
          <div className="flex flex-col gap-0.5">
            <span>{data.role}</span>
            <span>{data.model}</span>
            <span>{data.toolCount} tools</span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
});

AgentNode.displayName = "AgentNode";

// Defined OUTSIDE the component -- React Flow requires stable nodeTypes reference
export const agentNodeTypes = { agent: AgentNode } as const;

export { AgentNode };
