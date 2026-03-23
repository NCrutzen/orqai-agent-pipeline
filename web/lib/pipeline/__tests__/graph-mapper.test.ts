import { describe, it } from "vitest";

describe("parseArchitectOutput", () => {
  it.todo("extracts agent names and roles from architect markdown output");
  it.todo("returns empty array for empty or malformed output");
  it.todo("sets default status to idle for all parsed agents");
  it.todo("extracts tool lists when present in output");
});

describe("mapPipelineToGraph", () => {
  it.todo("creates nodes for each agent from architect step result");
  it.todo("creates hub-spoke edges from orchestrator to all other nodes");
  it.todo("sets all nodes to complete when run status is complete");
  it.todo("sets orchestrator to running when run status is running");
  it.todo("returns empty nodes/edges when no architect output exists");
  it.todo("sets initial positions to {x:0, y:0} for dagre layout");
});

describe("mapStepToNodeStatus", () => {
  it.todo("updates node status based on step name and status");
  it.todo("returns unchanged nodes when step name does not match any node");
});
