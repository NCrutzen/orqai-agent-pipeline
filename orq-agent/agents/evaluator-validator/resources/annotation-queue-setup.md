# Annotation Queue / Human Review Setup (EVLD-09)

The evaluator-validator subagent creates an Annotation Queue at the start of every judge-validation run. The queue is where human reviewers attach Pass/Fail labels to traces; those labels become the ground truth for TPR/TNR measurement (EVLD-06) and the source of few-shot exemplars for the 4-component judge template (EVLD-03).

This file describes how the subagent provisions the queue, what schema it picks, and how it polls until enough labels have accumulated to proceed.

---

## MCP-First Provisioning

Preferred path — call the MCP tool `annotation-queues-create` with payload:

```json
{
  "name": "eval-validator-{criterion}-{timestamp}",
  "description": "Human labels for {criterion} judge TPR/TNR validation (EVLD-06)",
  "label_schema": "categorical-pass-fail"
}
```

The MCP call returns `{queue_id, queue_url}`. Surface `queue_url` to the user so they can open the queue UI directly.

### REST Fallback

If the MCP tool is unavailable or returns an error, fall back to the REST endpoint `POST /v2/annotation-queues` with the same payload. Only fall back after a single MCP failure — do not default to REST when MCP works.

---

## Schema Options

Default and required for TPR/TNR work is categorical Pass/Fail. Alternatives exist for exploratory criteria but are not used for judge validation itself.

| Schema                 | When to use                                                           |
| ---------------------- | --------------------------------------------------------------------- |
| `categorical-pass-fail` | **Default.** Binary label → directly feeds TPR/TNR confusion matrix. |
| `sentiment`            | Exploratory — tone/satisfaction scoring; not for judge validation.   |
| `numeric-range`        | Likert-style quality scoring; convert to binary before TPR/TNR.      |
| `free-text`            | Qualitative comments; valuable for criterion tuning, not scoring.    |

For judge validation the subagent always requests `categorical-pass-fail`. Other schemas can be added as secondary queues if the user explicitly wants richer signal, but they do not gate the validation workflow.

---

## Queue URL Emission

After queue creation the subagent prints:

```
Annotation Queue created: <queue_url>
Label schema: categorical-pass-fail
Target: ≥50 Pass and ≥50 Fail labels before TPR/TNR measurement.
```

The URL is the entry point the user visits in the Orq app to start labeling. No CLI labeling path — humans label in the UI.

---

## Polling Until Balanced

The subagent polls `annotations-list --queue {id}` at a modest interval (suggested: 60s) and tracks running counts of Pass and Fail labels.

Progress rule: **continue polling until `count_pass ≥ 50 AND count_fail ≥ 50`**. The floor is 50/50 — above the 30/30 statistical minimum from EVLD-06 — because some labels will be discarded during inter-annotator agreement filtering.

While polling, the subagent prints periodic status:

```
[t=12m] Labels collected: 37 Pass / 14 Fail (need 50/50)
```

---

## Balanced Collection Guidance

Queues drift. If an agent's true pass rate is ~85% the queue will naturally return ~85% Pass labels — reviewers finish the Pass side long before the Fail side. Two guardrails:

- **Skew detection:** if the running ratio drifts past `70/30` (either direction), the subagent pauses label acceptance and asks the user to request more of the minority class from the orchestrator. This is surfaced as `⚠️ skew: 78/22 — requesting more Fail examples`.
- **Targeted sampling:** when requesting more of a minority class, bias the trace sampler toward traces whose current judge verdict is the minority class. This over-samples contested regions where labels matter most.

---

## Annotation Queue vs Human Review

The two terms are related but distinct — both appear verbatim in the evaluator-validator subagent prompt and in downstream tooling:

- **Annotation Queue** — the persistent container holding traces awaiting labels. Created once per criterion per validation run; owned by the evaluator-validator workflow.
- **Human Review** — the interactive session a reviewer opens against a queue. A single Annotation Queue can be worked across many Human Review sessions by one or more reviewers.

Practically: the subagent *creates* Annotation Queues; reviewers *conduct* Human Review against them. Inter-annotator agreement (EVLD-10) is computed across the Human Review sessions attached to a single Annotation Queue.
