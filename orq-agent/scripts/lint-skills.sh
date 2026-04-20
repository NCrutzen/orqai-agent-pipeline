#!/usr/bin/env bash
# lint-skills.sh — Enforce the 10 Skill Structure (SKST) rules across every skill file.
# Phase 34 Wave 0 deliverable. Exits 0 on all pass, 1 on any FAIL.

set -u

REPO_ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$REPO_ROOT"

REQUIRED_SECTIONS=(
  "## Constraints"
  "## When to use"
  "## When NOT to use"
  "## Companion Skills"
  "## Done When"
  "## Destructive Actions"
  "## Anti-Patterns"
  "## Open in orq.ai"
  "## Documentation & Resolution"
)

XML_OPEN_TAGS=(role pipeline files_to_read objective instructions)

usage() {
  cat <<'EOF'
Usage: bash orq-agent/scripts/lint-skills.sh [options]

Modes:
  (no args)                     Run ALL rules across default file set
                                (SKILL.md + commands/*.md + agents/*.md)
  --help                        Print this usage block and exit 0
  --file <path>                 Lint exactly one file against all applicable rules
  --files <dir>                 Lint every *.md directly under <dir> (non-recursive)
  --rule <rule-id>              Run ONLY the named rule across the default file set
  --rule <rule-id> --file <p>   Run ONLY the named rule against one file

Rule IDs:
  allowed-tools              commands + SKILL.md have non-empty 'allowed-tools:' frontmatter
  tools-declared             agents/*.md have non-empty 'tools:' frontmatter
  required-sections          all 9 H2 headings present, outside any XML block
  references-multi-consumer  every file under orq-agent/references/ is referenced by >= 2 skills

Exit codes:
  0  all checks pass
  1  any check failed (every failure prefixed with 'FAIL:')
EOF
}

fail=0
emit_fail() { echo "FAIL: $*"; fail=1; }

is_subagent() {
  case "$1" in
    *"/agents/"*) return 0 ;;
    *) return 1 ;;
  esac
}

# --- rule: required-sections (with XML-tag guard) ---
check_required_sections() {
  local f="$1"
  local s heading_line tag open_line close_line
  for s in "${REQUIRED_SECTIONS[@]}"; do
    if ! grep -qF "$s" "$f"; then
      emit_fail "$f — missing section '$s'"
      continue
    fi
    heading_line=$(grep -nF "$s" "$f" | head -1 | cut -d: -f1)
    [ -z "$heading_line" ] && continue
    for tag in "${XML_OPEN_TAGS[@]}"; do
      open_line=$(awk -v h="$heading_line" -v t="<${tag}>" 'NR<h && $0==t {ln=NR} END{print ln+0}' "$f")
      [ "$open_line" -eq 0 ] && continue
      close_line=$(awk -v o="$open_line" -v t="</${tag}>" 'NR>o && $0==t {print NR; exit}' "$f")
      if [ -n "$close_line" ] && [ "$close_line" -gt "$heading_line" ]; then
        emit_fail "${f}:${heading_line} — section '$s' is inside an unclosed XML block (must be outside)"
        break
      fi
    done
  done
}

# --- rule: allowed-tools (commands + SKILL.md) ---
check_allowed_tools() {
  local f="$1"
  local val
  val=$(awk '/^---$/{c++; if(c>=2)exit; next} c==1 && /^allowed-tools:[[:space:]]*[^[:space:]]/' "$f")
  if [ -z "$val" ]; then
    emit_fail "$f — missing or empty 'allowed-tools:' frontmatter key"
  fi
}

# --- rule: tools-declared (subagents) ---
check_tools_declared() {
  local f="$1"
  local val
  val=$(awk '/^---$/{c++; if(c>=2)exit; next} c==1 && /^tools:[[:space:]]*[^[:space:]]/' "$f")
  if [ -z "$val" ]; then
    emit_fail "$f — subagent missing or empty 'tools:' frontmatter key"
  fi
}

# --- rule: references-multi-consumer ---
check_references_multi_consumer() {
  local ref_dir="orq-agent/references"
  [ -d "$ref_dir" ] || return 0
  local ref_file base count
  for ref_file in "$ref_dir"/*.md; do
    [ -e "$ref_file" ] || continue
    base=$(basename "$ref_file")
    count=$(grep -lrE "references/${base}" orq-agent/SKILL.md orq-agent/commands orq-agent/agents 2>/dev/null | wc -l | tr -d ' ')
    if [ "$count" -lt 2 ]; then
      emit_fail "orq-agent/references/${base} — only ${count} consumer(s); single-consumer refs must live under <skill>/resources/ (SKST-02)"
    fi
  done
}

# --- apply one rule to one file (used by --rule X --file Y) ---
run_rule_on_file() {
  local rule="$1" f="$2"
  [ -f "$f" ] || { emit_fail "$f — file does not exist"; return; }
  case "$rule" in
    required-sections)
      check_required_sections "$f"
      ;;
    allowed-tools)
      if is_subagent "$f"; then
        :  # rule does not apply to subagents; silently no-op
      else
        check_allowed_tools "$f"
      fi
      ;;
    tools-declared)
      if is_subagent "$f"; then
        check_tools_declared "$f"
      else
        :  # rule does not apply to commands/SKILL.md; silently no-op
      fi
      ;;
    references-multi-consumer)
      # global rule; file argument ignored
      check_references_multi_consumer
      ;;
    *)
      echo "Unknown rule: $rule" >&2
      usage >&2
      exit 1
      ;;
  esac
}

# --- apply one rule to the default file set ---
run_rule_on_default_set() {
  local rule="$1" f
  case "$rule" in
    required-sections)
      while IFS= read -r f; do check_required_sections "$f"; done < <(default_file_set)
      ;;
    allowed-tools)
      while IFS= read -r f; do
        is_subagent "$f" || check_allowed_tools "$f"
      done < <(default_file_set)
      ;;
    tools-declared)
      while IFS= read -r f; do
        is_subagent "$f" && check_tools_declared "$f"
      done < <(default_file_set)
      ;;
    references-multi-consumer)
      check_references_multi_consumer
      ;;
    *)
      echo "Unknown rule: $rule" >&2
      usage >&2
      exit 1
      ;;
  esac
}

# --- lint every applicable rule on one file ---
lint_file_all_rules() {
  local f="$1"
  [ -f "$f" ] || { emit_fail "$f — file does not exist"; return; }
  check_required_sections "$f"
  if is_subagent "$f"; then
    check_tools_declared "$f"
  else
    check_allowed_tools "$f"
  fi
}

default_file_set() {
  [ -f "orq-agent/SKILL.md" ] && echo "orq-agent/SKILL.md"
  for f in orq-agent/commands/*.md; do [ -e "$f" ] && echo "$f"; done
  for f in orq-agent/agents/*.md; do [ -e "$f" ] && echo "$f"; done
}

# --- arg parsing (supports combined --rule X --file Y) ---
MODE="all"
FILE_ARG=""
DIR_ARG=""
RULE_ARG=""

while [ $# -gt 0 ]; do
  case "$1" in
    --help) usage; exit 0 ;;
    --file) FILE_ARG="${2:?--file requires a path}"; shift 2 ;;
    --files) DIR_ARG="${2:?--files requires a directory}"; shift 2 ;;
    --rule) RULE_ARG="${2:?--rule requires a rule-id}"; shift 2 ;;
    *) echo "Unknown option: $1" >&2; usage >&2; exit 1 ;;
  esac
done

# --- dispatch ---
if [ -n "$RULE_ARG" ] && [ -n "$FILE_ARG" ]; then
  run_rule_on_file "$RULE_ARG" "$FILE_ARG"
elif [ -n "$RULE_ARG" ]; then
  run_rule_on_default_set "$RULE_ARG"
elif [ -n "$FILE_ARG" ]; then
  lint_file_all_rules "$FILE_ARG"
elif [ -n "$DIR_ARG" ]; then
  for f in "${DIR_ARG%/}"/*.md; do
    [ -e "$f" ] || continue
    lint_file_all_rules "$f"
  done
else
  while IFS= read -r f; do lint_file_all_rules "$f"; done < <(default_file_set)
  check_references_multi_consumer
fi

exit $fail
