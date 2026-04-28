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

export type MailboxOverride = "block" | "force_promote";

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

export interface ClassifierRuleEvaluation {
  id: string;
  swarm_type: string;
  rule_key: string;
  n: number;
  agree: number;
  ci_lo: number;
  action: EvaluationAction;
  evaluated_at: string;
}

export interface ClassifierRuleMailboxOverride {
  id: string;
  swarm_type: string;
  rule_key: string;
  source_mailbox: string;
  override: MailboxOverride;
  set_by: string | null;
  set_at: string;
}
