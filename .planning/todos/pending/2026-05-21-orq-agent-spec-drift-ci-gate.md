---
captured: 2026-05-21
source: Stage 3 reasoning-too-big debug session (`.planning/debug/stage-3-intent-reasoning-too-big.md`)
status: pending
priority: M
target_milestone: v8.2 or later (999-phase backlog)
tags: [ci, orq, drift, governance, agent-spec]
---

# CI drift gate between in-tree Orq agent specs and deployed Studio configs

## The need

The Stage 3 reasoning bug we fixed 2026-05-21 cost ~12% silent Stage 3 failure for several days. Root cause: the in-tree `Agents/debtor-email-swarm/agents/debtor-intent-agent.md` spec was frozen at V1 (2026-04-23.v1, Haiku 4.5, max_tokens 400) while Orq Studio had drifted to V3 (2026-05-19.v3, Sonnet 4.5, max_tokens 2048, ranked-array shape) over ~3 weeks. No CI signal existed to surface the drift.

This is a systemic gap — any Orq agent in `Agents/<swarm>/agents/` can drift the same way. The fix is a CI step that compares each in-tree spec against the deployed Studio config and fails the build when they diverge.

## Deliverable

### 1. `web/scripts/check-orq-agent-drift.ts`

- Walks `Agents/*/agents/*.md`
- For each file: parses frontmatter for `orqai_id` (or `key`) → calls Orq REST API `GET /v2/agents/{key}` → diffs against the in-tree content.
- Compared fields (canonical list — refine in plan-phase):
  - `model.id` (primary model)
  - `model.parameters.max_tokens`, `temperature`, `top_p`, `top_k`
  - `model.parameters.response_format.json_schema.schema` (deep-equal, normalized)
  - `fallback_models` (ordered list of IDs)
  - `instructions` text hash (sha256 of normalized whitespace)
  - `description`
- Exit code: 0 if all specs match, 1 with a per-spec diff if any drift.

### 2. CI wiring

- New step in `.github/workflows/pr-checks.yml` between `typecheck` and `test`: `npm run check:orq-drift`
- Add to `web/package.json`: `"check:orq-drift": "tsx scripts/check-orq-agent-drift.ts"`
- Needs `ORQ_API_KEY` secret available in GitHub Actions (already used by Inngest sync workflow — confirm).

### 3. Escape hatch

- `[skip-orq-drift]` substring in the most-recent commit message → script logs "skipped" + exit 0. For PRs that intentionally update Studio first and refresh the spec in a follow-up.
- Document the escape hatch in `docs/collaboration.md` so future devs find it.

## Acceptance criteria

- Running the script locally against current main passes (all 5 debtor-email agents + sales-email-classifier + stage-0-* + stage-1-* aligned with Studio).
- A test PR that hand-edits `debtor-intent-agent.md` to bump version without a Studio update FAILS the new gate.
- A test PR with `[skip-orq-drift]` in commit message SKIPS the gate.
- Gate adds <30s to CI runtime on cold cache (~3s per agent × ~8 agents).

## Open questions for plan-phase

1. Which agents are even in-scope? The current `Agents/*/agents/*.md` directory has multiple swarms (debtor-email, smeba-sales, cura-email). Some may have stale specs that fail the gate immediately — do we (a) audit + refresh all before turning the gate on, (b) gate per-swarm with allowlist, or (c) accept some failures as a forcing function?
2. Should the gate also check the few-shot examples block? It's large and frequently edited in Studio — may produce noisy diffs.
3. Hash normalization: do we strip leading/trailing whitespace per line? Collapse blank lines? The Studio editor may re-flow.
4. Bidirectional or unidirectional? Spec-leading (must match Studio) is what this todo specifies. Reverse direction (Studio-leading, auto-PR a refresh) is a future possibility.

## Why this is a 999-phase, not v8.1 grooming

- Touches CI (workflow), needs an env secret, has its own acceptance criteria → too structured for a quick task.
- Reads from Orq's REST API directly → external dependency that may need rate-limit handling.
- The escape-hatch design + collaboration-doc update means multi-file PR.
- Not urgent — the manual sync just happened (2026-05-21 PR #50), so the immediate drift is closed. The risk window for the next drift is weeks, not hours.

## Reference

- Root cause investigation: `.planning/debug/stage-3-intent-reasoning-too-big.md`
- 2026-05-21 spec refresh PR: #50
- 2026-05-21 Studio prompt update: applied via `mcp__orqai-mcp__update_agent` (no PR — direct API call)
- 2026-05-21 Zod widen PR: #49
