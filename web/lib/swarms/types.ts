// Phase 56.7-01 (D-00, D-01, D-03). Shared types for the swarm registry.
// Mirrored to the public.swarms / public.swarm_noise_categories tables created in
// supabase/migrations/20260429b_swarm_registry.sql.

// D-01: literal union must match the DB CHECK constraint verbatim.
// Adding a value here requires both a migration AND updating exhaustive
// switches in the verdict-worker (Phase 56.7 Wave 2).
export type SwarmAction =
  | "categorize_archive"
  | "reject"
  | "manual_review"
  | "swarm_dispatch";

// D-03: shape of the swarms.ui_config jsonb column.
export interface SwarmUiConfig {
  tree_levels: string[];
  row_columns: { key: string; label: string; width: number }[];
  drawer_fields: string[];
  default_sort: string;
}

// Phase 68 — canonical context shape declaration. Stored as jsonb in
// swarms.canonical_context_shape; consumed by Stage 2→3 contract.
export interface CanonicalContextShape {
  version: string;
  fields: Record<
    string,
    {
      type: string;
      nullable?: boolean;
      enum?: string[];
      default?: unknown;
      description?: string;
      items?: unknown;
    }
  >;
}

// One row in public.swarms.
export interface SwarmRow {
  swarm_type: string;
  display_name: string;
  description: string | null;
  review_route: string;
  source_table: string;
  enabled: boolean;
  ui_config: SwarmUiConfig;
  // side_effects[] is an array of descriptors (Phase 68 R-01 — kind discriminator).
  // Typed loosely here; concrete union lives in web/lib/swarms/side-effects.ts so
  // this types module stays free of the trigger taxonomy.
  side_effects: unknown[] | null;
  // Phase 68 — registry-driven stage bindings. Nullable for legacy rows.
  stage1_regex_module: string | null;
  stage2_entity_resolver: string | null;
  stage3_coordinator_agent_key: string | null;
  canonical_context_shape: CanonicalContextShape | null;
  // Phase 69 (CANO-02, D-01) — entity_brand transitions from string[] (Phase 68
  // seed) to an array of BrandRegister metadata objects after migration
  // 20260505a_entity_brand_expansion.sql. The union below is the transition
  // shape; the brand-register loader (web/lib/swarms/brand-register.ts) is the
  // canonical reader and raises MalformedRegistryError when the legacy
  // string-array shape is still in place post-Wave-1.
  entity_brand: string[] | Record<string, unknown>[] | null;
  // Phase 84 D-03 — tenant mail domains for this swarm (jsonb array of
  // lowercase domain strings). Powers the own_outbound_invoice_loopback
  // Stage 1 rule (classifier-screen-worker.ts) and retires the Phase 83
  // TENANT_DOMAINS fallback stub in debtor-email-coordinator.ts.
  // Source of truth: public.swarms.tenant_domains (jsonb NOT NULL DEFAULT '[]').
  // Codegen mirror: web/lib/automations/debtor-email/coordinator/tenant-domains.generated.ts.
  tenant_domains: string[];
  // Phase 110 Plan 04 (D-10 / D-11) — per-stage dry-run governance map.
  // Source of truth: public.swarms.dry_run_config (jsonb NOT NULL DEFAULT '{}').
  // Read exclusively via web/lib/pipeline-gating/dry-run-gate. A flag value
  // TRUE = blocked (dry-run), FALSE = live, MISSING = blocked (fail-closed).
  // Optional in TS so pre-Phase-110 fixtures and rows pulled before the ALTER
  // remain assignable (same precedent as requires_orchestration?). The gate
  // helper treats null/undefined identically (fail-closed → blocked).
  dry_run_config?:
    | import("../pipeline-gating/dry-run-gate").DryRunConfig
    | null;
  // Phase 114 (RESL-03) — per-swarm Stage 2 resolution config (free-form jsonb,
  // NO codegen). Source of truth: public.swarms.resolution_config. Read by the
  // Stage 2 worker: when present (+ stage2_entity_resolver set), the worker
  // dispatches via loadStage2Resolver and writes the generic
  // email_pipeline.resolution_audit table. When null (legacy debtor row), the
  // worker keeps its resolveDebtor + debtor.email_labels path (behaviour-neutral).
  // Optional in TS so pre-Phase-114 fixtures and rows pulled before the seed
  // remain assignable. Typed loosely (the canonical shape lives in
  // web/lib/agentic-pipeline/resolve/config.ts as ResolutionConfig).
  resolution_config?: Record<string, unknown> | null;
  // Phase 116 (D-04) — per-swarm attachment ingest/extraction switches + caps.
  // Source of truth: public.swarms.attachment_config (jsonb NOT NULL DEFAULT
  // '{}'). Flag polarity: TRUE = ON. `capture` gates the ingest-time metadata
  // write (Plan 03); `extract` gates the post-Stage-1 content extraction (Plan
  // 04); `caps` carries global byte/page/char limits; `stage2_dispatch_event`
  // is the registry-derived Stage 2 trigger emitted after extraction. Read via
  // a swarm-agnostic switch (NO === 'sales'/'debtor' — SWARM-02). Optional in
  // TS so pre-Phase-116 fixtures and rows pulled before the ALTER remain
  // assignable; a missing/empty object reads as capture-off + extract-off.
  attachment_config?: AttachmentConfig | null;
  // Phase 130 WR-03 (REQ-6) — SHARED, swarm-agnostic Stage-1 block-rule
  // adoption pool: the set of shared block-rule keys this swarm has opted
  // into. Source of truth: public.swarms.stage1_shared_block_rules (text[]
  // NOT NULL DEFAULT '{}'). Reaches swarmRow via loadSwarm's select("*") —
  // same text[]-via-select("*") path as tenant_domains; NO codegen. The
  // classifier-screen-worker gates the actionable-token carve-out with
  // `?.includes('actionable_token')` (a swarm-agnostic membership check, NOT
  // a swarm_type literal). Optional in TS so pre-migration fixtures and rows
  // pulled before the ALTER remain assignable; a missing/empty array reads as
  // no adoption = behaviour-neutral.
  stage1_shared_block_rules?: string[];
}

// Phase 116 (D-04) — shape of public.swarms.attachment_config jsonb. All
// fields optional: a missing key reads as OFF / absent. `caps` keys are global
// guardrails (Plan 01 seed); free-form so adding a cap needs no codegen.
export interface AttachmentConfig {
  capture?: boolean;
  extract?: boolean;
  stage2_dispatch_event?: string;
  caps?: {
    max_size_bytes?: number;
    max_attachments_per_mail?: number;
    max_vision_pages?: number;
    max_extracted_chars?: number;
  };
}

// Phase 68 — one row in public.swarm_intents. Composite PK (swarm_type, intent_key).
export interface SwarmIntentRow {
  swarm_type: string;
  intent_key: string;
  handler_agent_key: string | null;
  handler_event: string;
  // Phase 76 — registry source-of-truth for Stage 4 handler registration.
  // 'registered' → handler exists, Stage 3 dispatches inngest.send.
  // 'placeholder' → no handler, Stage 3 writes Kanban human-lane row
  //   (automation_runs.status='pending', result.kanban_reason='no_handler').
  // Migration: supabase/migrations/20260507_phase76_swarm_intents_handler_status.sql
  handler_status: "registered" | "placeholder";
  requires_orchestration: boolean;
  created_at: string;
  updated_at: string;
}

// Phase 131 (ROUTE-01 / D-01) — one row in public.routing_destinations, the
// brand-aware destination registry for the Stage-3 router. One denormalized row
// per (swarm_type, destination_key, brand). target_mailbox is NULL for the
// `unrouted` sentinel. Mirrors the column projection the loader selects
// (loadRoutingDestinations); the full DB row also carries id/created_at/
// updated_at which the loader does not project.
export interface RoutingDestinationRow {
  destination_key: string; // the bucket (e.g. order_entry, verkoop, …, unrouted)
  brand: string; // 'smeba' | 'fire-control' | 'berki'
  target_mailbox: string | null; // NULL for the unrouted sentinel
  outlook_category: string | null; // ROUTE-08 ground-truth label name
  active: boolean;
}

// One row in public.swarm_noise_categories.
export interface SwarmNoiseCategoryRow {
  swarm_type: string;
  category_key: string;
  display_label: string;
  outlook_label: string | null; // D-11: nullable
  action: SwarmAction;
  swarm_dispatch: string | null; // D-02: Inngest event name when action='swarm_dispatch'
  display_order: number;
  enabled: boolean;
  // Phase 65 D-08 — escalation-gate flag. Set true to force a category to the
  // orchestrator path even when the coordinator returns a high-confidence
  // single-intent ranking. DB default false; optional in TS so legacy
  // (Phase 56.7) fixtures and registry rows pulled from rows that pre-date the
  // ALTER TABLE remain assignable. The escalation gate compares with `=== true`.
  // Migration:
  // supabase/migrations/20260501b_swarm_categories_requires_orchestration.sql
  requires_orchestration?: boolean;
}
