import { BaseEdge, getSmoothStepPath, type EdgeProps } from "@xyflow/react";

// ---------------------------------------------------------------------------
// AnimatedEdge component
// ---------------------------------------------------------------------------

interface AnimatedEdgeData {
  animated?: boolean;
  status?: "idle" | "running" | "complete" | "failed";
}

function AnimatedEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps & { data?: AnimatedEdgeData }) {
  const [edgePath] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isActive = data?.animated === true;
  const isComplete = data?.status === "complete";

  // Determine stroke style
  let strokeStyle: string;
  if (isActive) {
    strokeStyle = "hsl(var(--primary))";
  } else if (isComplete) {
    strokeStyle = "rgb(34 197 94 / 0.4)"; // green-500/40
  } else {
    strokeStyle = "hsl(var(--muted-foreground) / 0.4)";
  }

  return (
    <>
      <BaseEdge
        id={id}
        path={edgePath}
        style={{
          stroke: strokeStyle,
          strokeWidth: isActive ? 2 : 1,
        }}
      />
      {isActive && (
        <circle r="4" fill="hsl(var(--primary))">
          <animateMotion dur="1.5s" repeatCount="indefinite" path={edgePath} />
        </circle>
      )}
    </>
  );
}

// Defined OUTSIDE the component -- React Flow requires stable edgeTypes reference
export const animatedEdgeTypes = { animated: AnimatedEdge } as const;

export { AnimatedEdge };
