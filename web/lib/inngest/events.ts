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

  /**
   * Phase 64 SAFE-01 / SAFE-02 / SAFE-03 — Stage 0 Input Safety.
   *
   * Emitted by the synchronous ingest route for every inbound email that
   * would otherwise be fed to an LLM (the unknown bucket). Consumed by
   * `stage-0/safety-worker`, which runs the regex screen + LLM verdict
   * + per-invocation budget guard before forwarding to the classifier.
   *
   * Naming choice (RESEARCH Open Question 2): `stage-0/email.received`
   * deliberately distinct from the legacy `debtor/email.received` triage
   * event so the two pipelines don't collide.
   *
   * `safety_overridden` (Pitfall 5): operator-driven re-emit (Plan 05) sets
   * this true to short-circuit Stage 0. The ingest route NEVER sets it.
   */
  "stage-0/email.received": {
    data: {
      automation_run_id: string;
      email_id: string;
      message_id: string;
      source_mailbox: string;
      subject: string;
      body_text: string;
      safety_overridden?: boolean;
    };
  };

  /**
   * Phase 64 BUDG-01 (D-13) — first-class per-run budget breach event.
   *
   * Emitted by `stage-0/safety-worker` when `budget.check()` returns
   * `breached: true`. Consumed by `stage-0/budget-breach-handler`, which
   * marks the originating run failed and files a Kanban human-review row.
   *
   * Both functions register `retries: 0` so Inngest auto-retry never
   * amplifies cost on a breach (Pitfall 1). Breach is data, not exception.
   */
  "pipeline/budget_breached": {
    data: {
      automation_run_id: string;
      email_id: string;
      budget: { cost_cents: number; token_count: number };
      reason: string;
    };
  };

  /**
   * Phase 64 — handoff from Stage 0 to Stage 1 (regex classifier).
   * Emitted by `stage-0/safety-worker` ONLY when verdict='safe' (or
   * when `safety_overridden=true`). Stage 1 worker subscribes via the
   * existing classifier pipeline. This event is the single seam across
   * the Stage 0 → Stage 1 trust boundary.
   */
  "classifier/screen.requested": {
    data: {
      automation_run_id: string;
      email_id: string;
      message_id: string;
      source_mailbox: string;
      subject: string;
      body_text: string;
      safety_overridden?: boolean;
    };
  };

  // Debtor email swarm — triage (phase 1) / Phase 65 coordinator (in-place rewrite per D-10).
  // Optional run_id / automation_run_id / budget_run_id / agent_run_id added in Phase 65 to
  // carry the Stage 0 budget envelope and the coordinator_runs row identifier through to
  // the new dispatch path. Existing callers that don't set them stay backwards-compatible.
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
      // Phase 65 additions (D-10):
      /** Coordinator-run identifier — primary key of public.coordinator_runs. */
      run_id?: string;
      /** Cross-swarm Bulk Review row identifier. */
      automation_run_id?: string;
      /** Stage 0 budget envelope identifier (Phase 64 D-15). */
      budget_run_id?: string;
      /** public.agent_runs.id pre-created by upstream emitter; coordinator merges
       *  intent_first_pass into tool_outputs against this id when present. */
      agent_run_id?: string;
    };
  };

  // Phase 65 (D-10) — coordinator → orchestrator handoff. Plan 04 builds the
  // listener; Plan 03 emits this event when the escalation gate returns
  // orchestrator. Carries the full ranked-intent array so the planner doesn't
  // need to re-classify.
  "debtor-email/orchestrator.requested": {
    data: {
      run_id: string;
      email_id: string;
      automation_run_id?: string;
      ranked: Array<{
        intent: string;
        confidence: "low" | "medium" | "high";
        document_reference: string | null;
        sub_type: string | null;
        reasoning: string;
      }>;
      language: "nl" | "en" | "de" | "fr";
      urgency: "low" | "normal" | "high";
      escalation_reason:
        | "low_confidence"
        | "high_intent_count"
        | "requires_orchestration_flag";
      budget_run_id?: string;
      swarm_type: string;
    };
  };

  // Phase 65 — orchestrator → synthesis handoff. Plan 04 emits; Plan 04 listens.
  // Listed here so events.ts is the single source of truth for the Phase 65 taxonomy.
  "debtor-email/synthesis.requested": {
    data: {
      run_id: string;
      email_id: string;
      automation_run_id?: string;
      swarm_type: string;
    };
  };

  // Phase 65 — per-intent dispatch events emitted by the coordinator's
  // single-shot fast-path (CORD-04). The actual event name is read from
  // public.swarm_categories.swarm_dispatch (registry-driven dispatch — same
  // idiom as classifier-verdict-worker:149-176). These typed entries make
  // them well-known names so downstream Plan 04+ handlers can declare them
  // statically. Payload shape mirrors the orchestrator event minus the
  // ranked array (single intent decided by ranked[0]).
  "debtor-email/copy_document_request.requested": {
    data: {
      run_id: string;
      email_id: string;
      automation_run_id?: string;
      intent: "copy_document_request";
      ranked: Array<{
        intent: string;
        confidence: "low" | "medium" | "high";
        document_reference: string | null;
        sub_type: string | null;
        reasoning: string;
      }>;
      budget_run_id?: string;
      swarm_type: string;
    };
  };
  "debtor-email/payment_dispute.requested": {
    data: {
      run_id: string;
      email_id: string;
      automation_run_id?: string;
      intent: "payment_dispute";
      ranked: Array<unknown>;
      budget_run_id?: string;
      swarm_type: string;
    };
  };
  "debtor-email/address_change.requested": {
    data: {
      run_id: string;
      email_id: string;
      automation_run_id?: string;
      intent: "address_change";
      ranked: Array<unknown>;
      budget_run_id?: string;
      swarm_type: string;
    };
  };
  "debtor-email/peppol_request.requested": {
    data: {
      run_id: string;
      email_id: string;
      automation_run_id?: string;
      intent: "peppol_request";
      ranked: Array<unknown>;
      budget_run_id?: string;
      swarm_type: string;
    };
  };
  "debtor-email/credit_request.requested": {
    data: {
      run_id: string;
      email_id: string;
      automation_run_id?: string;
      intent: "credit_request";
      ranked: Array<unknown>;
      budget_run_id?: string;
      swarm_type: string;
    };
  };
  "debtor-email/contract_inquiry.requested": {
    data: {
      run_id: string;
      email_id: string;
      automation_run_id?: string;
      intent: "contract_inquiry";
      ranked: Array<unknown>;
      budget_run_id?: string;
      swarm_type: string;
    };
  };
  "debtor-email/general_inquiry.requested": {
    data: {
      run_id: string;
      email_id: string;
      automation_run_id?: string;
      intent: "general_inquiry";
      ranked: Array<unknown>;
      budget_run_id?: string;
      swarm_type: string;
    };
  };
  "debtor-email/other.requested": {
    data: {
      run_id: string;
      email_id: string;
      automation_run_id?: string;
      intent: "other";
      ranked: Array<unknown>;
      budget_run_id?: string;
      swarm_type: string;
    };
  };
};
