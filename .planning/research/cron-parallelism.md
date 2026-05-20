# Cron-Level Parallelism — iController Cleanup

Research + design for 3 parallel workers, each with own Browserless session, own iController login, own storageState key. No code changes; implementation deferred.

## 1. Inngest fan-out pattern

Three options evaluated:

**A. `step.parallel` inside the cron function.** Runs N `step.run` branches concurrently *within the same Vercel invocation*. Inngest parallelises at the step-scheduling level, but every step still executes in the same serverless container. For pure CPU/IO work that's fine. For us each worker opens a Browserless CDP connection and holds it for 45–60s — one Vercel invocation with 3 simultaneous CDP sockets works technically but consumes a single 300s budget and couples failures (one throw aborts the invocation). Rejected.

**B. Cron function fans out via `step.sendEvent`.** The `*/5 * * * *` cron handler becomes a thin dispatcher: it emits N events (`automations/icontroller-cleanup.worker.requested`, one per worker index). A second, non-cron function listens on that event and does the actual work. Each event triggers a *separate* Inngest run → *separate* Vercel invocation → independent 300s budget, independent retry lane, independent Browserless socket. This is the canonical Inngest fan-out pattern (`step.sendEvent([{...}, {...}, {...}])`). **Recommended.**

**C. Inngest batching.** `batchEvents: { maxSize, timeout }` is the inverse (merge many events into one run). Not applicable.

**Concurrency control.** The cron dispatcher keeps `concurrency: { limit: 1 }`. The worker function uses `concurrency: { limit: PARALLELISM, key: "event.data.workerIndex" }` so the same shard cannot double-fire if a previous run overruns the 5-min tick. Total concurrent browser sessions is bounded by PARALLELISM.

## 2. Session-key sharding

Current `resolveEnv` in `web/lib/automations/debtor-email-cleanup/browser.ts` hard-codes `sessionKey: "icontroller_session_prod"`. Minimal diff:

```
resolveEnv(env, workerIndex?: number) → sessionKey:
  base = "icontroller_session_prod"
  return workerIndex === undefined ? base : `${base}_${workerIndex}`
```

Thread `workerIndex` through `openIControllerSession(env, workerIndex)`. `connectWithSession(sessionKey)` already accepts any key — no change there. `saveSession` in `closeIControllerSession` already writes back to `session.cfg.sessionKey` so per-worker persistence is automatic.

Cold start: each `_N` key is empty on first ever run → each worker performs a fresh login once, then reuses cookies indefinitely.

## 3. Queue partitioning

Three patterns, ranked by safety:

**Pattern 1 — Round-robin dispatch (recommended).** Dispatcher fetches `BATCH_SIZE * PARALLELISM` rows in one query, slices the list by `i % PARALLELISM`, and emits one event per shard with its row-ids embedded in `event.data.rowIds`. Workers read ids directly from the event, no second query. Eliminates race windows entirely; no OFFSET drift when rows complete mid-tick. Cost: one extra query upfront, event payload carries ~5 UUIDs (trivial).

**Pattern 2 — Per-worker OFFSET.** Worker N runs `LIMIT 5 OFFSET N*5` on the same filter. Race-prone: if worker 0 finishes its row and flips `icontroller` to `deleted` while worker 1 is still fetching, the OFFSET window shifts and a row is either skipped or double-picked. Rejected.

**Pattern 3 — Advisory lock / `FOR UPDATE SKIP LOCKED`.** Supabase/Postgres supports this. Each worker runs `SELECT ... FOR UPDATE SKIP LOCKED LIMIT 5` inside a transaction and marks rows as `pending` before releasing. Robust but requires RPC (PostgREST doesn't expose `FOR UPDATE`). Overkill for 72-items/hour throughput.

Go with **Pattern 1**. It also makes the worker function stateless about the queue — it just processes the ids it was given.

## 4. iController server-side risk

No codebase hints that iController enforces single-session-per-user. Sessions are cookie-based (`connect.sid`-style). Empirically the SPA tolerates parallel logins from different IPs (Browserless spins containers with varying egress). **Low but non-zero risk:** simultaneous logins with the same creds may invalidate each other's cookies on some IAM stacks.

**Mitigation — serialised warmup.** First tick after deploy: dispatcher runs worker 0 alone (emit one event, wait for completion via `step.waitForEvent('worker.ready')` or just skip workers 1..N-1 on tick 1). Worker 0 logs in, saves `_0`. Subsequent workers start with **empty** `_1`, `_2` keys → they'll also log in. To avoid N fresh logins in 5s, seed: after worker 0 writes `_0`, dispatcher copies `_0` → `_1` → `_2` via a single `settings` upsert. Workers then resume on valid cookies, no re-login. Re-seed whenever a worker's session expires (detect via the existing login-form race in `login()` and log a counter; if >1 worker re-logs in a tick, throttle PARALLELISM).

Cheap fallback: accept the 3-simultaneous-login risk, monitor `failed` count, back off if it spikes.

## 5. Concrete recommendation

- **PARALLELISM = 3.** Browserless Prototyping allows 10 concurrent; 3 leaves headroom for ad-hoc scripts and the per-email server-action path.
- **BATCH_SIZE = 5 per worker** (unchanged). 3×5 = 15 items per tick = 180/hour = full 360-queue drained in 2 hours.
- **Architecture:** cron dispatcher (`step.sendEvent` × 3, embeds `workerIndex` + `rowIds`) → worker function (`concurrency.key = workerIndex`, `retries: 1`). Keep dispatcher `concurrency: { limit: 1 }`.
- **Session keys:** `icontroller_session_prod_0..2`. Seed `_1`, `_2` from `_0` on first successful login to avoid 3 parallel fresh logins.
- **Rollback:** feature-flag via `PARALLELISM` env var; =1 reproduces today's behaviour.
- **Monitor:** log `workerIndex` in every `automation_runs.result.processed_by` (`inngest-cleanup-cron:w1`) so post-hoc analysis can spot per-shard skew.
