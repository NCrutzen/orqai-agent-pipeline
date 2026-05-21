# Phase 64-01 Probes

**Run:** 2026-04-30
**Purpose:** Validate two RESEARCH assumptions (A2: Haiku availability; A3: ceiling sizing) before downstream Plans 02-04 consume the chosen constants.

---

## Probe 1 — Haiku Availability (RESEARCH A2 / CONTEXT D-03)

**Method:** Queried `public.orq_agents` for any registered agent currently using a `claude-haiku-4-*` model in its `model_config.primary` field. The presence of at least one production-wired Haiku-4 row in the live registry is sufficient evidence that the model is reachable through Orq.ai Router from this account (same Router, same auth, same fallback infrastructure).

```bash
curl -s "$SUPABASE_URL/rest/v1/orq_agents?select=agent_key,model_config,enabled" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

**Result (raw):**

```json
[
  {
    "agent_key": "debtor-intent-agent",
    "model_config": {
      "primary": "anthropic/claude-haiku-4-5-20251001",
      "fallbacks": [
        "anthropic/claude-sonnet-4-6",
        "openai/gpt-4o",
        "google-ai/gemini-2.5-pro",
        "mistral/mistral-large-latest"
      ],
      "max_tokens": 600,
      "temperature": 0
    },
    "enabled": true
  }
]
```

**Verdict:** **AVAILABLE.** `anthropic/claude-haiku-4-5-20251001` is live in `orq_agents` (`debtor-intent-agent`, enabled=true). Plan 02 provisions a new agent `stage-0-safety-classifier` against the same model identifier; no fallback to Haiku 3.5 needed.

**Note on model identifier:** The full pinned identifier in production is `anthropic/claude-haiku-4-5-20251001`. The plan-level token (`MODEL_KEY` below) uses the canonical short form `anthropic/claude-haiku-4-5` per CONTEXT D-03 wording; Plan 02 selects whichever pin matches the Orq.ai Router's current alias for the 4-5 family (Router resolves both forms to the same upstream).

---

## Probe 2 — Cost Ceiling Validation (RESEARCH A3 / CONTEXT D-16)

**Method:** Query last 30 days of `automation_runs.result.cost_cents` to compute p50/p90/p99/max per-run cost; size the ceiling at `max(15, ceil(p99 * 1.5))`.

```bash
SINCE=$(date -v-30d -u +%Y-%m-%dT%H:%M:%SZ)   # 2026-03-31T11:10:58Z
curl -s "$SUPABASE_URL/rest/v1/automation_runs?select=id,result&swarm_type=eq.debtor-email&created_at=gte.$SINCE&result=not.is.null&limit=2000" ...
```

**Result (raw, summarized):**

| Metric | Value |
|---|---|
| `n_rows_total` | 1000 |
| `n_with_cost_cents` | **0** |
| `p50` / `p90` / `p99` / `max` | n/a — no samples |

Inspection of recent `automation_runs.result` jsonb shapes (sample of 5 most-recent debtor-email rows) confirmed the keys today are:

- `topic=unknown`: `from, stage, action, entity, subject, predicted, message_id, source_mailbox`
- `topic=payment_admittance`: `from, stage, entity, company, subject, message_id, icontroller, received_at, screenshots, processed_by, source_mailbox` (and a sibling decision-row variant: `stage, entity, decision, predicted, message_id, triggered_by, source_mailbox, applied_category`)

**No row in the last 30 days carries a `cost_cents` field.** The cost-telemetry seam Phase 64 ships (Pattern 2: `automation_runs.result.cost_cents` written by `stage-0-safety-worker`) does not yet exist on disk. Adjacent telemetry surfaces also lack a usable per-run cost number:

- `public.orq_spans` — does not exist (PGRST205 from the cache).
- `public.agent_runs.cost_cents` — column does not exist.

**Bootstrap caveat (RESEARCH Pitfall 6):** `> 3× median` outlier detection requires a median, and the per-run cost tally requires the `cost_cents` write that Phase 64 itself introduces. **There is no historical sample to size against.**

**Decision:** Default to the D-16 starting points (15¢ / 5,000 tokens). Sized as ~3× the predicted full-pipeline cost on a Sonnet-handler run (Stage 0 Haiku ~0.03¢ + Stage 1 deterministic + Stage 2 LLM tiebreaker ~3-5¢ + Stage 4 Sonnet body draft ~5-7¢ ≈ 8-12¢ on a worst-case multi-LLM invoice-copy run, per RESEARCH Pitfall 4 cost model). Token cap (5,000) is a runaway-loop guard, not a cost guard, per CONTEXT D-14.

**Re-validation gate:** RESEARCH Pitfall 4 warning — if > 5% of runs hit `pipeline/budget_breached` in the first week after Stage 0 ships, the planner must re-tune. This re-tune lives in Phase 65 (or earlier if observed). Plan 02 should keep the constants as named exports so a one-line bump does the job.

---

## Final Ceilings

```
BUDGET_CEILING_CENTS = 15
BUDGET_CEILING_TOKENS = 5000
```

Source: D-16 starting points (no historical cost data on disk; cannot tighten until Stage 0 ships and writes the first 100+ samples).

---

## Final Verdict Model

```
MODEL_KEY = "anthropic/claude-haiku-4-5"
```

Source: Probe 1 above. Live registration of `anthropic/claude-haiku-4-5-20251001` on `debtor-intent-agent` confirms Router availability for this account. Plan 02 provisions `orq_agents.agent_key='stage-0-safety-classifier'` against the same model family with fallbacks per `docs/orqai-patterns.md` (suggested chain: `openai/gpt-4o-mini`, `anthropic/claude-haiku-3-5`, `google/gemini-2.0-flash`).

---

## Summary for Plan 02 / 03 / 04

| Constant | Value | Source |
|---|---|---|
| `BUDGET_CEILING_CENTS` | `15` | D-16 default (no historical cost data; bootstrap) |
| `BUDGET_CEILING_TOKENS` | `5000` | D-16 default (runaway-loop guard, not cost guard) |
| `MODEL_KEY` | `"anthropic/claude-haiku-4-5"` | Probe 1 — AVAILABLE |
| LLM-call mock surface for tests | mock BOTH `invokeOrqAgent` AND `invokeOrqAgentWithUsage` | A1 unresolved — Plan 02 picks per actual Orq.ai response shape |
