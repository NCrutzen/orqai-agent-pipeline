/**
 * Typed Inngest event definitions for the pipeline engine and infrastructure.
 */
import type { SignalWeights } from "@/lib/email-behavior/signal-derive";

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
      // Phase 111 WR-02: rule_key/entity are OPTIONAL — the
      // classifier-screen-worker emit sites (emit-verdict-unknown /
      // emit-verdict) send neither. The consumer (classifier-verdict-worker)
      // never reads them. Marking optional makes the type match the wire
      // shape instead of silently lying about a required-field contract.
      rule_key?: string;
      decision: "approve" | "reject";
      message_id: string;
      source_mailbox: string;
      entity?: string | null;
      predicted_category: string;
      override_category?: string | null;
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

  // Sales email swarm — Stage 2 customer-resolver (Phase 114-04, Pitfall 6).
  // Same payload as the debtor event; emitted by classifier-verdict-worker for
  // the sales 'unknown' bucket (swarm_dispatch seeded in migration 20260604b).
  // The stage-2-customer-resolver worker listens on BOTH this and the debtor
  // event (trigger array) and routes by registry data (resolution_config).
  "sales-email/stage-2.customer-resolve.requested": {
    data: {
      automation_run_id: string;
      swarm_type: string;
      category_key: string;
      message_id: string;
      source_mailbox: string;
    };
  };

  // Sales email swarm — Phase 116-04 attachment-extraction funnel step (D-01/D-02).
  // The sales 'unknown' swarm_dispatch was rewired (migration 20260605c) from the
  // Stage 2 event above to THIS event, so classifier-verdict-worker fires the
  // stage-1_5-attachment-extractor instead of Stage 2 directly. The extractor
  // runs registry-gated extraction over the captured 'pending' attachments, then
  // re-emits the registry stage2_dispatch_event (the Stage 2 event above) — a
  // transparent interposition. Same payload as the Stage 2 event it precedes.
  "sales-email/attachments.extract.requested": {
    data: {
      automation_run_id: string;
      swarm_type: string;
      category_key: string;
      message_id: string;
      source_mailbox: string;
    };
  };

  // Sales email swarm — Phase 116-06 attachment-metadata BACKFILL (SC-4 /
  // ATTACH-04). Manual trigger only (CLAUDE.md cron-disable pattern). Iterates
  // the already-ingested corpus by source_id, writes attachment metadata rows
  // for ALL mails (closes the has_attachments=false blind spot), and runs
  // content extraction ONLY for the Stage-1-survivor slice (D-12) via the shared
  // Plan 04 extractEmailAttachments helper. dry_run=true → counts only, writes
  // nothing. Fail-loud hard cap + bounded batches + 404→source_gone fail-soft.
  "sales-email/attachments.backfill.run": {
    data: {
      dry_run?: boolean;
      limit?: number;
      batch_size?: number;
      cap?: number;
      since?: string;
      until?: string;
      mailbox?: string;
    };
  };

  // Debtor email swarm — attachment-metadata + extraction BACKFILL (V9.5 baseline
  // lever). Sibling of sales-email/attachments.backfill.run, debtor-scoped: loops
  // the debtor mailboxes, captures metadata for Stage-1 SURVIVORS (mail with a
  // debtor.email_labels row → reached Stage 2), and extracts attachment text via
  // the shared Plan 04 helper. Seeds the corpus the live Stage-1.5 extractor could
  // not (capture was globally broken until the listAttachments @odata.type fix).
  // Manual trigger only (CLAUDE.md cron-disable). dry_run=true → counts only.
  "debtor-email/attachments.backfill.run": {
    data: {
      dry_run?: boolean;
      limit?: number;
      batch_size?: number;
      cap?: number;
      since?: string;
      until?: string;
      mailboxes?: string[];
    };
  };

  // Cross-swarm — DELAYED attachment re-capture. Fixes the ingest-moment Graph
  // indexing race: a freshly-arrived attachment is often not yet indexed when the
  // ingest route runs (seconds after arrival), so getMessageMeta.hasAttachments is
  // false and ingest-time captureAttachmentMetadata seeds nothing. The ingest route
  // emits this event when hasAttachments was false; the handler sleeps for Graph to
  // index, re-fetches the (now-correct) flag, and re-runs capture (idempotent
  // upsert on email_id,attachment_id). swarm_type in payload (swarm-agnostic).
  "pipeline/attachments.capture.retry": {
    data: {
      swarm_type: string;
      mailbox: string;
      message_id: string;
      email_id: string;
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

  // Canonical CROSS-SWARM Stage 2→3 hand-off (replaces the unsupported
  // `*/coordinator.requested` glob). Every ranked-intent swarm's Stage 2
  // producer emits THIS one event with `swarm_type` in the payload; the shared
  // coordinator triggers on it and derives the swarm from `data.swarm_type`
  // (NOT the event name). A new ranked-intent swarm needs ZERO coordinator /
  // trigger / events.ts changes — it just emits this same event. Swarms with a
  // divergent Stage-3 contract (e.g. support-tickets: ticket-completeness +
  // clarification) keep their own event + coordinator.
  "pipeline/coordinator.requested": {
    data: {
      swarm_type: string; // REQUIRED — the routing discriminator (no event-name fallback)
      email_id: string;
      automation_run_id?: string;
      run_id?: string;
      budget_run_id?: string;
      agent_run_id?: string;
      entity?: string | null;
      entity_brand?: string | null;
      context_version?: number;
      subject: string;
      body_text: string;
      sender_email: string;
      sender_domain?: string;
      mailbox: string;
      received_at: string;
      graph_message_id?: string;
      customer_id?: string | null;
      customer_account_id?: string | null;
      customer_name?: string | null;
    };
  };

  // Canonical CROSS-SWARM Stage 3→3.5 hand-off (replaces the unsupported
  // `*/predicted` glob). The shared coordinator emits this with `swarm_type`
  // in the payload; the Stage 3.5 dispatcher triggers on it and derives the
  // swarm from `data.swarm_type`.
  "pipeline/predicted": {
    data: {
      swarm_type: string; // REQUIRED
      email_id: string;
      run_id?: string;
      agent_run_id?: string;
      automation_run_id?: string | null;
      budget_run_id?: string | null;
      ranked: Array<{ intent: string; confidence: string }>;
      language?: string;
      urgency?: string;
      entity?: unknown;
    };
  };

  // Phase 117 Plan 02 (OUTLOOK-CAT-01..05, D-2) — swarm-agnostic intent→Outlook
  // category WRITE request. Emitted by the SHARED coordinator on EVERY Stage-3
  // verdict that carries a top-1 intent (both the OPEN and the routing-GATED/held
  // path — the category WRITE gate `stage_3_intent_label` is independent of the
  // routing gate). Carries `swarm_type` as the only discriminator (data, not a
  // literal). Consumed by the shared `stage3IntentLabelWorker`, which writes
  // `AI: <intent_key>` onto the source Outlook message behind isStageBlocked(
  // swarm, "stage_3_intent_label") — idempotent + never-clobbering. A second
  // Outlook swarm emits THIS same event through the same code path (generality).
  "pipeline/intent-label.requested": {
    data: {
      swarm_type: string; // REQUIRED — the routing discriminator (no event-name fallback)
      email_id: string;
      intent_key: string; // Stage-3 ranked[0].intent
      source_mailbox?: string | null;
      run_id?: string;
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
  // Phase 2 support-tickets Stage 2 enrichment — emitted by the support-tickets
  // ingest route AFTER the Stage 0/1 pipeline_events rows are written. Consumed
  // by stage2SupportTicketsEnrichment (Plan 02-02 baseline, extended by Plans
  // 02-03..02-05). The locked event-name contract (renames are a breaking
  // change across Phase 2 plans).
  "support-tickets/stage-2.requested": {
    data: {
      support_ticket_id: string; // UUID — public.support_tickets.id (PK)
      submission_id: string; // UUID — support_tickets.submission_id (= pipeline_events.email_id handle)
      external_task_id: string; // text — upstream tracker id (ClickUp etc.)
      attempt: number; // support_tickets.attempt (1 on first submission)
    };
  };

  // Phase 2 Plan 02-05 — Stage 2 → Stage 3 handoff. Emitted by
  // stage2SupportTicketsEnrichment as the FINAL step.run() after the
  // canonical stage=2 pipeline_events row is durably written (T-02-29
  // mitigation). Phase 3 owns the listener.
  "support-tickets/stage-3.coordinator.requested": {
    data: {
      support_ticket_id: string;
      submission_id: string;
    };
  };

  // Phase 3 Plan 03-03 — Stage 3 → Stage 4 handoff. Emitted by
  // stage3SupportTicketsCoordinator on the happy-path decisions
  // (`stage_3_coordinator`, `stage_3_coordinator_invariant_violated`,
  // `stage_3_coordinator_hallucinated_intent`). NOT fired on quarantine /
  // cost-ceiling / failed paths. Phase 4 owns the listener.
  "support-tickets/stage-4.handler.requested": {
    data: {
      support_ticket_id: string;
      submission_id: string;
      chosen_intent:
        | "clarification-needed"
        | "duplicate"
        | "info-answer"
        | "clickup-escalate"
        | "vendor-draft";
      completeness_verdict: "complete" | "incomplete";
    };
  };

  // Phase 4 Plan 04-02 — per-handler events. Produced by the Stage 4
  // dispatcher (stage-4-dispatcher.ts) after registry-driven fanout.
  // Each event carries the same Stage4HandlerPayload — the handler owns
  // the stage=4 pipeline_events row. UNIQUE constraint on (email_id,
  // swarm_type, stage) means dispatcher and handler paths are mutually
  // exclusive: dispatcher only writes when NOT fanning out.
  "support-tickets/clarification-needed.requested": {
    data: {
      support_ticket_id: string;
      submission_id: string;
      chosen_intent:
        | "clarification-needed"
        | "duplicate"
        | "info-answer"
        | "clickup-escalate"
        | "vendor-draft";
      completeness_verdict: "complete" | "incomplete";
    };
  };
  "support-tickets/duplicate.requested": {
    data: {
      support_ticket_id: string;
      submission_id: string;
      chosen_intent:
        | "clarification-needed"
        | "duplicate"
        | "info-answer"
        | "clickup-escalate"
        | "vendor-draft";
      completeness_verdict: "complete" | "incomplete";
    };
  };
  "support-tickets/info-answer.requested": {
    data: {
      support_ticket_id: string;
      submission_id: string;
      chosen_intent:
        | "clarification-needed"
        | "duplicate"
        | "info-answer"
        | "clickup-escalate"
        | "vendor-draft";
      completeness_verdict: "complete" | "incomplete";
    };
  };
  "support-tickets/clickup-escalate.requested": {
    data: {
      support_ticket_id: string;
      submission_id: string;
      chosen_intent:
        | "clarification-needed"
        | "duplicate"
        | "info-answer"
        | "clickup-escalate"
        | "vendor-draft";
      completeness_verdict: "complete" | "incomplete";
    };
  };
  "support-tickets/vendor-draft.requested": {
    data: {
      support_ticket_id: string;
      submission_id: string;
      chosen_intent:
        | "clarification-needed"
        | "duplicate"
        | "info-answer"
        | "clickup-escalate"
        | "vendor-draft";
      completeness_verdict: "complete" | "incomplete";
    };
  };

  // Phase 5 Plan 05-02 (OUTBOUND-01) — inbound ClickUp webhook status change.
  // Emitted by the clickup-webhook route AFTER body-secret validation and
  // payload normalization. Consumed by the Plan 05-03 Inngest function which
  // owns the replay-safe support_tickets DB writes (step.run). The route is
  // purely validate-and-fan-out; it does NOT write to support_tickets directly.
  //
  // Payload contract:
  //   clickup_task_id  — normalized from task_id OR payload.task.id (ClickUp
  //                      varies this across webhook versions)
  //   event_type       — raw ClickUp event name (e.g. "taskStatusUpdated")
  //   history_items    — verbatim ClickUp history payload array; Plan 05-03
  //                      validates with zod before any DB write (T-05-02-02)
  //   received_at      — ISO timestamp stamped by the route (not ClickUp)
  "support-tickets/clickup-status.received": {
    data: {
      clickup_task_id: string;
      event_type: string; // raw ClickUp event name
      history_items: Array<Record<string, unknown>>; // verbatim ClickUp history payload
      received_at: string; // ISO, stamped by the route
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
  // Phase 111 Plan 03 (D-01) — one-shot Stage-1 noise retro-classification
  // trigger for the sales-email swarm. Side-Channel Isolation: handler writes
  // ONLY to stage_1_retro_runs; never to automation_runs / agent_runs /
  // pipeline_events; emits no downstream events.
  "sales-email/stage-1-retro-classify.requested": {
    data: {
      swarm_type: "sales-email";
      since: string;
      until: string;
      sample_limit?: number;
      run_id?: string;
      // Phase 111 WR-03: FIXED reference disposition for the would_archive
      // calibration signal. When provided, would_archive is computed against
      // this explicit set of category keys (deterministic regardless of the
      // live swarm_noise_categories.action flip apply order). When omitted,
      // the harness falls back to the LIVE action map and stamps that choice
      // in the run output so the evidence is still interpretable.
      archive_reference_keys?: string[];
    };
  };
  // Phase 113 Plan 03 (D-01, STAGE3-02) — one-shot Stage-3 intent retro-
  // classification trigger for the sales-email swarm. Re-runs the sales intent
  // agent over the post-Stage-1 corpus into stage_3_retro_runs (the discovery
  // surface the operator promotes a data-driven vocabulary from). Side-Channel
  // Isolation: handler writes ONLY to stage_3_retro_runs; never to
  // automation_runs / agent_runs / pipeline_events / coordinator_runs; emits no
  // downstream events. The `bootstrap` flag bypasses the R-04 cluster
  // precondition gate ONLY when sales swarm_intents is empty (the legitimate
  // empty-vocabulary first pass); a bootstrap call after seeding THROWS.
  "sales-email/retro-classify.requested": {
    data: {
      swarm_type: "sales-email";
      since: string;
      until: string;
      sample_limit?: number;
      run_id?: string;
      // Phase 113 — bounded bootstrap bypass of the cluster precondition gate.
      // Honored ONLY when sales swarm_intents count === 0 (the empty-cluster
      // chicken-and-egg first discovery pass). bootstrap=true after the
      // vocabulary is seeded REFUSES (throws). Rows written under a bootstrap
      // run are tagged run_type='bootstrap' in the ranked_intents JSONB.
      bootstrap?: boolean;
    };
  };
  // Phase 112 Plan 01 (CLEANUP-02) — one-shot Stage-1 noise BACKFILL sweeper
  // for the sales-email swarm. Ships INERT: mode defaults to 'report' (zero
  // Graph writes, zero pipeline_events/automation_runs inserts). 'canary' caps
  // auto-archives at `limit`; 'full' sweeps all. Auto-set is registry-derived
  // (action='categorize_archive' minus loopback); ambiguous → Bulk Review;
  // loopback skipped entirely (D-05/D-06). Idempotent on re-run (D-08).
  "sales-email/stage-1.backfill": {
    data: {
      mode?: "report" | "canary" | "full";
      // Auto-archive cap for mode='canary'.
      limit?: number;
      // Optional corpus window override (defaults to a 365-day lookback).
      since?: string;
      until?: string;
    };
  };
  // Phase 112.5 Plan 01 (SC-3) — one-shot READ-ONLY folder-convention report.
  // Counts the verkoop@smeba.nl corpus across inbox/archive/afgehandeld buckets
  // and returns an afgehandeld-vs-archive ratio. Side-Channel Isolation: the
  // handler writes to NO live table and emits no downstream events. Takes no
  // payload fields — the mailbox is pinned in the worker.
  "sales-email/folder-convention.requested": {
    data: Record<string, never>;
  };

  // Phase 112.5 Plan 04 (SC-1/SC-2) — registry-driven Outlook behaviour delta-sync.
  // Cron (business-hours) + this event drive the same worker. It iterates ALL
  // public.swarms rows with behavior_tracking_config.enabled=true (no hardcoded
  // swarm list), polls each tracked folder, extracts transitions, derives review
  // signals (incl. restore=correctie_false_positive via a swarm_type-scoped
  // pipeline_events stage-4 ledger join) and writes idempotently to
  // swarm_email_transitions + swarm_review_signals. The first run per folder is
  // a bootstrap (0 signals, only the deltaLink + folder-map persisted).
  // Optional data.swarm_type narrows the run to a single enabled swarm.
  "swarm/behavior-sync.requested": {
    data: {
      swarm_type?: string;
    };
  };
  // Phase 119: the orchestrator (swarm/behavior-sync) fans out ONE of these per
  // enabled (swarm × mailbox); the per-mailbox worker (swarm/behavior-sync.mailbox)
  // consumes exactly one. Lean ids-only payload (weights shared per swarm).
  "swarm/behavior-sync.mailbox": {
    data: {
      swarm_type: string;
      mailbox: string;
      weights?: SignalWeights;
    };
  };
};
