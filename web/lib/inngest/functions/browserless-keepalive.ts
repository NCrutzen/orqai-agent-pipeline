import { chromium } from "playwright-core";
import { inngest } from "@/lib/inngest/client";

/**
 * Browserless keepalive cron. Makes a trivial CDP connect every 2 min
 * so Browserless' accept-path stays warm between real automation runs.
 *
 * Why this exists:
 *   Observed 2026-04-23 on the iController-cleanup fan-out: worker 0
 *   (the first of 3 parallel shards fired from one cron tick) hit
 *   consistent `browserType.connectOverCDP: Timeout 120000ms exceeded`
 *   errors while worker 1 (1.5s later) and worker 2 (3s later) succeeded
 *   reliably. Cause was Browserless cold-start after 5-min idle: the
 *   first connect after a quiet period drops, subsequent ones succeed
 *   because the endpoint warmed up. Staggering workers helped 1 and 2
 *   but left 0 exposed.
 *
 *   This keepalive guarantees traffic every 2 min → accept-path is
 *   never idle long enough to go cold → every automation's first
 *   worker connects against a warm endpoint.
 *
 * Scope:
 *   Shared infrastructure for all iController / Browserless flows
 *   (cleanup, drafts, invoices, future automations). No iController
 *   login, no storageState — pure CDP handshake.
 *
 * Cost:
 *   ~2s × 720 runs/day ≈ 1440 Browserless units/month. On the
 *   Prototyping tier's 20k/mo budget that's ~7%. Acceptable overhead
 *   for the reliability it buys.
 */
export const browserlessKeepalive = inngest.createFunction(
  {
    id: "automations/browserless-keepalive",
    // Fail fast: if a ping hangs, don't retry — the next tick (2 min)
    // tries again. Zombies would cost more units than they save.
    retries: 0,
    // One ping at a time. Two overlapping pings would double-charge
    // for no extra warmth.
    concurrency: { limit: 1 },
  },
  { cron: "*/2 * * * *" },
  async () => {
    const token = process.env.BROWSERLESS_API_TOKEN;
    if (!token) {
      return { ok: false, reason: "missing-token" };
    }

    // Short session timeout — we only need the handshake, anything longer
    // is wasted units if the browser.close() call fails.
    const wsEndpoint = `wss://production-ams.browserless.io?token=${token}&timeout=30000`;

    const start = Date.now();
    // 30s connect timeout — if the endpoint is truly unreachable,
    // fail fast so the next tick can try again sooner.
    const browser = await chromium.connectOverCDP(wsEndpoint, { timeout: 30_000 });
    try {
      // No context, no page, no navigation — the CDP handshake itself
      // is what primes Browserless' accept-path.
    } finally {
      await browser.close();
    }

    return { ok: true, ms: Date.now() - start };
  },
);
