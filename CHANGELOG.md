# Changelog

## 2.1.0 (2026-03-02)

### Added
- `/orq-agent:kb` — Standalone Knowledge Base management (generate content, provision, upload, full setup)
- KB content generation agent — auto-generates KB documents (FAQs, policies, knowledge articles) from pipeline context when user has no docs
- KB provisioning in `/orq-agent:deploy` — creates KBs in Orq.ai or configures external providers (Supabase, Pinecone, Weaviate) during deployment
- Embedding model picker and chunking strategy mapping from ORCHESTRATION.md specs
- File upload and auto-chunking during deploy for users with local documents
- "Generate KB content for me" option in deploy flow for hands-free KB setup
- Knowledge Bases API endpoints added to reference documentation

## 2.0.2 (2026-03-02)

### Fixed
- MCP server URL corrected to `https://my.orq.ai/v2/mcp`
- MCP auth uses Bearer header instead of env var
- API key stored in config.json and loaded at runtime (no longer relies on shell profile)
- MCP detection matches all Orq.ai server name variants

## 2.0.1 (2026-03-02)

### Fixed
- Commands now registered in `~/.claude/commands/orq-agent/` for slash command discovery
- Interactive prompts (tier selection, API key) now work with `curl | bash`
- Added `--reconfigure` flag to change tier/API key after install
- Added restart reminder after install

## 2.0.0 (2026-03-02)

Autonomous Orq.ai Pipeline - deploy, test, iterate, and harden agents directly from Claude Code.

**Upgrading from 1.0.0:** Re-run the install command:
```bash
curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```
Future updates can then use `/orq-agent:update`.

### Added
- `/orq-agent:deploy` — MCP-first deployment to Orq.ai with REST fallback
- `/orq-agent:test` — Automated evaluation with 3x median experiment execution
- `/orq-agent:iterate` — Evaluator-driven prompt iteration with HITL approval
- `/orq-agent:harden` — Guardrail promotion and quality gates
- `/orq-agent:set-profile` — Model profile management (quality/balanced/budget)
- Capability tier system (core/deploy/test/full)
- Idempotent create-or-update deployment with dependency ordering
- Holdout dataset support for clean re-testing

## 1.0.0 (2026-02-24)

Initial release of Orq Agent Designer.

- Architect subagent with complexity gate (defaults to single-agent design)
- Domain researcher with web search and structured research briefs
- Spec generator covering all 18 Orq.ai agent fields with tool schemas
- Orchestration generator with Mermaid diagrams and error handling
- Dataset generator with dual datasets and OWASP adversarial taxonomy
- README generator for non-technical setup guides
- Adaptive pipeline with input classification and researcher skip logic
- Wave-based parallel execution for multi-agent swarms
- Install via curl one-liner or Claude Code plugin system
- `/orq-agent:update` for version-aware updates with rollback
- `/orq-agent:help` for usage guide
