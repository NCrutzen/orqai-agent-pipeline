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
}

// Phase 68 — one row in public.swarm_intents. Composite PK (swarm_type, intent_key).
export interface SwarmIntentRow {
  swarm_type: string;
  intent_key: string;
  handler_agent_key: string | null;
  handler_event: string;
  requires_orchestration: boolean;
  created_at: string;
  updated_at: string;
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
