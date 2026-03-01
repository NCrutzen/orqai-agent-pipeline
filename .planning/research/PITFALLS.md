# Pitfalls Research

**Domain:** Autonomous LLM Agent Deployment, Testing, and Prompt Iteration Pipeline (V2.0 Extension)
**Researched:** 2026-03-01
**Confidence:** MEDIUM-HIGH

**Scope:** Pitfalls specific to ADDING autonomous deployment, automated testing, prompt iteration, and modular install capabilities to the existing V1.0 spec generation skill. V1.0 pitfalls (over-engineering agent count, prompt quality, error cascading, model staleness, distribution friction, Task ID gotchas, synthetic data quality) remain valid and are not repeated here.

---

## Critical Pitfalls

### Pitfall 1: Runaway Autonomous Loops (The "Infinite Iteration" Trap)

**What goes wrong:**
The prompt iteration loop (analyze results -> propose changes -> update -> re-test) runs without adequate stopping conditions. Claude Code autonomously deploys a prompt change, runs an experiment, sees a marginal score improvement, proposes another tweak, deploys again, runs another experiment -- endlessly. Each cycle costs API tokens on both the Claude side (reasoning) and Orq.ai side (experiment execution). A single runaway session can burn through significant API budget before anyone notices. Research shows that without rate limiting, a single agent stuck in a retry loop can generate over 1,000 API calls per minute.

**Why it happens:**
The iteration loop is designed to improve prompts, so "try again" is always a valid action. Without hard limits, the agent optimizes greedily -- any non-zero improvement justifies another cycle. LLMs are bad at deciding "good enough" because they lack cost awareness. The system has no concept of diminishing returns. Additionally, Orq.ai experiment execution is asynchronous, so the agent may poll repeatedly while waiting for results, compounding the API call count.

**How to avoid:**
- Hard cap on iteration cycles per session: maximum 3 autonomous iterations before requiring explicit user approval to continue. This is non-negotiable.
- Budget ceiling per session: track cumulative Orq.ai API calls and halt at a configurable threshold (default: 50 API calls per iteration session).
- Diminishing returns gate: if score improvement between iterations is < 5% (configurable), halt and present results rather than iterating further.
- Wall-clock timeout: maximum 10 minutes for any autonomous iteration session.
- Every iteration must log its cost estimate to the audit trail before executing.

**Warning signs:**
- Iteration loop has no `maxIterations` parameter in its configuration
- No cost tracking or budget awareness in the pipeline code
- Agent can deploy and test without any user checkpoint
- Audit logs show 5+ iterations in a single session with < 2% improvement per cycle
- Orq.ai API usage spikes correlate with iteration sessions

**Phase to address:**
Phase 3 (Prompt Iteration Loop) -- the iteration controller must be built with hard limits from day one. Adding limits retroactively means the first users to test the feature will hit the runaway problem.

---

### Pitfall 2: MCP Server State Desync (The "Ghost Deployment" Problem)

**What goes wrong:**
The skill deploys an agent to Orq.ai via MCP, but the local state (audit trail, spec files) and Orq.ai's actual state diverge. Common scenarios: (1) MCP call succeeds but the local write fails -- Orq.ai has the agent, local files say it was not deployed. (2) MCP call fails partway -- Orq.ai created the agent but did not apply all settings. (3) User manually edits the agent in Orq.ai Studio after autonomous deployment -- local specs are now stale. (4) Agent versioning in Orq.ai creates a new version when the skill expected to update in-place. The result: the skill operates on stale assumptions about what is deployed, leading to experiments running against wrong configurations or prompt iterations applied to the wrong version.

**Why it happens:**
MCP tool calls are not transactional. There is no atomic "deploy agent + record result" operation. The Orq.ai MCP server exposes workspace management capabilities but the protocol itself (JSON-RPC 2.0 over stdio) has no built-in transaction or rollback mechanism. Each MCP invocation is a fresh context with no shared state between calls. Additionally, Orq.ai's agent versioning creates new versions when parameters differ on the same key -- the skill may not detect that it created version 3 when it expected to update version 2.

**How to avoid:**
- Implement a "verify after deploy" pattern: after every MCP deployment call, immediately read back the agent configuration from Orq.ai and compare against the intended spec. Log any discrepancies.
- Store the Orq.ai agent version number in the local audit trail after each deployment. Before any subsequent operation, verify the current version matches the expected version.
- Design all deployment operations as idempotent: deploying the same spec twice should produce the same result. Use agent keys deterministically (from the spec) and check for existing agents before creating.
- Include a `--sync` command that reconciles local state with Orq.ai's actual state, surfacing any drift.
- Never assume MCP success without verification. Treat every MCP call as potentially failed until confirmed.

**Warning signs:**
- Deployment code does not read back state after writing
- No version tracking in local audit files
- Skill assumes "if no error was thrown, it worked"
- No reconciliation mechanism between local specs and Orq.ai state
- Users report "the agent in Orq.ai doesn't match what the skill says it deployed"

**Phase to address:**
Phase 2 (Autonomous Deployment) -- the deploy-verify-record pattern must be the foundation of every deployment operation. This is architectural, not a feature to add later.

---

### Pitfall 3: Prompt Overfitting to Evaluation Dataset (The "Teaching to the Test" Trap)

**What goes wrong:**
The automated prompt iteration loop optimizes prompts against a fixed evaluation dataset. After 3-5 iterations, the prompt scores 95% on the eval set but performs worse on real-world inputs. The prompt has learned the quirks of the test data (specific phrasings, consistent input lengths, predictable domains) rather than developing genuine capability. Research confirms this is a real and documented risk: "repeatedly optimizing against the same test cases improves scores without improving real-world performance."

**Why it happens:**
The iteration loop uses the same dataset for every evaluation cycle. The LLM doing the iteration can observe patterns in what the evaluator rewards and craft prompts that exploit those patterns rather than solving the general problem. This is the LLM equivalent of overfitting in ML. The problem is amplified when datasets are small (< 50 examples) and when evaluators use simple metrics (exact match, keyword presence) rather than semantic evaluation.

**How to avoid:**
- Split datasets into train/test/holdout: use the training set for iteration, the test set for progress measurement, and the holdout set (never seen during iteration) for final validation. The holdout set must never be used during iteration.
- Require a minimum dataset size of 30 examples before allowing automated iteration. Below this threshold, show results but do not auto-iterate.
- After every iteration cycle, run a "generalization check": test the new prompt against 5 randomly generated novel inputs (not from the dataset) and flag if performance drops.
- Cap iteration count (see Pitfall 1) -- fewer iterations means less opportunity to overfit.
- Use semantic evaluators (LLM-as-judge) rather than exact-match evaluators for iteration feedback. Orq.ai supports LLM-as-judge evaluators natively.
- Periodically refresh the evaluation dataset with new examples to prevent the prompt from memorizing patterns.

**Warning signs:**
- Eval scores climb steadily across iterations but user satisfaction does not improve
- Prompt becomes increasingly specific (mentions exact phrases from test data)
- Prompt grows significantly longer with each iteration (accumulating special cases)
- Holdout set performance diverges from training set performance
- Prompt includes conditions that only make sense for specific test examples

**Phase to address:**
Phase 3 (Prompt Iteration) and Phase 2.5 (Automated Testing) -- dataset splitting must be designed into the testing pipeline, and the iteration loop must respect the split. These two phases are tightly coupled on this pitfall.

---

### Pitfall 4: API Key Exposure in Audit Trails and Skill Files

**What goes wrong:**
The Orq.ai API key ends up committed to git, logged in audit trail markdown files, displayed in Claude Code output, or hardcoded in skill configuration. Since V2.0 introduces API key onboarding as part of modular install, the key flows through multiple touchpoints: user input, configuration storage, MCP server config, API fallback calls, and audit logs. Any one of these can leak the key. With 5-15 users at Moyne Roberts, a single leaked key exposes the entire Orq.ai workspace.

**Why it happens:**
The skill runs inside Claude Code, which outputs everything to the terminal. MCP server configuration in `claude_desktop_config.json` or `.mcp.json` stores keys in plaintext JSON. Audit trail files capture "what was done" including API call details. The skill generates configuration examples that may include real keys. Non-technical users may not recognize that an API key in a markdown file is a security issue and could share or commit it.

**How to avoid:**
- Store the API key ONLY as an environment variable (`ORQ_API_KEY`). Never write it to any file the skill generates.
- MCP server configuration should reference the environment variable, not the key value: `"env": {"ORQ_API_KEY": "..."}` in `.mcp.json` with the value sourced from the user's shell profile, not stored in the config file.
- Audit trail must NEVER log API keys, full request headers, or authentication tokens. Log the action, the result, and a redacted reference.
- All generated configuration examples must use placeholder format: `ORQ_API_KEY=orq_sk_REPLACE_WITH_YOUR_KEY`.
- Add a `.gitignore` entry for any config files that might contain keys during onboarding.
- The onboarding flow should explicitly tell the user: "Add this to your shell profile (~/.zshrc), NOT to any project file."

**Warning signs:**
- API key appears anywhere in the git history
- Audit trail files contain `Authorization` headers or key values
- MCP config files contain inline key values rather than env var references
- Install script asks user to paste key into a file rather than an env var
- No `.gitignore` entries for configuration files

**Phase to address:**
Phase 1 (Modular Install / API Key Onboarding) -- the key management pattern must be established before any deployment or testing features that use the key. Getting this wrong early means every subsequent feature inherits the vulnerability.

---

### Pitfall 5: Non-Deterministic LLM Output Breaking Automated Evaluation

**What goes wrong:**
The automated testing pipeline runs an experiment, gets results, compares them against expected outputs, and reports a score. The next day, the same experiment with the same prompt and same dataset produces different scores -- sometimes significantly different. The prompt iteration loop proposes a change based on results that are not reproducible. Teams waste time "fixing" prompts based on noise rather than signal. Even with temperature=0, LLM outputs can vary across runs due to hardware numerics, batching, and model updates.

**Why it happens:**
LLMs are fundamentally non-deterministic. Even with temperature set to zero, factors like GPU parallelism, floating-point precision, and batch scheduling cause output variation. Orq.ai routes to different model providers/versions transparently. A test run today may hit a different GPU cluster than tomorrow's run. The variation is typically small for factual tasks but can be significant for creative or open-ended tasks -- exactly the kind of tasks agent prompts often handle.

**How to avoid:**
- Run every evaluation at least 3 times and use the median score, not a single-run score. This is non-negotiable for any automated decision-making (like "should we iterate?").
- Set temperature to 0 for all evaluation runs (not just production runs). This reduces but does not eliminate variation.
- Design evaluators that tolerate semantic equivalence, not exact match. Orq.ai's LLM-as-judge evaluator is better suited for this than function-based evaluators for most use cases.
- Track score variance across runs. If variance exceeds a threshold (e.g., > 10% standard deviation), flag the result as unreliable and do not auto-iterate based on it.
- Present results to users with confidence intervals, not point estimates: "Score: 82% (+/- 7%)" not just "Score: 82%".

**Warning signs:**
- Evaluation scores fluctuate by > 10% between identical runs
- Prompt iteration loop flip-flops between two prompt versions
- "Improved" prompts show regression on re-test
- Evaluators use exact string matching for open-ended outputs
- Single-run scores drive automated decisions

**Phase to address:**
Phase 2.5 (Automated Testing) -- the evaluation harness must be designed for statistical robustness from the start. Single-run evaluation is a fundamental design flaw, not a minor issue.

---

### Pitfall 6: Modular Install Creates Broken Partial States

**What goes wrong:**
V2.0 introduces capability selection (core/deploy/test/full). A user installs "core+test" without "deploy". Later, the prompt iteration loop (which requires both deploy and test) silently fails or produces confusing errors because it cannot deploy the iterated prompt. Or: a user installs "deploy" but not "test" and tries to use the iteration loop, which needs both. The combinatorial explosion of capability states (core, core+deploy, core+test, core+deploy+test) creates edge cases where features reference capabilities that are not installed.

**Why it happens:**
Feature flags and modular install seem simple in design ("just check if the feature is enabled") but create exponential complexity in practice. Each capability combination is a different product configuration that must be tested. Code paths branch at every capability check, and the interaction between capabilities is harder to test than individual capabilities. Research shows feature flags "continue to contribute to the complexity of your code" and "pose a risk to the stability and security of your app."

**How to avoid:**
- Design capabilities as a strict hierarchy, not independent flags: `core` < `core+deploy` < `core+deploy+test` (full). You cannot install "test" without "deploy" because testing requires deploying to have something to test. This reduces combinations from 8 to 4.
- Every command must check its capability requirements at the START and produce a clear error: "This command requires the 'deploy' capability. Run `/orq-agent:install --capabilities deploy` to add it."
- Include a `/orq-agent:status` command that shows which capabilities are installed and which commands are available.
- Test every capability combination as part of the release process. With a hierarchical model, this is 4 configurations, not 8+.
- The orchestrator must never silently skip steps because a capability is missing. Explicit failure is always better than silent degradation.

**Warning signs:**
- Commands fail with cryptic errors when a dependent capability is not installed
- Users report features "not working" that actually require a different install tier
- Code has nested `if (hasCapability)` checks that are hard to reason about
- No clear documentation of which commands require which capabilities
- Feature interactions are not tested (only individual features)

**Phase to address:**
Phase 1 (Modular Install) -- the capability hierarchy and dependency model must be designed before any features are implemented. Retrofitting a clean capability model onto ad-hoc feature flags is extremely painful.

---

### Pitfall 7: User Loses Oversight of Autonomous Operations

**What goes wrong:**
The pipeline deploys agents, runs experiments, iterates prompts, and updates configurations -- and the user cannot tell what happened, what changed, or why. The audit trail exists but is a wall of technical detail that non-technical users cannot parse. Or worse: the pipeline makes a change that the user did not approve because the approval checkpoint was too permissive ("approve all iterations" rather than "approve each iteration"). The user discovers their production agents have been modified in ways they do not understand.

**Why it happens:**
Autonomous pipelines optimize for efficiency, not transparency. The temptation is to minimize user interruptions ("just let it run"). Approval checkpoints feel like friction to the developer building the system. Audit trails are written for debugging, not for user comprehension. Non-technical users (the primary audience at Moyne Roberts) need fundamentally different reporting than developers. The "approve all" shortcut eliminates the very oversight that makes autonomous operation safe.

**How to avoid:**
- Every autonomous operation must produce a human-readable summary, not just a technical log. Format: "I changed [what] in [which agent] because [why]. The score went from [X] to [Y]."
- Approval granularity must be per-iteration, not per-session. Users can approve individual changes after seeing the proposed diff and the rationale. No "approve all and walk away" option in the initial release.
- Before any deployment or update, show the user a clear diff: "Current prompt: [truncated]. Proposed prompt: [truncated]. Changes: [highlighted]."
- Implement a "dry run" mode that shows what WOULD happen without actually making changes. This should be the default for first-time users.
- The audit trail must have two layers: a technical log (for debugging) and a user-facing summary (for oversight). The summary is shown by default.
- Every session ends with a "Session Summary" that lists all changes made, all experiments run, and all approvals given.

**Warning signs:**
- Users cannot explain what the pipeline did in their last session
- Audit trail is only readable by developers
- "Approve all" or "auto-approve" option exists in the first release
- No diff view before deployment or updates
- Users ask "what did it change?" after a session completes
- No dry-run mode available

**Phase to address:**
Phase 2-3 (Deployment + Iteration) -- user oversight must be designed into every phase that performs autonomous operations. This is a cross-cutting concern, not a feature to add at the end.

---

### Pitfall 8: Orq.ai MCP Server Availability and Fallback Chaos

**What goes wrong:**
The skill is designed as "MCP-first with API fallback." In practice, the MCP server may be unavailable (not installed, misconfigured, Orq.ai updates break it, version mismatch), and the fallback to direct API calls introduces a completely different code path. Now there are two ways to do everything -- MCP and API -- and they have subtly different behaviors, error modes, and response formats. Bug reports become impossible to reproduce because "it depends on whether MCP was available." The fallback path gets less testing because developers always have MCP configured.

**Why it happens:**
MCP is still a relatively new protocol. The Orq.ai MCP server documentation does not detail rate limits, error handling patterns, or versioning strategy. MCP servers communicate via stdio (JSON-RPC 2.0) with each invocation being a fresh process instance, meaning connection state is not preserved. The API fallback uses HTTP with different error semantics (status codes vs. JSON-RPC errors). Maintaining feature parity between two integration paths doubles the testing surface.

**How to avoid:**
- Abstract both MCP and API behind a single interface with identical behavior contracts. The skill code should never know which path is being used. All differences (error format, response shape, authentication) are handled in the adapter layer.
- Choose a primary path and make the other a true fallback, not an equal alternative. Recommendation: make API the primary path (more stable, better documented, HTTP semantics well-understood) and MCP an optimization for users who have it configured.
- Test the fallback path explicitly in every release. The fallback path must be a first-class citizen in testing, not an afterthought.
- Detect MCP availability at session start (not per-call) and log which path is active. Do not silently switch mid-session.
- When MCP fails, fail the current operation cleanly and switch to API for the remainder of the session, not per-call. Flip-flopping between paths mid-session creates inconsistent state.

**Warning signs:**
- Two separate code paths for MCP and API with different error handling
- Fallback path has fewer tests than primary path
- Bug reports that cannot be reproduced depend on MCP availability
- MCP errors surface as raw JSON-RPC messages to the user
- No detection of which path is active at session start

**Phase to address:**
Phase 2 (Autonomous Deployment) -- the adapter abstraction must be the first thing built before any deployment features. If MCP and API paths are built separately and unified later, the adapter will never fully abstract the differences.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Hardcoding Orq.ai evaluator types | Faster to build first experiments | New evaluator types require code changes; Orq.ai adds evaluator types regularly | Never -- use a configurable evaluator registry from day one |
| Single-run evaluations | Faster iteration cycle, lower API cost | Decisions based on noise; prompt regressions not caught; user trust erodes | Only during initial development/debugging, never in user-facing iteration loops |
| Inline API key in MCP config | Faster onboarding, one fewer setup step | Key exposure risk, cannot rotate without reinstalling, committed to git if .mcp.json is tracked | Never |
| Skipping the adapter layer (calling MCP/API directly) | Faster initial development | Every feature has two code paths, doubled testing burden, inconsistent error handling | Only if committing to one path permanently (no fallback) |
| "Approve all" batch approval mode | Faster autonomous iteration, less user friction | Users lose oversight, unexpected changes in production, trust erosion | Never in V2.0 initial release; consider for V2.1 after trust is established |
| Storing experiment results only in Orq.ai (no local copy) | Simpler architecture, no state sync | Audit trail incomplete, cannot debug offline, Orq.ai becomes single point of failure for history | Never -- always write local audit files as the system of record |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Orq.ai MCP Server | Assuming MCP server is always available and configured | Detect at session start, fall back gracefully, log which path is active |
| Orq.ai MCP Server | Not handling JSON-RPC error format (different from HTTP errors) | Build adapter that normalizes errors from both MCP (JSON-RPC) and API (HTTP status) into a common error type |
| Orq.ai Datasets API | Sending > 5,000 datapoints in a single request | Batch uploads to max 5,000 datapoints per request; implement chunking for larger datasets |
| Orq.ai Evaluators | Assuming evaluators exist globally -- they are being migrated to project scope | Always create evaluators within a project context; check for the project-scoping migration |
| Orq.ai Experiments | Polling for experiment completion without backoff | Use exponential backoff when polling experiment status; experiments can take minutes to complete |
| Orq.ai Agent Versioning | Updating an agent and expecting in-place modification | Orq.ai creates new versions when parameters differ on the same key; track version numbers explicitly |
| Claude Code MCP Config | Storing API key directly in `.mcp.json` or `claude_desktop_config.json` | Reference environment variable in config; instruct user to set in shell profile |
| Claude Code Permissions | Assuming Claude Code will auto-approve MCP tool calls | Claude Code requires user permission for tool calls; design for the approval flow, not around it |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Running full experiment suite on every iteration | 5+ minute wait per iteration cycle; high Orq.ai API costs | Use a "smoke test" subset (10-15 examples) for iteration; full suite only for final validation | Immediately -- users will not wait 5 minutes between iterations |
| Polling Orq.ai experiment status without backoff | API rate limit hits; 429 errors; experiment results delayed | Exponential backoff starting at 2s, capping at 30s; max 20 polls before timeout | At scale when multiple experiments run concurrently |
| Loading entire audit trail into Claude Code context | Context window exhaustion; slow responses; lost instructions | Only load the most recent iteration's audit summary; keep full trail on disk, not in context | After 3+ iterations when audit trail exceeds ~2000 tokens |
| Creating new evaluators for every experiment run | Evaluator proliferation in Orq.ai workspace; management overhead | Create evaluators once per agent type, reuse across experiments; name deterministically | After 10+ experiment runs when workspace becomes cluttered |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| API key stored in `.mcp.json` committed to git | Full Orq.ai workspace access for anyone who finds the repo | Environment variable only; `.mcp.json` in `.gitignore`; onboarding explicitly warns against file storage |
| Audit trail logs containing full API responses with sensitive data | User data from experiments exposed in local markdown files | Sanitize all audit entries; log summaries not full responses; never log input data verbatim |
| Iteration loop modifying production agents without staging | Prompt changes go directly to live agents serving real users | Always deploy to a staging/test version first; promote to production only with explicit user approval |
| No key rotation strategy | Compromised key has unlimited lifetime | Document rotation procedure; onboarding mentions 90-day rotation; `/orq-agent:status` shows key age |

## UX Pitfalls

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Autonomous operations with no progress feedback | User thinks the tool is broken during 2-3 minute experiment runs | Show step-by-step progress: "Deploying agent... Running experiment (12/30 cases)... Analyzing results..." |
| Technical experiment results without interpretation | Non-technical users see "Score: 0.73, F1: 0.81" and do not know if that is good | Present results in plain language: "Your agent answered correctly 73% of the time. This is below the recommended 85% threshold." |
| Prompt diffs shown as raw text without highlighting | Users cannot see what actually changed between iterations | Show side-by-side or inline diff with additions/removals clearly marked |
| Capability install requires re-running full install script | Users lose existing config or customization when upgrading capabilities | Additive install: `/orq-agent:install --add deploy` adds capability without touching existing setup |
| No "undo" for autonomous operations | User approves a change, regrets it, cannot revert | Every deployment creates a rollback point; `/orq-agent:rollback` restores previous version |

## "Looks Done But Isn't" Checklist

- [ ] **Deployment:** Often missing verify-after-deploy -- verify the skill reads back deployed state from Orq.ai after every write operation
- [ ] **Iteration loop:** Often missing stopping conditions -- verify hard caps exist for iteration count, budget, wall-clock time, and diminishing returns
- [ ] **Evaluation:** Often using single-run scores -- verify every automated evaluation uses median of 3+ runs
- [ ] **Dataset splitting:** Often using full dataset for both iteration and validation -- verify train/test/holdout split is enforced
- [ ] **API key onboarding:** Often stores key in a file -- verify key is stored as environment variable only, never written to any tracked file
- [ ] **MCP fallback:** Often untested -- verify the API fallback path has equal test coverage to the MCP primary path
- [ ] **Capability checks:** Often fail silently -- verify every command checks its required capabilities at startup and errors explicitly
- [ ] **Audit trail:** Often only technical -- verify a user-facing summary exists alongside the technical log
- [ ] **Approval flow:** Often allows batch approval -- verify per-iteration approval is the only option in V2.0
- [ ] **Evaluator scope:** Often created globally -- verify evaluators are created within project scope (Orq.ai migration)

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Runaway iteration loop | LOW-MEDIUM | Kill the session; review audit trail for changes made; rollback any deployed changes to last known-good version; add/tighten iteration limits |
| MCP state desync | MEDIUM | Run sync command to reconcile local vs Orq.ai state; manually verify each deployed agent; update local audit trail to match reality |
| Prompt overfitting | MEDIUM | Revert to pre-iteration prompt; create new holdout dataset with real-world examples; re-iterate with proper train/test split; may need to discard multiple iterations of "improvement" |
| API key exposure | HIGH | Immediately rotate key in Orq.ai; audit git history for exposure; force-push to remove from history (if committed); notify affected users; review all systems that used the key |
| Non-deterministic eval results | LOW | Re-run evaluations 3x and use median; adjust evaluators to use semantic matching; increase dataset size; flag high-variance results in reporting |
| Broken partial install state | LOW | Run `/orq-agent:status` to identify installed capabilities; re-run install with desired capability tier; capability hierarchy prevents most invalid states |
| Lost user oversight | MEDIUM-HIGH | Audit all changes made by the pipeline; revert any unapproved modifications; review and tighten approval checkpoints; may need to manually restore agent configurations in Orq.ai |
| MCP/API fallback chaos | MEDIUM | Standardize on one path for the session; rebuild adapter layer if paths diverge; add integration tests for both paths; log which path is active |

## Pitfall-to-Phase Mapping

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| Runaway autonomous loops | Phase 3: Prompt Iteration | Verify: iteration loop has hard caps on count (3), budget (50 calls), time (10 min), and diminishing returns (5%) |
| MCP state desync | Phase 2: Autonomous Deployment | Verify: every deploy operation includes a read-back verification step; version numbers tracked in audit trail |
| Prompt overfitting | Phase 2.5 + 3: Testing + Iteration | Verify: datasets are split into train/test/holdout; holdout never used during iteration; iteration loop respects split |
| API key exposure | Phase 1: Modular Install | Verify: API key stored as env var only; no key values in any generated file; `.gitignore` covers config files |
| Non-deterministic evals | Phase 2.5: Automated Testing | Verify: evaluation harness runs 3+ times per evaluation; median score used; variance reported; single-run decisions blocked |
| Broken partial install | Phase 1: Modular Install | Verify: capabilities follow strict hierarchy (core < deploy < test < full); every command checks requirements at startup |
| Lost user oversight | Phase 2 + 3: Deployment + Iteration | Verify: per-iteration approval enforced; human-readable summaries generated; diff view before every change; session summary at end |
| MCP/API fallback chaos | Phase 2: Autonomous Deployment | Verify: single adapter interface; detection at session start; integration tests for both paths; no mid-session path switching |

## Sources

- [Orq.ai Blog: API Rate Limiting](https://orq.ai/blog/api-rate-limit) -- Leaky bucket rate limiting approach
- [Orq.ai Blog: LLM Guardrails](https://orq.ai/blog/llm-guardrails) -- Platform guardrail capabilities
- [Orq.ai Blog: Model vs Data Drift](https://orq.ai/blog/model-vs-data-drift) -- Drift monitoring guidance
- [Orq.ai Docs: Evaluator Introduction](https://docs.orq.ai/docs/evaluator) -- Evaluator types and project-scoping migration
- [Orq.ai Docs: Datasets Overview](https://docs.orq.ai/docs/datasets/overview) -- Dataset format and 5,000 datapoint limit
- [Orq.ai Platform: Evaluation](https://orq.ai/platform/evaluation) -- Experiment and evaluation capabilities
- [Fast.io: MCP Server Rate Limiting](https://fast.io/resources/mcp-server-rate-limiting/) -- 1,000 calls/minute runaway agent scenario
- [Stainless: Error Handling and Debugging MCP Servers](https://www.stainless.com/mcp/error-handling-and-debugging-mcp-servers) -- MCP error patterns and JSON-RPC debugging
- [Claude Code Docs: MCP Integration](https://code.claude.com/docs/en/mcp) -- MCP server configuration in Claude Code
- [Claude API Key Best Practices](https://support.claude.com/en/articles/9767949-api-key-best-practices-keeping-your-keys-safe-and-secure) -- API key security guidance
- [Skywork.ai: Agentic AI Safety Best Practices 2025](https://skywork.ai/blog/agentic-ai-safety-best-practices-2025-enterprise/) -- Risk tiers and approval frameworks
- [PromptEngineering.org: 2026 Playbook for Reliable Agentic Workflows](https://promptengineering.org/agents-at-work-the-2026-playbook-for-building-reliable-agentic-workflows/) -- Cost control and safety patterns
- [ArXiv: When "Better" Prompts Hurt](https://arxiv.org/html/2601.22025) -- Evaluation-driven iteration pitfalls and overfitting
- [Statsig: Prompt Regression Testing](https://www.statsig.com/perspectives/slug-prompt-regression-testing) -- Regression-safe prompt iteration
- [Flagsmith: 5 Feature Flag Management Pitfalls](https://www.flagsmith.com/blog/pitfalls-of-feature-flags) -- Feature flag complexity and broken states
- [Martin Fowler: Feature Toggles](https://martinfowler.com/articles/feature-toggles.html) -- Canonical reference on toggle complexity
- [Langfuse: Testing LLM Applications](https://langfuse.com/blog/2025-10-21-testing-llm-applications) -- Non-deterministic evaluation strategies

---
*Pitfalls research for: V2.0 Autonomous Orq.ai Pipeline (extending V1.0 Orq Agent Designer)*
*Researched: 2026-03-01*
