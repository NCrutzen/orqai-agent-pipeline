---
phase: 43
slug: cross-ide-distribution-manifests
status: passed
requirements: DIST-01, DIST-02, DIST-03, DIST-04, DIST-05, DIST-06, DIST-07
created: 2026-04-22
---

# Phase 43 Verification — Cross-IDE Distribution & Manifests

## Gates (all green)

- `bash tests/scripts/validate-plugin-manifests.sh` → exit 0 (26/26 checks passed across DIST-01..07)
- `bash orq-agent/scripts/lint-skills.sh` → exit 0
- `bash orq-agent/scripts/check-protected-pipelines.sh` → 3/3 SHA-256 match

## Requirement Traceability

| Req | Artifact |
|-----|----------|
| DIST-01 | `.claude-plugin/plugin.json` + `.claude-plugin/marketplace.json` (pre-existing, retained) |
| DIST-02 | `.cursor-plugin/plugin.json`, `plugins/orq/.codex-plugin/plugin.json`, `.agents/plugins/marketplace.json` |
| DIST-03 | `.mcp.json` + `mcp.json` (single-source MCP registration with `orq-workspace` + `${ORQ_API_KEY}`) |
| DIST-04 | `.mcp.json` / `mcp.json` (same as DIST-03 — one source of truth referenced from all plugin manifests) |
| DIST-05 | `package.json` (skills field → `./orq-agent/SKILL.md`, `files` allowlist, installable via `npx skills add NCrutzen/orqai-agent-pipeline`) |
| DIST-06 | `tests/scripts/validate-plugin-manifests.sh`, `tests/commands.md`, `tests/skills.md`, `tests/mcp-tools.md` |
| DIST-07 | `.github/workflows/orq-agent-test.yml`, `.gitlab-ci.yml` — both invoke `/orq-agent:test` and fail the build on ⚠️ regression (ITRX-04) |

## ROADMAP Success Criteria

1. `.claude-plugin/plugin.json` for one-line install — ✓
2. `.cursor-plugin/plugin.json` + `.codex-plugin/plugin.json` + marketplace manifest — ✓
3. root `mcp.json` / `.mcp.json` with `orq-workspace` + `${ORQ_API_KEY}` — ✓
4. `npx skills add` installable via `package.json` skills field — ✓
5. `tests/scripts/validate-plugin-manifests.sh` + 3 test manifests + GitHub Actions + GitLab CI templates that fail on ITRX-04 — ✓

## Manual smokes deferred to `/gsd:verify-work 43`

- Live `/plugin install github:NCrutzen/orqai-agent-pipeline` end-to-end in Claude Code
- Live `~/.cursor/plugins/local/` load of `.cursor-plugin/plugin.json`
- Live `npx skills add NCrutzen/orqai-agent-pipeline` into Cursor/Gemini/Cline/Copilot/Windsurf
- Live CI run on PR with a seeded regression — confirm the workflow fails with `⚠️` grep
