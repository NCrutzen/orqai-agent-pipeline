# Iterator Decision Trees (ESCI-06)

Iterator publishes 3 inspectable decision trees per iteration — users can audit the decision path without re-running the pipeline. Each tree renders as ASCII in the action plan so the choice is visible in plain text, and each has a single named decision token used by downstream tooling for verbatim matching.

The three trees fire in order. Tree 1 decides where to spend the iteration. Tree 2 decides whether to escalate past P0/P1. Tree 3 decides whether the evaluator itself is ready to serve as gatekeeper.

---

## Tree 1: Prompt Fix vs Evaluator

**Decision token:** `prompt fix vs evaluator`

**Rule:** If the current evaluator's TPR or TNR is below 90% on the held-out test split, the bottleneck is *evaluator quality*, not *model behavior*. Fix the evaluator before changing the prompt — otherwise every subsequent prompt iteration is steered by a miscalibrated signal.

```
start: failing capability identified
│
├── TPR ≥ 0.90 AND TNR ≥ 0.90?
│   │
│   ├── yes ──► prompt fix path (open P0 ticket on system prompt / few-shot / schema)
│   │
│   └── no  ──► evaluator fix path (re-calibrate judge; re-run TPR/TNR; DO NOT edit prompt)
│
└── no labels yet? ──► run evaluator-validator BEFORE iterating
```

Rationale: a prompt "improvement" measured by a 70%-TPR judge is indistinguishable from noise. The iterator refuses to spend P0 budget on prompt edits when the evaluator is miscalibrated.

---

## Tree 2: Upgrade Model?

**Decision token:** `upgrade model`

**Rule:** A model upgrade is a P2 action. It fires only when P0 is exhausted (applied + re-evaluated, no gain ≥ 0.02) AND the bottleneck capability remains below target on the held-out split. Upgrading too early hides correctable prompt/eval defects behind a more expensive model.

```
start: iteration N complete
│
├── P0 exhausted (applied + measured, Δ < 0.02)?
│   │
│   ├── no  ──► next P0 candidate (stay on current tier)
│   │
│   └── yes ──► bottleneck < target on holdout?
│               │
│               ├── no  ──► promote; no upgrade needed
│               │
│               └── yes ──► open P2: upgrade model (e.g., mini → full, or full → next-gen)
│                            └── include cost delta + projected win from model card
```

Rationale: model upgrades are expensive and irreversible in budget terms. Gate them behind a demonstrable "prompts and evals can't reach target on current tier."

---

## Tree 3: Eval Good Enough?

**Decision token:** `eval good enough`

**Rule:** The evaluator itself is a model under test. It is "good enough" to gatekeep iteration only when TPR ≥ 90% AND TNR ≥ 90% measured on the held-out **test** split (disjoint from train/dev per EVLD-05). Below that, iterator must not trust the judge's pass/fail verdicts as drivers of P0/P1 tickets.

```
start: evaluator candidate trained on train/dev
│
├── TPR on test split ≥ 0.90?
│   │
│   ├── no  ──► re-calibrate judge (criterion wording, few-shot examples from train)
│   │
│   └── yes ──► TNR on test split ≥ 0.90?
│               │
│               ├── no  ──► re-calibrate (specifically fail-class examples)
│               │
│               └── yes ──► evaluator validated; safe to drive P0 tickets
```

Rationale: TPR alone catches "misses pass-quality work." TNR alone catches "incorrectly blesses fail-quality work." Both must clear the bar — a one-sided judge will push iteration in a systematically wrong direction.

---

## Rendering in the Action Plan

Each iteration's action plan embeds the three ASCII trees verbatim under an `## Inspectable Decisions` section, with the branch actually taken this iteration highlighted by a trailing `◀── taken` marker. This preserves auditability across iterations.
