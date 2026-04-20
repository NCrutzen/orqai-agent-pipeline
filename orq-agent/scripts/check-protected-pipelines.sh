#!/usr/bin/env bash
# check-protected-pipelines.sh — Golden SHA-256 capture + verify for the 3 protected
# Orq.ai command entry points. Guards byte-identical <pipeline> blocks per Phase 34
# ROADMAP success criterion #5. New SKST sections sit OUTSIDE <pipeline>; this script
# verifies only the pipeline block itself, not the whole file.

set -eu

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

PROTECTED_COMMANDS=(orq-agent prompt architect)
GOLDEN_DIR=".planning/phases/34-skill-structure-format-foundation/golden"

usage() {
  cat <<'EOF'
Usage: bash orq-agent/scripts/check-protected-pipelines.sh [--baseline]

Modes:
  (no args)    Verify current <pipeline> block hashes vs golden. Exit 0 on all match.
  --baseline   Recompute hashes and write to golden/<cmd>.sha256. Use ONLY in Wave 0
               or when pipeline changes are intentional + documented in a SUMMARY.

Protected commands (hard-coded): orq-agent, prompt, architect
Golden dir: .planning/phases/34-skill-structure-format-foundation/golden/

Exit codes:
  0  all pipeline blocks match golden
  1  any mismatch, missing golden, or empty pipeline block
EOF
}

extract_hash() {
  local cmd="$1" src="orq-agent/commands/${cmd}.md"
  if [ ! -f "$src" ]; then
    echo "FAIL: ${src} does not exist" >&2
    return 1
  fi
  local block
  block=$(awk '/^<pipeline>$/{flag=1;next} /^<\/pipeline>$/{flag=0} flag' "$src")
  if [ -z "$block" ]; then
    echo "FAIL: orq-agent/commands/${cmd}.md has no <pipeline>...</pipeline> block" >&2
    return 1
  fi
  printf '%s' "$block" | shasum -a 256 | cut -d' ' -f1
}

mode_baseline() {
  mkdir -p "$GOLDEN_DIR"
  local cmd hash dest
  for cmd in "${PROTECTED_COMMANDS[@]}"; do
    hash=$(extract_hash "$cmd") || exit 1
    dest="${GOLDEN_DIR}/${cmd}.sha256"
    echo "$hash" > "$dest"
    echo "WROTE: golden/${cmd}.sha256 $hash"
  done
}

mode_verify() {
  local cmd current golden golden_file fail=0
  for cmd in "${PROTECTED_COMMANDS[@]}"; do
    golden_file="${GOLDEN_DIR}/${cmd}.sha256"
    if [ ! -f "$golden_file" ]; then
      echo "FAIL: ${golden_file} does not exist — run with --baseline first"
      fail=1
      continue
    fi
    golden=$(tr -d '[:space:]' < "$golden_file")
    current=$(extract_hash "$cmd") || { fail=1; continue; }
    if [ "$current" = "$golden" ]; then
      echo "OK: ${cmd}.sha256 matches"
    else
      echo "FAIL: orq-agent/commands/${cmd}.md <pipeline> block changed (${current} vs ${golden}). If intentional, re-baseline with: bash orq-agent/scripts/check-protected-pipelines.sh --baseline"
      fail=1
    fi
  done
  return $fail
}

case "${1:-}" in
  --help) usage; exit 0 ;;
  --baseline) mode_baseline ;;
  "") mode_verify ;;
  *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
esac
