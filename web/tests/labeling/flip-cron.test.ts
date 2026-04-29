// Phase 56-00 (D-24, D-25, D-26, D-30). Per-mailbox flip cron unit tests.
// Module skeleton from Task 3 — pickAction is a pure function; evaluateMailbox
// is unit-testable with a stubbed admin builder. Pitfall 3 N=49 rejection
// is the canonical test guard against accidental shouldPromote/shouldDemote
// reuse (which uses N>=30).

import { describe, it, expect, vi } from "vitest";

describe("flip-cron — pickAction (pure)", () => {
  it("rejects N=49 even at CI-lo=0.99 (Pitfall 3 — N>=50 inline, NOT shouldPromote N>=30)", async () => {
    const { pickAction } = await import(
      "@/lib/inngest/functions/labeling-flip-cron"
    );
    const action = pickAction({ n: 49, ci_lo: 0.99, dry_run: true, mutate: true });
    expect(action).toBe("no_change");
  });

  it("promotes at N>=50 and CI-lo>=0.95", async () => {
    const { pickAction } = await import(
      "@/lib/inngest/functions/labeling-flip-cron"
    );
    expect(
      pickAction({ n: 50, ci_lo: 0.95, dry_run: true, mutate: true }),
    ).toBe("promoted");
    expect(
      pickAction({ n: 75, ci_lo: 0.96, dry_run: true, mutate: true }),
    ).toBe("promoted");
  });

  it("demotes at CI-lo<0.92", async () => {
    const { pickAction } = await import(
      "@/lib/inngest/functions/labeling-flip-cron"
    );
    expect(
      pickAction({ n: 100, ci_lo: 0.91, dry_run: false, mutate: true }),
    ).toBe("demoted");
  });

  it("shadow mode does not mutate — returns shadow_would_* even when gates pass", async () => {
    const { pickAction } = await import(
      "@/lib/inngest/functions/labeling-flip-cron"
    );
    expect(
      pickAction({ n: 50, ci_lo: 0.96, dry_run: true, mutate: false }),
    ).toBe("shadow_would_promote");
    expect(
      pickAction({ n: 100, ci_lo: 0.9, dry_run: false, mutate: false }),
    ).toBe("shadow_would_demote");
  });
});

describe("flip-cron — evaluateMailbox (per-mailbox aggregation)", () => {
  it.todo("per-mailbox aggregation — filters agent_runs by context->>icontroller_mailbox_id (Pitfall 7)");
});
