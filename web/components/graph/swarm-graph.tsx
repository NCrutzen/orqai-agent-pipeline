"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesState,
  useEdgesState,
  Controls,
  Background,
  BackgroundVariant,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error -- canvas-confetti has no type declarations
import confetti from "canvas-confetti";
import { Skeleton } from "@/components/ui/skeleton";

import { agentNodeTypes } from "./agent-node";
import { animatedEdgeTypes } from "./animated-edge";
import { getLayoutedElements } from "./use-graph-layout";
import { AgentDetailPanel } from "./agent-detail-panel";
import {
  mapPipelineToGraph,
  type AgentNodeData,
} from "@/lib/pipeline/graph-mapper";
import { useBroadcast } from "@/lib/supabase/broadcast-client";
import type { StepUpdatePayload } from "@/lib/supabase/broadcast";
import type { PipelineStep } from "@/components/step-log-panel";

// ---------------------------------------------------------------------------
// Module-level type registrations (MUST be outside component for React Flow)
// ---------------------------------------------------------------------------

const nodeTypes = { ...agentNodeTypes };
const edgeTypes = { ...animatedEdgeTypes };

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface SwarmGraphProps {
  runId: string;
  steps: PipelineStep[];
  runStatus: string;
}

// ---------------------------------------------------------------------------
// Empty state components
// ---------------------------------------------------------------------------

function EmptyState({ runStatus }: { runStatus: string }) {
  if (runStatus === "running") {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-4">
        <div className="flex gap-3">
          <Skeleton className="h-20 w-44 rounded-lg" />
          <Skeleton className="h-20 w-44 rounded-lg" />
          <Skeleton className="h-20 w-44 rounded-lg" />
        </div>
        <p className="text-sm text-muted-foreground">Building swarm...</p>
      </div>
    );
  }

  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 py-12">
      <p className="text-sm font-semibold">Waiting for pipeline to start</p>
      <p className="text-sm text-muted-foreground">
        The agent graph will appear as the pipeline designs your swarm.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Celebration overlay
// ---------------------------------------------------------------------------

function CelebrationOverlay({
  agentCount,
  visible,
}: {
  agentCount: number;
  visible: boolean;
}) {
  return (
    <div
      className={`absolute inset-0 z-50 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm transition-opacity duration-400 ${
        visible ? "opacity-100" : "opacity-0 pointer-events-none"
      }`}
    >
      <p className="text-2xl font-semibold">Pipeline Complete</p>
      <p className="text-sm text-muted-foreground mt-2">
        {agentCount} agents designed
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Inner component (needs useReactFlow context)
// ---------------------------------------------------------------------------

function SwarmGraphInner({ runId, steps, runStatus }: SwarmGraphProps) {
  const { fitView } = useReactFlow();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedAgent, setSelectedAgent] = useState<AgentNodeData | null>(
    null
  );
  const [detailOpen, setDetailOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const hasCompleteCelebrated = useRef(false);
  const prevRunStatus = useRef(runStatus);

  // -----------------------------------------------------------------------
  // Initialize graph from steps
  // -----------------------------------------------------------------------

  useEffect(() => {
    const graphData = mapPipelineToGraph(steps, runStatus);

    if (graphData.nodes.length === 0) {
      setNodes([]);
      setEdges([]);
      return;
    }

    const { nodes: layoutedNodes, edges: layoutedEdges } =
      getLayoutedElements(
        graphData.nodes as unknown as Node[],
        graphData.edges as unknown as Edge[],
        "TB"
      );

    setNodes(layoutedNodes);
    setEdges(layoutedEdges);

    // Fit view after React Flow renders the new nodes
    const timeout = setTimeout(() => {
      fitView({ padding: 0.2, duration: 500 });
    }, 100);

    return () => clearTimeout(timeout);
  }, [steps, runStatus, setNodes, setEdges, fitView]);

  // -----------------------------------------------------------------------
  // Celebration on completion
  // -----------------------------------------------------------------------

  useEffect(() => {
    if (
      runStatus === "complete" &&
      prevRunStatus.current !== "complete" &&
      !hasCompleteCelebrated.current
    ) {
      hasCompleteCelebrated.current = true;

      // Fire confetti from both sides
      confetti({
        angle: 60,
        spread: 55,
        origin: { x: 0, y: 0.7 },
        particleCount: 100,
        zIndex: 9999,
      });
      confetti({
        angle: 120,
        spread: 55,
        origin: { x: 1, y: 0.7 },
        particleCount: 100,
        zIndex: 9999,
      });

      // Show celebration overlay
      setShowCelebration(true);

      // Auto-dismiss after 3 seconds
      const timeout = setTimeout(() => {
        setShowCelebration(false);
      }, 3000);

      return () => clearTimeout(timeout);
    }

    prevRunStatus.current = runStatus;
  }, [runStatus]);

  // -----------------------------------------------------------------------
  // Broadcast subscription for live updates
  // -----------------------------------------------------------------------

  const handleStepUpdate = useCallback(
    (payload: StepUpdatePayload) => {
      // Update node statuses based on step update
      setNodes((currentNodes) => {
        if (currentNodes.length === 0) return currentNodes;

        // If run is complete, mark all nodes complete
        if (payload.runStatus === "complete") {
          return currentNodes.map((node) => ({
            ...node,
            data: { ...node.data, status: "complete" },
          }));
        }

        // Map step name to node by matching
        const normalizedStep = payload.stepName
          .toLowerCase()
          .replace(/[-_]/g, " ");

        return currentNodes.map((node) => {
          const normalizedNode = (node.data as unknown as AgentNodeData).name
            .toLowerCase()
            .replace(/[-_]/g, " ");

          if (
            normalizedStep.includes(normalizedNode) ||
            normalizedNode.includes(normalizedStep)
          ) {
            return {
              ...node,
              data: { ...node.data, status: payload.status },
            };
          }
          return node;
        });
      });

      // Update edge animation: animate edges connected to running nodes
      setEdges((currentEdges) =>
        currentEdges.map((edge) => ({
          ...edge,
          data: {
            ...edge.data,
            animated: payload.status === "running",
            status:
              payload.runStatus === "complete" ? "complete" : edge.data?.status,
          },
        }))
      );

      // Check for run completion to trigger celebration
      if (payload.runStatus === "complete") {
        // Celebration is handled by the runStatus useEffect
      }
    },
    [setNodes, setEdges]
  );

  useBroadcast<StepUpdatePayload>(
    `run:${runId}`,
    "step-update",
    handleStepUpdate
  );

  // -----------------------------------------------------------------------
  // Node click handler
  // -----------------------------------------------------------------------

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      setSelectedAgent(node.data as unknown as AgentNodeData);
      setDetailOpen(true);
    },
    []
  );

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <div className="relative h-full w-full">
      {nodes.length === 0 ? (
        <EmptyState runStatus={runStatus} />
      ) : (
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodeClick={handleNodeClick}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.5}
          maxZoom={2}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
        </ReactFlow>
      )}

      {/* Celebration overlay */}
      <CelebrationOverlay
        agentCount={nodes.length}
        visible={showCelebration}
      />

      {/* Agent detail panel */}
      <AgentDetailPanel
        agent={selectedAgent}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Public export: wraps inner component in ReactFlowProvider
// ---------------------------------------------------------------------------

export function SwarmGraph(props: SwarmGraphProps) {
  return (
    <ReactFlowProvider>
      <SwarmGraphInner {...props} />
    </ReactFlowProvider>
  );
}
