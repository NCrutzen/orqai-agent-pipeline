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
  // Prolius report automation
  "automation/prolius-report.triggered": {
    data: {
      triggeredBy: string;
      emailSubject?: string;
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
  // Phase 58: orqai-trace-sync converted from cron to event-only trigger
  // (Executive Dashboard development paused). Send this event to invoke
  // a manual sync run; no payload required.
  "analytics/orqai-trace-sync.run": {
    data: {
      triggeredBy?: string;
    };
  };

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

  // Heeren Oefeningen facturatie automation
  "automation/heeren-oefeningen.triggered": {
    data: {
      triggeredBy: string;
      billingOrderCode: string;
      billingOrderId: string;
      billingOrderLineId: string;
      billingItemId: string;
      courseId: string;
      // Fase 2 — vereist voor het aanmaken van nieuwe NXT order. Optioneel zodat
      // legacy Zapier payloads Fase 1 niet breken; Fase 2 skipt records zonder deze data.
      customerId?: string;
      siteId?: string;
      brandId?: string;
      quantity?: number;
      unitPrice?: number;
      orderTypeId?: string;
      description?: string;
      /** NXT environment — default "production" */
      environment?: "production" | "acceptance";
    };
  };
  // Heeren Oefeningen — maandelijkse facturatie cron (Fase 2)
  "automation/heeren-oefeningen.create-invoices": {
    data: {
      triggeredBy: string;
      forceRun?: boolean; // skip last-workday check
      environment?: "production" | "acceptance";
    };
  };

  // Dashboard aggregation events (Phase 45)
  "dashboard/aggregate.completed": {
    data: {
      snapshotId: string;
      healthScore: number;
    };
  };

  // Phase 60 — classifier whitelist-gate loop
  "classifier/backfill.run": {
    data: {
      triggeredBy?: string;
    };
  };
  // Phase 60-08 — corpus-driven backfill of classifier_rules.n/agree
  "classifier/corpus-backfill.run": {
    data: {
      triggeredBy?: string;
    };
  };
  // Phase 60-08 — sample hard-case rows into agent_runs review queue
  "classifier/spotcheck.queue": {
    data: {
      triggeredBy?: string;
      max_per_rule?: number;
    };
  };
  "classifier/verdict.recorded": {
    data: {
      automation_run_id: string;
      agent_run_id: string;
      swarm_type: string;
      rule_key: string;
      decision: "approve" | "reject";
      message_id: string;
      source_mailbox: string;
      entity: string;
      predicted_category: string;
      override_category?: string;
    };
  };

  // iController cleanup fan-out (dispatcher → shard worker)
  "icontroller/cleanup.shard.requested": {
    data: {
      workerIndex: number;
      rows: Array<{
        id: string;
        result: {
          stage: string;
          message_id: string;
          from: string;
          subject: string;
          received_at: string;
          icontroller?: string;
        };
      }>;
    };
  };

  // Uren controle automation
  // Supports two file delivery modes — exactly one of contentBase64 or downloadUrl must be set:
  //   downloadUrl: SharePoint pre-authenticated signed URL (simpler Zapier setup, no base64 step)
  //   contentBase64: raw base64 string (fallback)
  "automation/uren-controle.triggered": {
    data: {
      filename: string;
      contentBase64?: string;
      downloadUrl?: string;
      environment: "production" | "acceptance" | "test";
      triggeredBy: string;
      triggeredAt: string;
      sourceUrl?: string;
    };
  };

  // Debtor email swarm — label-resolver (Phase 56-02 wave 3, swarm_dispatch
  // target for category_key='unknown'). Routed by classifier-verdict-worker
  // when an email falls through the regex classifier into the unknown bucket.
  "debtor-email/label-resolve.requested": {
    data: {
      automation_run_id: string;
      swarm_type: string;
      category_key: string; // always 'unknown' today
      message_id: string;
      source_mailbox: string;
    };
  };

  // Debtor email swarm — invoice-copy handler (Phase 56-02 wave 3, swarm_dispatch
  // target for category_key='invoice_copy_request'). Resolves customer + fetches
  // PDF + creates iController draft via the Orq.ai copy-document body agent.
  "debtor-email/invoice-copy.requested": {
    data: {
      automation_run_id: string;
      swarm_type: string;
      category_key: string;
      message_id: string;
      source_mailbox: string;
    };
  };

  // Debtor email swarm — triage (phase 1)
  "debtor/email.received": {
    data: {
      email_id: string;
      /** Outlook Graph message-ID — needed to navigate the iController
       *  mail view when creating the reply-draft. Distinct from
       *  `email_id` (our internal Supabase UUID). */
      graph_message_id: string;
      subject: string;
      body_text: string;
      sender_email: string;
      sender_domain: string;
      sender_first_name?: string | null;
      mailbox: string;
      entity: "smeba" | "berki" | "sicli-noord" | "sicli-sud" | "smeba-fire";
      received_at: string;
    };
  };
};
