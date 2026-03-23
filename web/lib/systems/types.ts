// Integration method values matching DB CHECK constraint
export type IntegrationMethod = "api" | "browser-automation" | "knowledge-base" | "manual";

// Automation task status values matching DB CHECK constraint
export type AutomationTaskStatus = "pending" | "uploading" | "analyzing" | "reviewing" | "confirmed" | "failed" | "skipped";

// System (mirrors systems table)
export interface System {
  id: string;
  name: string;
  integration_method: IntegrationMethod;
  url: string | null;
  auth_notes: string | null;
  notes: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// System with linked project count (for list display)
export interface SystemWithLinks extends System {
  linked_project_count: number;
}

// System-project link (mirrors system_project_links table)
export interface SystemProjectLink {
  system_id: string;
  project_id: string;
  linked_at: string;
}

// Automation task (mirrors automation_tasks table)
export interface AutomationTask {
  id: string;
  run_id: string;
  agent_name: string;
  system_name: string;
  system_id: string | null;
  detected_reason: string | null;
  status: AutomationTaskStatus;
  sop_text: string | null;
  analysis_result: AnalysisResult | null;
  confirmed_steps: ConfirmedStep[] | null;
  created_at: string;
  updated_at: string;
}

// Individual step identified by AI vision analysis
export interface AnalysisStep {
  stepNumber: number;
  action: string;
  targetElement: string;
  expectedResult: string;
  screenshotRef: string;
  boundingBox?: { x: number; y: number; width: number; height: number };
  confidence: number;
}

// Full analysis result from AI vision
export interface AnalysisResult {
  steps: AnalysisStep[];
  missingScreenshots: string[];
  warnings: string[];
}

// User-confirmed step (after review)
export interface ConfirmedStep {
  stepNumber: number;
  action: string;
  targetElement: string;
  expectedResult: string;
  screenshotRef: string;
  confirmed: boolean;
  userCorrection?: string;
}

// Element annotation overlay data (for CSS overlays on screenshots)
export interface ElementAnnotation {
  stepNumber: number;
  elementType: string;
  label: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  confidence: number;
}

// Terminal entry types (used by terminal panel in Plan 02)
export type TerminalEntryType = "status" | "prompt" | "upload" | "approval" | "annotation-review" | "user-input";

// Terminal entry (card-based log entry in terminal panel)
export interface TerminalEntry {
  id: string;
  type: TerminalEntryType;
  timestamp: string;
  stepName?: string;
  displayName?: string;
  status?: "pending" | "running" | "complete" | "failed" | "skipped" | "waiting" | "uploading" | "analyzing" | "reviewing";
  content: string;
  metadata?: Record<string, unknown>;
}
