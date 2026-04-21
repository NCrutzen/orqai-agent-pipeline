# Coverage Rules (DSET-03)

Single-consumer reference for `orq-agent/agents/dataset-generator.md`. Rules are enforced BEFORE upload; violations BLOCK the upload with a remediation message printed verbatim to the user.

## Rule 1: Minimum Count

Every dimension value MUST appear in ≥2 datapoints.

**Rationale:** A dimension value that only appears once cannot be evaluated for consistency. A single-example value is indistinguishable from an outlier and inflates evaluator variance.

## Rule 2: Maximum Share

No single dimension value may exceed 30% of total datapoints across its dimension.

**Rationale:** If one value dominates, the dataset collapses to a single slice and aggregate pass-rate becomes a proxy for that slice. Under-represented slices become invisible.

## Remediation Messages

On violation, emit one of these messages verbatim. The `Coverage check failed:` prefix is the lint / grep anchor downstream tooling relies on; do not reword it.

- `Coverage check failed: value 'X' appears in only 1 datapoint (need ≥2). Add datapoints or adjust dimensions.`
- `Coverage check failed: value 'X' dominates 42% (limit is 30%). Rebalance by adding datapoints for under-represented values.`

Substitute the actual value name for `X` and the actual percentage for `42%`; keep every other byte identical.

## Worked Example

Suppose dimension `user_persona: [novice, expert, non-native-speaker]` across 10 datapoints with distribution `novice=7, expert=2, non-native-speaker=1`.

- **Rule 1 fires:** `non-native-speaker` count=1 (<2).
  - Emit: `Coverage check failed: value 'non-native-speaker' appears in only 1 datapoint (need ≥2). Add datapoints or adjust dimensions.`
- **Rule 2 fires:** `novice` share=70% (>30%).
  - Emit: `Coverage check failed: value 'novice' dominates 70% (limit is 30%). Rebalance by adding datapoints for under-represented values.`

**Fix:** Add 3 more `expert` datapoints and 3 more `non-native-speaker` datapoints. Distribution becomes `novice=7, expert=5, non-native-speaker=4` across 16 datapoints. `novice` share = 7/16 = 43.75% (still >30%). Either remove 4 `novice` datapoints OR add 10 more balancing datapoints across `expert`/`non-native-speaker`. Re-run coverage check until both rules pass.

## When Rules Are Skipped

- `--mode promote-trace`: produces a single datapoint by construction (one production trace → one regression case). Rules do not apply; skip silently.
- `--mode flat` without dimensions: a flat dataset with no `dimension_values` has nothing to check. Rules skip with warning: `Coverage rules require dimension_values; flat-mode datasets are not coverage-checked.`
- `--mode curation` re-runs both rules after any destructive operation (dedupe, rebalance removal) so curation cannot leave the dataset in a rule-violating state.
