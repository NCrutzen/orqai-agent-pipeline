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

  // briefing-refresh converted from a 30-min cron to event-only trigger
  // (the cron was re-invoking swarm-briefing-agent and erroring on a localhost
  // dial). Send this event to force a manual refresh; no payload required.
  // Re-enable scheduled refresh = restore the cron line in briefing-refresh.ts.
  "analytics/briefing-refresh.run": {
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
      /** Kostenplaats — Companies.OrderReference uit NXT */
      orderReference?: string;
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

  // Phase 82.2 Plan 09 (D-03/D-04/D-05) — one-shot Stage 0 backfill.
  // Manually triggered via inngest.send({ name: 'pipeline.stage0.backfill', ... }).
  // Reads public.stage0_backfill_candidates(window_days) and writes a
  // pipeline_events.stage=0 row per gap with triggered_by='backfill'.
  // window_days defaults to 30; values >30 are clamped client-side and
  // server-side (Plan 03 RPC clamps to 30; D-05 cap).
  "pipeline.stage0.backfill": {
    data: {
      window_days?: number;
      triggeredBy?: string;
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
  // Phase 89 (Plan 03) — one-shot eager seed of llm:{cat}:high candidate
  // rows into classifier_rules for every (active swarm × enabled noise
  // category != 'unknown'). Idempotent via ON CONFLICT. Re-fire when a
  // new swarm or swarm_noise_categories row lands.
  "classifier/llm-rules-seed.run": {
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

  // Stage 1 iController noise-cleanup fan-out (dispatcher → shard worker).
  // Renamed in Phase 88.1 — see runbook for legacy event name.
  "debtor-email/stage-1.icontroller-cleanup.requested": {
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

  // Debtor email swarm — Stage 2 customer-resolver (formerly label-resolver,
  // renamed in Phase 88.1). Swarm-dispatch target for category_key='unknown';
  // routed by classifier-verdict-worker when the regex classifier falls
  // through into the unknown bucket.
  "debtor-email/stage-2.customer-resolve.requested": {
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
   * Naming choice (RESEARCH Open Question 2): `stage-0/email.received` is
   * deliberately scoped to Stage 0 so it can't be confused with downstream
   * Stage 2 → 3 seam events (e.g. `debtor-email/coordinator.requested`).
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
      // Phase 74 D-01 — required swarm_type so Stage 0 can thread it
      // through to classifier/screen.requested without a DB lookup.
      swarm_type: string;
      // Phase 74 D-02 — optional/nullable: sales-email has no entity concept.
      entity?: string | null;
      // Phase 82.2 Plan 07 D-A — fields threaded from ingest so the Stage 1
      // worker (post-Plan-06 thick worker) can write the iController-cleanup
      // audit row (result.from / result.subject / result.received_at) and
      // pipeline_events rows scoped to the right mailbox without an extra
      // DB lookup. mailbox_id mirrors automation_runs.mailbox_id (numeric
      // foreign-key per Phase 60-02 D-11).
      mailbox_id?: number | null;
      from?: string | null;
      fromName?: string | null;
      receivedAt?: string | null;
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
      // Phase 74 D-01 — required swarm_type so the Stage-1 classifier-screen
      // worker (Plan 04) can dispatch registry lookups per-swarm without a
      // round-trip to resolve it from automation_run_id.
      swarm_type: string;
      // Phase 74 D-02 — passthrough so Plan 04 can write pipeline_events
      // rows without re-deriving entity. Optional/nullable for sales-email.
      entity?: string | null;
      // Phase 82.2 Plan 07 D-A — passthrough fields from the ingest route
      // (via stage-0/email.received). The post-Plan-06 thick Stage 1 worker
      // owns auto-action audit row writes (which previously lived in
      // /ingest) and needs from/subject/received_at to populate the
      // iController-cleanup automation_runs.result jsonb. Sales-email may
      // omit these (no auto-action chain). Note: the Stage 1 regex itself
      // does NOT consume `from` (line 149-153 in classifier-screen-worker.ts
      // — auto_reply / OOO / payment patterns are subject + body driven).
      mailbox_id?: number | null;
      from?: string | null;
      fromName?: string | null;
      receivedAt?: string | null;
      safety_overridden?: boolean;
    };
  };

  /**
   * Phase 999.8 D-10 — Stage 1 confidence gate side-channel.
   *
   * Emitted by `classifier/screen-worker` when the LLM 2nd-pass produced a
   * non-`unknown` category at confidence `medium` or `low`. By construction
   * this event has NO subscriber: the verdict-worker is intentionally NOT
   * subscribed so the gated email stays at `automation_runs.status='predicted'`
   * with no Outlook side effects, surfacing in the Stage 1 row list for
   * human review (page.tsx:587 picks it up automatically).
   *
   * Mirrors the `debtor-email/synthesis.requested` declared-without-listener
   * precedent. A future learning-loop worker may subscribe; tangling defer
   * semantics onto `classifier/verdict.recorded` was rejected as a cleaner
   * separation (D-10).
   *
   * `agent_run_id` is nullable: when the LLM call errors and even the
   * failure-path `agent_runs` insert fails, the gate still fires with a
   * null reference so the audit trail in `pipeline_events` is the source
   * of truth for what happened.
   */
  "classifier/screen.requires_review": {
    data: {
      automation_run_id: string;
      agent_run_id: string | null;
      email_id: string;
      message_id: string;
      source_mailbox: string;
      swarm_type: string;
      entity?: string | null;
      llm_category_key: string;
      llm_confidence: "medium" | "low";
      final_category_key: string;
    };
  };

  /**
   * Phase 999.8 D-03 — high-confidence LLM 2nd-pass calibration drift signal.
   *
   * Emitted by labeling-flip-cron when the rolling-50 high-conf FP rate
   * exceeds the alarm threshold (>=5%). Audit row also written to
   * classifier_rule_evaluations for both warn (>=2%) and alarm (>=5%) tiers.
   *
   * Subscribers: NONE in Phase 999.8 (mirror D-10 "declared, no listener"
   * pattern — future learning-loop / on-call alerting worker can subscribe).
   */
  "classifier/calibration_drift.detected": {
    data: {
      swarm_type: string;
      source_mailbox: string;
      icontroller_mailbox_id: number;
      n_high_conf: number;
      fp_count: number;
      fp_rate: number;
      threshold: "warn" | "alarm";
      detected_at: string; // ISO timestamp, generated inside step.run
    };
  };

  // Debtor email swarm — Stage 3 coordinator trigger.
  // Emitted by classifier-label-resolver after Stage 2 closes; consumed by
  // the coordinator (Phase 66 wired Stage 2 → 3 here).
  // Carries the Stage 0 budget envelope (budget_run_id), the pre-created
  // agent_runs row (agent_run_id), and the Stage-2-resolved customer fields
  // (customer_account_id, customer_name) through to the coordinator.
  "debtor-email/coordinator.requested": {
    data: {
      email_id: string;
      automation_run_id?: string;
      run_id?: string;
      budget_run_id?: string;
      agent_run_id?: string;
      entity?: string | null;
      subject: string;
      body_text: string;
      sender_email: string;
      sender_domain?: string;
      mailbox: string;
      received_at: string;
      graph_message_id?: string;
      customer_account_id?: string | null;
      customer_name?: string | null;
    };
  };

  // Phase 67 (D-01, D-02, R-02) — Stage 2 side-effect: iController DOM tagging.
  // Emitted by classifier-label-resolver after the coordinator emit, gated on
  //   result.customer_account_id !== null
  //   AND labeling_settings.dry_run === false
  //   AND labeling_settings.icontroller_company !== null
  // Consumed by debtorEmailIcontrollerTagger (Plan 05). Non-blocking: tagger
  // catches all errors inline and returns ok:true; deferred state lives on
  // debtor.email_labels.icontroller_tag_status.
  //
  // Payload extends CONTEXT D-02 with sender_email/subject/received_at/
  // icontroller_mailbox_id (R-02) so the tagger can search-and-click without
  // a second email lookup. icontroller_message_url is the MAILBOX-LIST URL
  // (Option A from RESEARCH § URL Construction); the per-message msg_id is
  // unknown at dispatch time.
  // Renamed in Phase 88.1 — see runbook for legacy event name.
  "debtor-email/stage-2.icontroller-label.requested": {
    data: {
      email_label_id: string;
      email_id: string;
      automation_run_id: string;
      customer_account_id: string;
      customer_name: string | null;
      source_mailbox: string;
      icontroller_mailbox_id: number;
      icontroller_company: string | null;
      icontroller_message_url: string;
      entity: string | null;
      sender_email: string;
      subject: string;
      received_at: string;
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
  // public.swarm_noise_categories.swarm_dispatch (registry-driven dispatch — same
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

  // Phase 4 Plan 01 — patterns recommender manual-trigger event
  // (cron is daily 02:00 Amsterdam; this event lets operators / dev rerun
  // the same handler on demand without waiting for the cron tick).
  "patterns.cron.run": {
    data: {
      swarm_type?: string;
      dry_run?: boolean;
    };
  };
  // Phase 86 Plan 02 — manual refresh trigger for the intent-proposals cron.
  // Fired by the Plan 03 Bulk Review "Intent proposals" tab refresh button.
  // Debounced 5min server-side (see intent-proposals-refresh.ts).
  "intent-proposals.refresh": {
    data: {
      // Empty payload — refresh is over the canonical 30d window. Operator
      // identity is recorded via intent_proposal_views, not here.
      operator_id?: string;
    };
  };
  // Phase 87 Plan 04 — one-shot retro-classification trigger. Triggered by
  // the operator CLI `web/scripts/run-retro-classify.ts`. Side-Channel
  // Isolation: handler writes ONLY to stage_3_retro_runs +
  // intent_volume_baselines; never to agent_runs / coordinator_runs /
  // pipeline_events; never emits `<swarm>/predicted`.
  "debtor-email/retro-classify.requested": {
    data: {
      swarm_type: "debtor-email";
      since: string;
      until: string;
      sample_limit?: number;
      run_id?: string;
    };
  };
};
