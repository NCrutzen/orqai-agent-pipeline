# Commands Test Manifest (DIST-06)

Expected slash commands. Each row names the file, the user-facing invocation, and a smoke assertion.

| File | Invocation | Smoke assertion |
|------|------------|-----------------|
| `orq-agent/commands/orq-agent.md` | `/orq-agent "<use case>"` | Emits an agent spec directory under `./Agents/` |
| `orq-agent/commands/prompt.md` | `/orq-agent:prompt "<use case>"` | Emits single-agent spec (fast path) |
| `orq-agent/commands/architect.md` | `/orq-agent:architect` | Outputs swarm topology blueprint |
| `orq-agent/commands/research.md` | `/orq-agent:research "<domain>"` | Emits domain research doc |
| `orq-agent/commands/datasets.md` | `/orq-agent:datasets --mode two-step\|flat\|curation\|promote-trace` | Generates/curates/promotes datapoints |
| `orq-agent/commands/tools.md` | `/orq-agent:tools` | Emits TOOLS.md |
| `orq-agent/commands/deploy.md` | `/orq-agent:deploy` | Deploys spec to Orq.ai (deploy+ tier) |
| `orq-agent/commands/test.md` | `/orq-agent:test` | Runs experiment (test+ tier) |
| `orq-agent/commands/iterate.md` | `/orq-agent:iterate` | Iterates prompts (full tier) |
| `orq-agent/commands/harden.md` | `/orq-agent:harden` | Promotes evaluators to guardrails (full tier) |
| `orq-agent/commands/kb.md` | `/orq-agent:kb --mode kb\|memory` | Creates KB / memory store |
| `orq-agent/commands/systems.md` | `/orq-agent:systems` | Manages IT systems registry |
| `orq-agent/commands/set-profile.md` | `/orq-agent:set-profile` | Changes model profile |
| `orq-agent/commands/update.md` | `/orq-agent:update` | Updates the skill |
| `orq-agent/commands/help.md` | `/orq-agent:help` | Prints command index |
| `orq-agent/commands/workspace.md` | `/orq-agent:workspace` | Workspace overview (Phase 36) |
| `orq-agent/commands/traces.md` | `/orq-agent:traces [--deployment] [--status] [--last] [--limit] [--identity]` | Trace query (Phase 36/37) |
| `orq-agent/commands/analytics.md` | `/orq-agent:analytics [--last] [--group-by]` | Analytics (Phase 36) |
| `orq-agent/commands/models.md` | `/orq-agent:models [search]` | Model Garden list (Phase 36) |
| `orq-agent/commands/quickstart.md` | `/orq-agent:quickstart` | 12-step onboarding (Phase 36) |
| `orq-agent/commands/automations.md` | `/orq-agent:automations [--create]` | Trace Automations (Phase 36) |
| `orq-agent/commands/observability.md` | `/orq-agent:observability` | Instrumentation setup (Phase 37) |
| `orq-agent/commands/trace-failure-analysis.md` | `/orq-agent:trace-failure-analysis` | Failure-mode taxonomy (Phase 38) |
| `orq-agent/commands/prompt-optimization.md` | `/orq-agent:prompt-optimization` | 11-guideline prompt review (Phase 41) |
| `orq-agent/commands/compare-frameworks.md` | `/orq-agent:compare-frameworks` | Cross-framework evaluatorq benchmark (Phase 41) |

Validation:

```bash
bash tests/scripts/validate-plugin-manifests.sh
```
