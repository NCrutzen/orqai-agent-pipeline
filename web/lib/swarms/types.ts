// Phase 56.7-01 (D-00, D-01, D-03). Shared types for the swarm registry.
// Mirrored to the public.swarms / public.swarm_categories tables created in
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

// One row in public.swarms.
export interface SwarmRow {
  swarm_type: string;
  display_name: string;
  description: string | null;
  review_route: string;
  source_table: string;
  enabled: boolean;
  ui_config: SwarmUiConfig;
  side_effects: Record<string, unknown> | null;
}

// One row in public.swarm_categories.
export interface SwarmCategoryRow {
  swarm_type: string;
  category_key: string;
  display_label: string;
  outlook_label: string | null; // D-11: nullable
  action: SwarmAction;
  swarm_dispatch: string | null; // D-02: Inngest event name when action='swarm_dispatch'
  display_order: number;
  enabled: boolean;
}
