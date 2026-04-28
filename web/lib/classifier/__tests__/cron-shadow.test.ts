// Phase 60-00 (D-19). Shadow-mode cron behaviour. Real assertions arrive in 60-03.

import { describe, it } from "vitest";

describe("D-19: classifier-promotion-cron shadow vs live mode", () => {
  it.todo("CLASSIFIER_CRON_MUTATE !== 'true' -> writes evaluation row but DOES NOT update classifier_rules.status");
  it.todo("CLASSIFIER_CRON_MUTATE === 'true' -> updates classifier_rules.status when gates pass");
  it.todo("shadow run records action='shadow_would_promote' for rules crossing the promotion gate");
  it.todo("shadow run records action='shadow_would_demote' for rules dropping below 0.92");
  it.todo("ON CONFLICT (swarm_type, rule_key, evaluated_at::date) DO UPDATE -- same-day re-trigger is idempotent");
});
