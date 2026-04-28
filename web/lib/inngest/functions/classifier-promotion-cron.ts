// Phase 60-02 stub for the classifier promotion cron. Real implementation
// lands in plan 60-03 (CI-lo evaluation, classifier_rule_evaluations writes,
// shadow-mode flag, demotion alerts).
//
// cron: TZ=Europe/Amsterdam 0 6 * * 1-5 — daily 06:00 Amsterdam, Mon-Fri (D-09)
// Single-line comment only — never put cron strings inside JSDoc per
// CLAUDE.md learning eb434cfd (the */N would close the comment).

import { inngest } from "@/lib/inngest/client";

export const classifierPromotionCron = inngest.createFunction(
  { id: "classifier/promotion-cron", retries: 2 },
  { cron: "TZ=Europe/Amsterdam 0 6 * * 1-5" },
  async ({ step }) => {
    return step.run("placeholder", async () => ({
      status: "stub",
      note: "implementation pending in plan 60-03",
    }));
  },
);
