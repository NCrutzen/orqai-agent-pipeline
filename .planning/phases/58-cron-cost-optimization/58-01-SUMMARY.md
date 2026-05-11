---
phase: 58-cron-cost-optimization
plan: 01
status: shipped
landed_at: web/lib/inngest/functions/{debtor-email-bridge,browserless-keepalive,debtor-email-icontroller-cleanup-dispatcher}.ts + orqai-trace-sync.ts
---

Shipped. All four target files carry the Phase 58 changes verified in source:

- `debtor-email-bridge.ts:22` — `{ cron: "TZ=Europe/Amsterdam */2 6-19 * * 1-5" }`
- `browserless-keepalive.ts:48` — `{ cron: "TZ=Europe/Amsterdam */2 6-19 * * 1-5" }`
- `debtor-email-icontroller-cleanup-dispatcher.ts:47` — `{ cron: "TZ=Europe/Amsterdam */5 6-19 * * 1-5" }`
- `orqai-trace-sync.ts:89` — `{ event: "analytics/orqai-trace-sync.run" }` with inline comment `// Phase 58: cron paused; manual-only trigger`

Business-hours windowing pattern (`TZ=Europe/Amsterdam */N 6-19 * * 1-5`) has since become the project default — codified in CLAUDE.md as the standard cron form.
