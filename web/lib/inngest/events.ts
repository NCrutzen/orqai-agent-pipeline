/**
 * Typed Inngest event definitions for the pipeline engine and infrastructure.
 */
export type Events = {
  "pipeline/run.started": {
    data: {
      runId: string;
      projectId: string;
      useCase: string;
      userId: string;
      resumeFromStep?: string;
    };
  };
  "pipeline/approval.decided": {
    data: {
      approvalId: string;
      runId: string;
      decision: "approved" | "rejected";
      decidedBy: string;
      comment: string | null;
    };
  };
  "pipeline/review.responded": {
    data: {
      runId: string;
      stepName: string;
      decision: "confirmed" | "feedback";
      feedback: string | null;
    };
  };
  "infrastructure/health-check.requested": {
    data: {
      requestedBy: string;
    };
  };

  // Conversational pipeline events (Phase 37.1)
  "pipeline/chat.message": {
    data: {
      runId: string;
      message: string;
      userId: string;
    };
  };
  /** @deprecated Use pipeline/chat.message instead */
  "pipeline/discussion.responded": {
    data: {
      runId: string;
      message: string;
      turnIndex: number;
    };
  };

  // Automation HITL events (Phase 40)
  "automation/sop.uploaded": {
    data: {
      runId: string;
      taskId: string;
      sopText: string;
      screenshotPaths: string[];
    };
  };
  "automation/annotation.confirmed": {
    data: {
      runId: string;
      taskId: string;
      confirmedSteps: Array<{
        stepNumber: number;
        action: string;
        targetElement: string;
        expectedResult: string;
        screenshotRef: string;
        confirmed: boolean;
        userCorrection?: string;
      }>;
    };
  };

  // Analytics collection events (Phase 44)
  "analytics/orqai-collect.completed": {
    data: {
      snapshotId: string;
      collectedAt: string;
    };
  };
  "analytics/zapier-scrape.completed": {
    data: {
      snapshotId: string;
      validationStatus: "valid" | "suspicious" | "failed";
      scrapedAt: string;
    };
  };
};
