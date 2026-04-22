# CI/CD Templates for Consumer Repos

These templates ship the V3.0 regression gate (DIST-07) for teams that want
`/orq-agent:test` to run automatically against their deployed Orq.ai agent
on every push, and fail the build if results-analyzer detects a regression
(`⚠️` marker from Phase 42 ITRX-04).

## When to use

Add one of these to the repo that owns your **Orq.ai agent spec + dataset**
(NOT this skill repo). The skill repo itself runs a lighter-weight check
(`.github/workflows/skill-ci.yml`) that only validates the skill's own
structure — no live Orq.ai calls.

## GitHub Actions

1. Copy `github-actions-orq-test.yml.template` to
   `.github/workflows/orq-agent-test.yml` in your agent repo.

2. In your repo: **Settings → Secrets and variables → Actions**

   **Secrets tab** (masked):
   - `ORQ_API_KEY` — Orq.ai Studio → Settings → API Keys
   - `ANTHROPIC_API_KEY` — console.anthropic.com → API Keys

   **Variables tab** (not masked):
   - `DEFAULT_AGENT_KEY` — e.g. `support-triage-agent`
   - `DEFAULT_DATASET_ID` — e.g. `ds_01JRXYZ...`

3. Push. On the first run, verify the workflow passes. Future pushes will
   fail if any evaluator score regresses vs the previous run.

## GitLab CI

1. Copy `gitlab-ci.yml.template` to `.gitlab-ci.yml` in your agent repo.

2. **Settings → CI/CD → Variables** (click "Add variable" for each):

   Mask these:
   - `ORQ_API_KEY`
   - `ANTHROPIC_API_KEY`

   Leave unmasked:
   - `AGENT_KEY`
   - `DATASET_ID`

3. Push. First pipeline run establishes the baseline; subsequent runs compare.

## Multiple agents

Both templates test one agent per run. For N agents, either:

- **Matrix (GitHub):** convert the job to a `matrix` over `agent_key` values.
- **Parallel (GitLab):** duplicate the job with different `AGENT_KEY` per copy,
  or use `parallel:matrix`.

## Customization points

- **Time window:** the job runs on every push. For a nightly schedule, add
  `schedule:` triggers (GitHub) or `rules: - if: '$CI_PIPELINE_SOURCE ==
  "schedule"'` (GitLab).
- **Tier:** the templates assume the `test+` install tier (full test command
  available). If you're on `deploy` tier, remove the `/orq-agent:test` call.
- **Regression threshold:** the templates treat *any* `⚠️` as a failure. To
  allow minor drops, post-process `orq-test-output.txt` before the grep.

## What the skill repo owns vs what you own

| Concern | Skill repo (this repo) | Your agent repo |
|---------|------------------------|-----------------|
| Skill file format / lint | ✓ CI enforces | — |
| Plugin manifests | ✓ CI enforces | — |
| Protected entry-point byte-identity | ✓ CI enforces | — |
| Your deployed agent's eval scores | — | ✓ CI enforces (via these templates) |
| `ORQ_API_KEY` / `ANTHROPIC_API_KEY` | Not needed | Required |
| Agent key + dataset ID | Not applicable | Required |

The skill repo can't test your agent because your agent lives in your Orq.ai
workspace, which requires your API key. That's why the regression gate is
shipped as a template, not as an active workflow in this skill repo.
