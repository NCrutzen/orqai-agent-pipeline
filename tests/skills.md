# Skills Test Manifest (DIST-06)

Expected subagent files under `orq-agent/agents/`. Each must pass Phase 34 SKST lint (`bash orq-agent/scripts/lint-skills.sh`).

| File | Role |
|------|------|
| `architect.md` | Swarm topology |
| `spec-generator.md` | Agent spec emitter (Phase 35 snapshot pinning) |
| `orchestration-generator.md` | Multi-agent orchestration |
| `tool-resolver.md` | Tool catalog resolution |
| `researcher.md` | Domain research (Phase 35 capable-first policy) |
| `readme-generator.md` | README emitter |
| `dataset-generator.md` | Dataset synthesis (Phase 39 two-step/vectors/curation/promote-trace) |
| `dataset-preparer.md` | Dataset upload + smoke test |
| `deployer.md` | Agent deploy |
| `experiment-runner.md` | Experiment execution |
| `results-analyzer.md` | Results analysis (Phase 42 ITRX-04 ⚠ regression) |
| `tester.md` | Test orchestration (Phase 42 overfitting + run-comparison) |
| `failure-diagnoser.md` | Failure classification (Phase 42 4-class) |
| `prompt-editor.md` | Prompt diff apply |
| `iterator.md` | P0/P1/P2 Action Plans (Phase 42) |
| `hardener.md` | TPR/TNR ≥ 90% gate + sample_rate (Phase 42) |
| `kb-generator.md` | KB synthesis (Phase 40 chunking policy) |
| `memory-store-generator.md` | Memory store generator (Phase 40) |
| `evaluator-validator.md` | Binary-first judges + TPR/TNR (Phase 42) |

Full lint:

```bash
bash orq-agent/scripts/lint-skills.sh
```
