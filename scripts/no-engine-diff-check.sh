#!/usr/bin/env bash
#
# Phase 114-05 Task 2 — STAGE2-01 no-Engine-diff guard (PRECISE scope).
#
# STAGE2-01 claims the sales Stage 2 onboarding introduced ZERO changes to the
# resolution LOGIC. This script makes that claim verifiable-as-worded.
#
# The precise definition of "Engine" (RESEARCH Pitfall 2 / OQ-2, PATTERNS Shared
# Pattern):
#   - MUST be byte-identical to the donor:
#       web/lib/agentic-pipeline/resolve/engine.ts
#       web/lib/agentic-pipeline/resolve/config.ts
#       web/lib/agentic-pipeline/resolve/steps/*        (every file)
#   - The ONLY allowed change vs the donor is the SINGLE sales
#     STAGE2_RESOLVER_MODULES registration entry in web/lib/swarms/dynamic.ts
#     (bundler-mandated dispatch line — NOT a resolution-logic change).
#
# A blanket `git diff` grep over web/lib/swarms/ or web/lib/agentic-pipeline/
# would WRONGLY FAIL on that mandatory dispatch-map line. This guard scopes to
# the named logic files and inspects the dynamic.ts diff line-by-line.
#
# Baseline = the donor branch where Plan 01 transplanted the seam verbatim:
#   origin/workspace/v8.2-resolution-recall
# We compare the working-tree files against `git show <donor>:<path>` and assert
# byte-equality (logic files) or the precisely-scoped diff (dynamic.ts).
#
# Exit 0 = STAGE2-01 holds. Exit 1 = a logic-file drifted or dynamic.ts changed
# beyond the single sales registration entry (with the offending file printed).
#
# Run: ./scripts/no-engine-diff-check.sh   (also wired as a /gsd:verify-work gate)

set -euo pipefail

# Phase 121-02 RE-BASELINE (FINAL STAGE2-01 for post-123 workspace, supersedes the
# post-120 baseline): the donor is re-pointed from b831e3f6 (post-120) to b816c627
# (post-123 — the tip carrying the resolve_candidates sender_match rewire + the
# corroboration collect-path no-op tiebreaker, which legitimately evolved engine.ts/
# steps/* when Phase 120 + 123 merged into this workspace from origin/main). Against
# the OLD post-120 donor the guard CORRECTLY reports drift mid-phase (engine.ts/
# sender-match.ts legitimately gained the 123 resolve_candidates rewire — the same
# Pitfall 1 the 120-04 re-baseline note describes). With the donor re-baselined to
# the merged-in post-123 engine, the guard re-asserts what STAGE2-01 means for THIS
# phase: 121-02 (attachment xlsx/csv extraction) introduces ZERO FURTHER engine
# drift on top of the post-123 engine. 121-02's only code change is adapter-side
# (extract.ts) — engine/config/steps stay byte-identical. Override seam preserved
# via NO_ENGINE_DIFF_BASELINE.
DONOR="${NO_ENGINE_DIFF_BASELINE:-b816c627}"

# Resolve repo root so the script works from any cwd.
REPO_ROOT="$(git rev-parse --show-toplevel)"
cd "$REPO_ROOT"

# Resolution-LOGIC files that MUST be byte-identical to the donor.
LOGIC_FILES=(
  "web/lib/agentic-pipeline/resolve/engine.ts"
  "web/lib/agentic-pipeline/resolve/config.ts"
)
# Every file under resolve/steps/ (donor set), discovered from the donor tree so a
# deleted or renamed step is also caught.
while IFS= read -r f; do
  [ -n "$f" ] && LOGIC_FILES+=("$f")
done < <(git ls-tree -r --name-only "$DONOR" -- web/lib/agentic-pipeline/resolve/steps/ 2>/dev/null || true)

DISPATCH_FILE="web/lib/swarms/dynamic.ts"

# The single allowed dynamic.ts change: the sales STAGE2_RESOLVER_MODULES entry —
# its registration lines (referencing the sales resolver module path), an
# `import(...)` of that path, and the two-line Phase-114 comment marker that
# documents WHY the line is bundler-mandated (the "Phase 114" header line + its
# "Pitfall 2 …" continuation). NO donor lines may be removed.
ALLOWED_ADD_PATTERN='automations/sales-email/resolve-customer|Phase 114|Pitfall 2'

fail() {
  echo "FAIL (STAGE2-01 violated): $1" >&2
  exit 1
}

echo "no-engine-diff-check — baseline: $DONOR"
echo "----------------------------------------------------------------------"

# Confirm the donor ref is reachable (a missing fetch would silently weaken the gate).
if ! git rev-parse --verify --quiet "$DONOR^{commit}" >/dev/null; then
  fail "baseline ref '$DONOR' not found — run: git fetch origin workspace/v8.2-resolution-recall"
fi

# 1) Byte-equality of engine.ts / config.ts / steps/* against the donor.
for f in "${LOGIC_FILES[@]}"; do
  if [ ! -f "$f" ]; then
    fail "resolution-logic file missing from working tree: $f"
  fi
  if ! git cat-file -e "$DONOR:$f" 2>/dev/null; then
    fail "resolution-logic file absent on donor baseline (unexpected new file?): $f"
  fi
  # Compare donor blob content against the working-tree file byte-for-byte.
  if ! diff -q <(git show "$DONOR:$f") "$f" >/dev/null; then
    fail "resolution-logic file DIFFERS from donor (engine drift): $f"
  fi
  echo "  IDENTICAL  $f"
done

# 2) dynamic.ts — allow ONLY the single sales registration entry.
if [ ! -f "$DISPATCH_FILE" ]; then
  fail "dispatch file missing: $DISPATCH_FILE"
fi

# Unified diff with zero context, donor → working tree. Inspect each +/- line.
DIFF="$(diff -u <(git show "$DONOR:$DISPATCH_FILE") "$DISPATCH_FILE" || true)"

# 2a) No donor lines may be REMOVED (a '-' line that is not the '---' file header).
if echo "$DIFF" | grep -E '^-[^-]' | grep -qv '^--- '; then
  echo "$DIFF" | grep -E '^-[^-]' | grep -v '^--- ' >&2
  fail "$DISPATCH_FILE removes donor lines (only the sales registration entry may be ADDED)"
fi

# 2b) Every ADDED line ('+' that is not the '+++' file header) must match the
#     allowed sales-registration pattern. Anything else → broader change → fail.
UNEXPECTED_ADDS="$(echo "$DIFF" | grep -E '^\+[^+]' | grep -v '^+++ ' | grep -Ev "$ALLOWED_ADD_PATTERN" || true)"
if [ -n "$UNEXPECTED_ADDS" ]; then
  echo "Unexpected added lines in $DISPATCH_FILE:" >&2
  echo "$UNEXPECTED_ADDS" >&2
  fail "$DISPATCH_FILE changed beyond the single sales STAGE2_RESOLVER_MODULES entry"
fi

if [ -z "$DIFF" ]; then
  echo "  UNCHANGED  $DISPATCH_FILE (no sales entry yet?)"
else
  echo "  SCOPED-OK  $DISPATCH_FILE (only the sales registration entry added)"
fi

echo "----------------------------------------------------------------------"
echo "PASS — STAGE2-01 holds: engine/config/steps byte-identical to donor;"
echo "       dynamic.ts changed only by the sales registration entry."
exit 0
