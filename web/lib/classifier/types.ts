// Phase 60-00 (D-05, D-06, D-07, D-23). Cross-swarm rules engine type contract.
// Mirrors columns of public.classifier_rules / public.classifier_rule_evaluations /
// public.classifier_rules_mailbox_overrides defined in supabase/migrations/20260428_*.sql.

export type RuleKind = "regex" | "agent_intent";

export type RuleStatus = "candidate" | "promoted" | "demoted" | "manual_block";

export type EvaluationAction =
  | "no_change"
  | "promoted"
  | "demoted"
  | "shadow_would_promote"
  | "shadow_would_demote";

export interface ClassifierRule {
  id: string;
  swarm_type: string;
  rule_key: string;
  kind: RuleKind;
  status: RuleStatus;
  n: number;
  agree: number;
  ci_lo: number | null;
  last_evaluated: string | null;
  promoted_at: string | null;
  last_demoted_at: string | null;
  notes: string | null;
}

