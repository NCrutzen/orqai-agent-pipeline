---
description: 12-step interactive onboarding tour covering the Orq.ai Build → Evaluate → Optimize lifecycle with copy-paste prompts at each step
allowed-tools: Bash, Read
---

# Orq.ai Quickstart Tour

You are running the `/orq-agent:quickstart` command. Emit a 12-step onboarding tour that walks the user through the full Orq.ai Build → Evaluate → Optimize lifecycle, with a copy-pasteable prompt at every step. The command is stateless — the user advances manually by running each step's prompt.

## Constraints

- **NEVER** skip the MCP-connect verification in Step 1 — every downstream step assumes a connected workspace; failures there propagate silently into later steps.
- **NEVER** re-order the 12 steps — the sequence encodes learning dependencies (agent before invoke; invoke before traces; traces before evaluator; evaluator before dataset; dataset before experiment; experiment before human review; human review before promotion).
- **NEVER** write a progress sidecar or any state file — this command is intentionally stateless (see `.planning/phases/36-lifecycle-slash-commands/36-CONTEXT.md` §Claude's Discretion).
- **ALWAYS** render each step's copy-paste prompt inside a fenced code block so users can triple-click-select it.
- **ALWAYS** include an `Expected outcome:` line per step so the user knows when to advance.

**Why these constraints:** Quickstart is a first-impression surface — users form their trust model of the pipeline here. Skipping Step 1 hides the #1 failure mode (missing MCP). Re-ordering breaks the conceptual scaffolding that makes each step feel like a natural consequence of the previous one. A stateful progress file would add hidden coupling that the rest of the pipeline does not have and cannot be cleaned up predictably. Copy-paste reliability and explicit success criteria per step are what turn a "tour" into something a non-technical user can actually finish.

## When to use

- A first-time Orq.ai user runs `/orq-agent:quickstart` and needs a guided, copy-paste walk-through of the full lifecycle.
- A colleague wants a fresh demo walkthrough before showing Orq.ai to stakeholders and needs to re-verify every stage works end-to-end.
- An existing user returning after a long break wants a refresher on the Build → Evaluate → Optimize arc and which slash command belongs at each stage.

## When NOT to use

- User has already progressed past Step 6 and needs a specific command (e.g., evaluator or dataset work) → jump directly to `/orq-agent:harden` or `/orq-agent:datasets`; the tour adds no value.
- User needs in-depth reference documentation for a single command → run `/orq-agent:help` (command index) or read the specific command's SKILL file directly.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `/orq-agent:workspace` at Step 1 (verify MCP connection and inspect workspace surface)
- → `/orq-agent:models` at Step 2 (confirm at least one chat model is activated in the Model Garden)
- → `/orq-agent` at Step 4 (generate the first agent spec from a use-case description)
- → `/orq-agent:traces` at Step 6 (inspect the first invocation trace)
- → `/orq-agent:harden` at Steps 7 and 12 (build the evaluator, then promote it to a guardrail)
- → `/orq-agent:datasets` at Step 8 (generate a clean + edge test dataset)
- → `/orq-agent:test` at Step 9 (run the dataset against the deployed agent with the evaluator attached)
- ← user invocation — onboarding entry point

## Done When

- [ ] ORQ ► QUICKSTART banner printed
- [ ] All 12 Step sections rendered in order, each with the exact heading `## Step N: …`
- [ ] Each step has a fenced-block copy-paste prompt
- [ ] Each step has an `Expected outcome:` line that tells the user when to advance
- [ ] Footer points to https://docs.orq.ai/docs/get-started

## Destructive Actions

- **None** — this command is read-only; it emits guidance. Steps 4, 7, 8, 9, and 12 route the user into commands that mutate Orq.ai state (`/orq-agent`, `/orq-agent:harden`, `/orq-agent:datasets`, `/orq-agent:test`) — those commands own their own Destructive Actions confirmations.

## Tour Intro

Display the following banner verbatim, then the short intro paragraph below it, then proceed into the 12 Step sections:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► QUICKSTART                 12 steps, ~30 min
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
```

This tour walks the full Orq.ai lifecycle: **connect → enable → build → invoke → analyze → evaluate → validate → promote**. Run each step's copy-paste prompt in order. Every step has an `Expected outcome:` line — once you see it, advance to the next step. The command does not track progress for you; you own the sequence.

## Step 1: Connect MCP

Verify that the Orq.ai MCP server is registered with Claude Code and responds to workspace queries. Every other step assumes this connection is live.

```
/orq-agent:workspace
```

Expected outcome: an `ORQ ► WORKSPACE` banner appears with non-empty agents / deployments / analytics tables. If the tables are empty or the command reports MCP unavailable, install or repair the MCP server first with `curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash` and re-run Step 1.

## Step 2: Enable Models

Confirm at least one chat model is activated in the Model Garden — without an active model, Step 4's agent cannot run.

```
/orq-agent:models claude
```

Expected outcome: at least one row in the output shows `Activated: yes` for a chat model. If no model is activated, open https://my.orq.ai/model-garden, activate a model you have provider credentials for (Anthropic, OpenAI, Google, etc.), then re-run this step.

## Step 3: Create Project

Create a project workspace in Studio to hold agents, deployments, datasets, and experiments for this walkthrough.

```
# Open Studio and create a project:
# https://my.orq.ai/projects
```

Expected outcome: the new project is visible in Studio and shows up when you re-run `/orq-agent:workspace projects`. Name it something distinctive (e.g., `quickstart-demo`) so later steps are easy to locate.

## Step 4: Build Agent

Generate your first agent spec using the pipeline's main orchestrator. Replace the description in quotes with your own use case if you prefer.

```
/orq-agent "Build a customer support triage agent"
```

Expected outcome: a generated spec directory under `./Agents/customer-support/` (or your swarm name) containing `agents/`, `datasets/`, optional `ORCHESTRATION.md`, and `README.md`. Review the generated spec before moving on.

## Step 5: Invoke Agent

Deploy the generated spec to Orq.ai and make your first test invocation in Studio Chat so the system produces a real trace you can inspect.

```
/orq-agent:deploy
# then open Studio Chat: https://my.orq.ai/agents
```

Expected outcome: `/orq-agent:deploy` reports success for the agent(s); opening Studio Chat and sending one test message produces a visible response and creates the first trace row in https://my.orq.ai/traces.

## Step 6: Analyze Traces

Inspect the trace produced by Step 5 to confirm instrumentation captured the invocation end-to-end.

```
/orq-agent:traces --last 1h
```

Expected outcome: at least one row with your test invocation's deployment key, a non-empty latency value, and a `success` status. If no rows appear, recheck Step 5 — the invocation may not have reached the deployed agent.

## Step 7: Build Evaluator

Draft your first LLM-as-judge evaluator scaffold. The evaluator defines a binary Pass/Fail (or scored) judgement the test suite will apply in Step 9.

```
/orq-agent:harden --evaluators
```

Expected outcome: an evaluator scaffold file is created (or reported) in the swarm's directory. Note: full evaluator validation (TPR/TNR thresholds from Phase 42 EVLD) happens at Step 11 — this step produces the scaffold only.

## Step 8: Build Dataset

Generate a small test dataset for the agent. The default pipeline produces both clean and edge cases so Step 9 can cover expected behavior AND adversarial boundaries.

```
/orq-agent:datasets
```

Expected outcome: a dataset file under `./Agents/{swarm}/datasets/{agent}-dataset.md` with ≥30% adversarial rows. Dataset shapes expand further in Phase 39 (DSET); this step delivers the minimum needed to run an experiment.

## Step 9: Run Experiment

Run the Step 8 dataset against the Step 5 deployed agent with the Step 7 evaluator attached. This produces your first automated quality signal.

```
/orq-agent:test
```

Expected outcome: an experiment ID is returned and the run becomes viewable at https://my.orq.ai/experiments. Results show per-row Pass/Fail verdicts from the evaluator and aggregate Pass-rate.

## Step 10: Human Review

Route a sample of the Step 9 outputs to human annotators so you can later validate the evaluator against ground truth. This step is manual because human labeling cannot be automated away.

```
# Open Annotation Queues in Studio:
# https://my.orq.ai/annotation-queues
```

Expected outcome: an annotation queue is created from the experiment outputs and you collect the EVLD-04 / EVLD-06 minimum sample sizes (≥30 Pass labels AND ≥30 Fail labels) from human reviewers. Without both minimums, Step 11 cannot compute valid TPR/TNR.

## Step 11: Annotation Analysis

Compare the evaluator's verdicts against the human labels from Step 10 to compute True Positive Rate and True Negative Rate. Phase 42 (EVLD) wires this analysis as the gate for Step 12.

```
# Open Evaluator Validation in Studio:
# https://my.orq.ai/experiments
```

Expected outcome: the evaluator's TPR and TNR numbers are computed and stored alongside it (EVLD-06 wiring in Phase 42). You must have BOTH metrics before attempting Step 12.

## Step 12: Promote Evaluator

Promote the validated evaluator to a runtime guardrail on the deployment. This is the final gate in the loop and is intentionally the last thing you do.

```
/orq-agent:harden --promote
```

Expected outcome: the guardrail is attached to the deployment. Promotion is only allowed when TPR ≥ 90% AND TNR ≥ 90% (EVLD-08; enforced from Phase 42 onwards). If the evaluator misses either threshold, return to Step 7 and iterate.

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Skipping Step 1 MCP verification to "save time" | Every later step assumes a live MCP connection; missing it manifests as cryptic errors downstream, not as a clear failure at Step 1 |
| Re-ordering the 12 steps (e.g., building an evaluator before invoking the agent) | Keep the exact order — the sequence encodes learning dependencies (agent → invoke → traces → evaluator → dataset → experiment → review → promote) |
| Writing a `.quickstart-progress` sidecar or any state file to track where the user is | The command is intentionally stateless; users own their progress so there is no drift risk between repo state and tour state |
| Promoting an evaluator (Step 12) before Step 11 validation completes | TPR/TNR gates exist to prevent bad guardrails; skipping them re-introduces the exact silent-failure problem Phase 42 EVLD was created to solve |
| Running Step 9 without the Step 7 evaluator attached | The experiment produces raw outputs but no quality signal; Step 11 validation then has nothing to validate |

## Open in orq.ai

- **Get started docs:** https://docs.orq.ai/docs/get-started
- **Model Garden:** https://my.orq.ai/model-garden
- **Projects:** https://my.orq.ai/projects
- **Agents:** https://my.orq.ai/agents
- **Traces:** https://my.orq.ai/traces
- **Experiments:** https://my.orq.ai/experiments
- **Annotation Queues:** https://my.orq.ai/annotation-queues

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
