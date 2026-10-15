orqai-agent-pipeline: Nick's own tooling for designing, deploying and testing Orq.ai agents.

## Review calibration

Review the code itself as thoroughly as before: read the diff and the code it touches, and report real defects.
This section only sets how findings are weighed and how a review loop ends.

- **P1** only when the diff, as merged, does something wrong in normal use: wrong or lost data, a secret exposed, a
  feature or existing guard that stops working, a check that cannot fail. State the concrete input or state and the wrong outcome.
- **P2** for anything else worth saying, once. Every extra P2 costs a full review round.
- **Do not flag:** style; speculative robustness (crashes mid-operation, running as root, races, network loss) that the PR
  does not claim to handle; exotic syntax or inputs nobody in this repo uses; existing code the PR does not touch.
- **Hooks, guards and gates stop mistakes by a cooperating agent; they are not a sandbox against an attacker.** A bypass
  that only works on purpose is not a finding.
- **At most three findings per review**, most serious first. Prefer two hard findings to six soft ones.
- **Re-reviews** (`@codex review` after fixes): check whether your earlier findings are resolved and review only what
  changed. No new P2s on unchanged lines, do not re-raise a point the author answered with a reason, and do not open a
  new category of edge case in code you already reviewed. If no P1 remains, say so in one line: that ends the loop.
