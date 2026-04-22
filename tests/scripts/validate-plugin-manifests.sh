#!/usr/bin/env bash
# tests/scripts/validate-plugin-manifests.sh
# DIST-06 — validate all plugin manifests + MCP registrations + skills install surface.
# Exit 0 on all green, exit 1 on any miss.
# Zero runtime deps beyond bash + grep + (optional) jq / python3 -m json.tool.

set -u
fails=0

say_ok() { printf '  \033[32mOK\033[0m  %s\n' "$1"; }
say_fail() { printf '  \033[31mFAIL\033[0m %s\n' "$1"; fails=$((fails+1)); }

json_valid() {
  local f="$1"
  if command -v jq >/dev/null 2>&1; then
    jq . "$f" >/dev/null 2>&1
  else
    python3 -m json.tool "$f" >/dev/null 2>&1
  fi
}

check_file_exists() {
  local f="$1" label="$2"
  if [ -f "$f" ]; then say_ok "$label exists ($f)"; else say_fail "$label missing ($f)"; fi
}

check_json_valid() {
  local f="$1"
  if [ ! -f "$f" ]; then return; fi
  if json_valid "$f"; then say_ok "$(basename "$f") is valid JSON"; else say_fail "$(basename "$f") is INVALID JSON"; fi
}

check_grep() {
  local f="$1" pattern="$2" label="$3"
  if [ ! -f "$f" ]; then say_fail "$label: file missing"; return; fi
  if grep -qF "$pattern" "$f"; then say_ok "$label"; else say_fail "$label (missing '$pattern' in $f)"; fi
}

echo "== DIST-01: .claude-plugin/plugin.json =="
check_file_exists ".claude-plugin/plugin.json" "Claude plugin manifest"
check_json_valid ".claude-plugin/plugin.json"
check_grep ".claude-plugin/plugin.json" '"name"' "Claude plugin has name"

echo ""
echo "== DIST-02a: .cursor-plugin/plugin.json =="
check_file_exists ".cursor-plugin/plugin.json" "Cursor plugin manifest"
check_json_valid ".cursor-plugin/plugin.json"
check_grep ".cursor-plugin/plugin.json" './orq-agent/' "Cursor manifest references skills dir"
check_grep ".cursor-plugin/plugin.json" './.mcp.json' "Cursor manifest references .mcp.json"

echo ""
echo "== DIST-02b: plugins/orq/.codex-plugin/plugin.json =="
check_file_exists "plugins/orq/.codex-plugin/plugin.json" "Codex plugin manifest"
check_json_valid "plugins/orq/.codex-plugin/plugin.json"

echo ""
echo "== DIST-02c: .agents/plugins/marketplace.json =="
check_file_exists ".agents/plugins/marketplace.json" "Marketplace manifest"
check_json_valid ".agents/plugins/marketplace.json"
check_grep ".agents/plugins/marketplace.json" 'plugins/orq' "Marketplace references plugins/orq"

echo ""
echo "== DIST-04: root mcp.json / .mcp.json =="
check_file_exists "mcp.json" "root mcp.json"
check_file_exists ".mcp.json" "root .mcp.json"
check_json_valid "mcp.json"
check_json_valid ".mcp.json"
check_grep ".mcp.json" 'orq-workspace' ".mcp.json registers orq-workspace server"
check_grep ".mcp.json" '${ORQ_API_KEY}' ".mcp.json uses \${ORQ_API_KEY} expansion"

echo ""
echo "== DIST-05: package.json for npx skills add =="
check_file_exists "package.json" "package.json"
check_json_valid "package.json"
check_grep "package.json" '"skills"' "package.json has skills field"
check_grep "package.json" 'orq-agent/SKILL.md' "package.json points to SKILL.md"

echo ""
echo "== DIST-06: test manifests =="
check_file_exists "tests/commands.md" "tests/commands.md"
check_file_exists "tests/skills.md" "tests/skills.md"
check_file_exists "tests/mcp-tools.md" "tests/mcp-tools.md"

echo ""
echo "== DIST-07: CI/CD scaffolds (templates for consumer repos) =="
check_file_exists "templates/ci/github-actions-orq-test.yml.template" "GitHub Actions template"
check_file_exists "templates/ci/gitlab-ci.yml.template" "GitLab CI template"
check_file_exists "templates/ci/README.md" "Templates README"
check_grep "templates/ci/github-actions-orq-test.yml.template" 'orq-agent:test' "GitHub template invokes /orq-agent:test"
check_grep "templates/ci/github-actions-orq-test.yml.template" 'ITRX-04' "GitHub template references ITRX-04 regression flag"
check_grep "templates/ci/gitlab-ci.yml.template" 'orq-agent:test' "GitLab template invokes /orq-agent:test"
check_grep "templates/ci/gitlab-ci.yml.template" 'ITRX-04' "GitLab template references ITRX-04 regression flag"
check_file_exists ".github/workflows/skill-ci.yml" "Skill-local CI workflow (lint only, no secrets)"

echo ""
if [ "$fails" -eq 0 ]; then
  echo "All manifest checks PASSED (DIST-01..07)"
  exit 0
else
  echo "FAILED: $fails check(s) missing — see above"
  exit 1
fi
