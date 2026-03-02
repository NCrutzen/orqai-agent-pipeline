---
phase: quick
plan: 3
type: execute
wave: 1
depends_on: []
files_modified:
  - orq-agent/references/orqai-api-endpoints.md
  - orq-agent/agents/deployer.md
  - orq-agent/commands/deploy.md
autonomous: true
requirements: [KB-PROVISION]

must_haves:
  truths:
    - "API endpoints reference documents all KB CRUD, file upload, datasource, chunking, and search endpoints"
    - "Deployer agent provisions KBs in Phase 1.5 (after Tools, before Sub-Agents) with correct REST-only pattern"
    - "Deploy command collects KB configuration from user (host type, embedding model, data sources) in Step 3.5"
    - "KB IDs are wired into sub-agent payloads via kb_id_map during Phase 2"
  artifacts:
    - path: "orq-agent/references/orqai-api-endpoints.md"
      provides: "Knowledge Bases API endpoint reference section"
      contains: "## Knowledge Bases"
    - path: "orq-agent/agents/deployer.md"
      provides: "Phase 1.5 KB provisioning pipeline"
      contains: "Phase 1.5"
    - path: "orq-agent/commands/deploy.md"
      provides: "Step 3.5 KB setup user interaction flow"
      contains: "Step 3.5"
  key_links:
    - from: "orq-agent/commands/deploy.md"
      to: "orq-agent/agents/deployer.md"
      via: "KB manifest passed in Step 5 deployer invocation"
      pattern: "kb_manifest|kb_id_map|knowledge_base"
    - from: "orq-agent/agents/deployer.md"
      to: "orq-agent/references/orqai-api-endpoints.md"
      via: "Deployer references KB API endpoints for REST calls"
      pattern: "/v2/knowledge"
---

<objective>
Add Knowledge Base provisioning to the /orq-agent:deploy flow across three files: API endpoint reference, deployer agent, and deploy command.

Purpose: Close the gap where KBs are designed in ORCHESTRATION.md but not provisioned during deploy, forcing manual Studio creation.
Output: Updated reference, deployer, and command files that together enable automated KB provisioning.
</objective>

<execution_context>
@/Users/nickcrutzen/.claude/get-shit-done/workflows/execute-plan.md
@/Users/nickcrutzen/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@orq-agent/references/orqai-api-endpoints.md
@orq-agent/agents/deployer.md
@orq-agent/commands/deploy.md

<interfaces>
<!-- The detailed implementation spec with all content to add -->
@/Users/nickcrutzen/.claude/plans/floating-singing-sphinx.md
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add Knowledge Bases section to API endpoint reference</name>
  <files>orq-agent/references/orqai-api-endpoints.md</files>
  <action>
Add a `## Knowledge Bases` section to orqai-api-endpoints.md, inserted AFTER the `## Memory Stores` section and BEFORE the `## Models` section. Include:

1. **Endpoint table** with these endpoints:
   - `POST /v2/knowledge` - Create a knowledge base
   - `GET /v2/knowledge` - List all knowledge bases
   - `GET /v2/knowledge/{knowledge_id}` - Get knowledge base by ID
   - `PATCH /v2/knowledge/{knowledge_id}` - Update knowledge base
   - `DELETE /v2/knowledge/{knowledge_id}` - Delete knowledge base

2. **Sub-section: Files** with endpoint table:
   - `POST /v2/files` - Upload a file (multipart/form-data, max 10MB, supports TXT/PDF/DOCX/CSV/XML)

3. **Sub-section: Datasources** with endpoint table:
   - `POST /v2/knowledge/{knowledge_id}/datasources` - Add datasource to KB
   - `GET /v2/knowledge/{knowledge_id}/datasources` - List datasources
   - `DELETE /v2/knowledge/{knowledge_id}/datasources/{datasource_id}` - Remove datasource

4. **Sub-section: Chunking** with endpoint table:
   - `POST /v2/knowledge/{knowledge_id}/datasources/{datasource_id}/chunks` - Chunk a datasource
   - `POST /v2/chunking` - Preview chunking strategy

5. **Sub-section: Search** with endpoint table:
   - `POST /v2/knowledge/{knowledge_id}/search` - Search knowledge base

6. **Create payload examples** - Two code blocks showing internal and external KB create payloads:
   - Internal: `{ "key": "...", "type": "internal", "embedding_model": "...", "description": "..." }`
   - External: `{ "key": "...", "type": "external", "api_url": "...", "api_key": "...", "embedding_model": "..." }`

7. **Chunking strategy mapping table**:
   | ORCHESTRATION.md | API value |
   |---|---|
   | semantic | `semantic` |
   | token | `token` |
   | sentence | `sentence` |
   | recursive | `recursive` |
   | agentic | `agentic` |
   | other/default | `fast` |

8. **Embedding model defaults**: List the 3 defaults: `cohere/embed-english-v3.0`, `openai/text-embedding-3-small`, `openai/text-embedding-3-large`

9. **Usage notes** at the end of the section:
   - KBs use list-and-filter for lookup (not addressable by key directly, same pattern as tools)
   - Embedding model is immutable after creation -- cannot be changed via PATCH
  </action>
  <verify>
    <automated>grep -c "## Knowledge Bases" orq-agent/references/orqai-api-endpoints.md && grep -c "/v2/knowledge" orq-agent/references/orqai-api-endpoints.md && grep -c "embedding_model" orq-agent/references/orqai-api-endpoints.md</automated>
  </verify>
  <done>Knowledge Bases section exists between Memory Stores and Models with all endpoints, payloads, chunking mapping, embedding defaults, and usage notes documented</done>
</task>

<task type="auto">
  <name>Task 2: Add Phase 1.5 KB provisioning to deployer agent</name>
  <files>orq-agent/agents/deployer.md</files>
  <action>
Make these changes to the deployer agent specification:

**A. Update Phase 0.4 deploy order** (Step 0.4: Build Deploy Manifest):
Change the ordered list from Tools -> Sub-agents -> Orchestrator to:
1. Tools (from TOOLS.md)
2. Knowledge Bases (from ORCHESTRATION.md Knowledge Base Design section)
3. Sub-agents (non-orchestrator agents)
4. Orchestrator

Update the ordering rule: "Never deploy an agent before its tools or knowledge bases."

**B. Add `## Phase 1.5: Provision Knowledge Bases` section** between Phase 1 (Deploy Tools) and Phase 2 (Deploy Sub-Agents). This is a new major section with the same formatting style as existing phases. Include:

Step 1.5.0: Note that KB operations are REST-only (no MCP tools exist). All KB API calls use `Authorization: Bearer $ORQ_API_KEY` against REST endpoints directly. Do not attempt MCP-first pattern for KB operations.

Step 1.5.1: Lookup Existing KB
- KBs are NOT addressable by key directly. Use list-and-filter: `GET /v2/knowledge?limit=200`, cache the list, filter by `key` field.
- Same caching pattern as tools (Step 1.1).

Step 1.5.2: Per-KB provisioning flow based on host type from deploy command manifest:
- If `skip`: record status as `skipped`, set `kb_id_map[kb_name] = null`, continue
- If `orq_internal`:
  1. Check cached list for existing KB with matching key
  2. If not found: Create via `POST /v2/knowledge` with `{ "key": "...", "type": "internal", "embedding_model": "...", "description": "..." }`
  3. If files provided in manifest: Upload each file via `POST /v2/files` (multipart/form-data), then create datasource via `POST /v2/knowledge/{id}/datasources` linking the uploaded file
  4. Trigger chunking via `POST /v2/knowledge/{id}/datasources/{datasource_id}/chunks` using the chunking strategy mapped from ORCHESTRATION.md (use the mapping table from the API reference)
  5. Record `knowledge_id` from response
- If `external_*` (supabase, pinecone, weaviate, custom):
  1. Check cached list for existing KB with matching key
  2. If not found: Create via `POST /v2/knowledge` with `{ "key": "...", "type": "external", "api_url": "...", "api_key": "..." }`
  3. Record `knowledge_id` from response
- Build `kb_id_map`: dictionary mapping `kb_name -> knowledge_id`

Step 1.5.3: Error handling
- KB creation failure IS a blocker -- stop deploy (agents can't wire knowledge_id)
- File upload failure is a WARNING -- KB shell is still created, files can be uploaded later
- Chunking failure is a WARNING -- datasource exists, chunking can be retried manually

Step 1.5.4: Report Progress
- Display: `Provisioning knowledge bases... (N/M)` with same pattern as tools/agents

**C. Update Phase 2** (Deploy Sub-Agents, Step 2.2):
Add a note that when building agent payloads, resolve `knowledge_bases` array entries from `kb_id_map` instead of using placeholder IDs from spec files. If a KB was skipped (null in kb_id_map), omit it from the agent's `knowledge_bases` array.

**D. Update Phase 4** (Read-Back Verification, Step 4.1):
Add KB read-back: For each provisioned KB, `GET /v2/knowledge/{knowledge_id}` and verify `key`, `embedding_model`, and `type` match the intended values from the manifest.

**E. Update Phase 5** (Annotate Local Spec Files):
Add Step 5.3 (renumber existing 5.3 to 5.4): Annotate ORCHESTRATION.md frontmatter with `knowledge_base_ids` map:
```yaml
knowledge_base_ids:
  kb-name-1: "knowledge_id_abc123"
  kb-name-2: "knowledge_id_def456"
```

**F. Add KB anti-patterns** to the Anti-Patterns section:
- Never deploy agents before their knowledge bases -- KBs must exist so agents can reference knowledge_id in their payloads
- Never re-chunk existing datasources on re-deploy -- chunking is expensive and idempotent re-deploy should skip already-chunked datasources
- Never attempt MCP tools for KB operations -- KB CRUD has no MCP tool equivalents, use REST API directly

**G. Update Output Format** table to include `kb` resource type with status values: `created`, `created (no files)`, `external-configured`, `skipped`
  </action>
  <verify>
    <automated>grep -c "Phase 1.5" orq-agent/agents/deployer.md && grep -c "kb_id_map" orq-agent/agents/deployer.md && grep -c "knowledge_base_ids" orq-agent/agents/deployer.md</automated>
  </verify>
  <done>Deployer has Phase 1.5 with complete KB provisioning flow, updated deploy order in Phase 0.4, kb_id_map resolution in Phase 2, KB verification in Phase 4, ORCHESTRATION.md annotation in Phase 5, and KB anti-patterns</done>
</task>

<task type="auto">
  <name>Task 3: Add Step 3.5 KB setup to deploy command</name>
  <files>orq-agent/commands/deploy.md</files>
  <action>
Make these changes to the deploy command specification:

**A. Add `## Step 3.5: Knowledge Base Setup` section** between Step 3 (Locate Swarm Output) and Step 4 (Pre-flight Validation). Include:

Step 3.5.1: Detect KBs
- Parse ORCHESTRATION.md `## Knowledge Base Design` section
- Extract KB names and `used_by` agent associations
- Apply scope filtering: if `--agent` was used, only show KBs used by selected agent(s)
- If no KBs found: skip Step 3.5 entirely, display "No knowledge bases detected." and proceed to Step 4

Step 3.5.2: Embedding Model Picker
- Show once per deploy (NOT per KB):
```
Select embedding model for knowledge bases:

  1. cohere/embed-english-v3.0 (recommended)
  2. openai/text-embedding-3-small
  3. openai/text-embedding-3-large
  4. Custom (enter model identifier)

Select [1]:
```
- Default to option 1 if user presses enter
- Note: embedding model is immutable after KB creation

Step 3.5.3: Per-KB Host Selection
- For each KB detected, display:
```
Knowledge Base: {kb-name}
Used by: {agent-1}, {agent-2}

  1. Orq.ai internal
  2. External -- Supabase
  3. External -- Pinecone
  4. External -- Weaviate
  5. External -- Custom
  6. Skip -- configure manually later
  A. Apply choice to ALL remaining KBs

Select [1]:
```
- Default to option 1
- Option A applies the current selection to all remaining KBs (only shown if >1 KB remaining)

Step 3.5.4: Per-KB Data Source (Orq.ai internal only)
- Only shown when host is "Orq.ai internal":
```
Data source for {kb-name}:

  1. Yes -- I have a local folder with files
  2. No -- I'll upload in Orq.ai Studio later

Select [2]:
```
- If option 1: prompt for folder path, validate path exists, list files found, filter to supported formats (TXT, PDF, DOCX, CSV, XML), warn if any file exceeds 10MB
- Default to option 2

Step 3.5.5: External Connection Details (external hosts only)
- Collect API URL and API key for external KBs:
```
{kb-name} -- External {provider} connection:

  API URL: _
  API Key: _
```

Step 3.5.6: KB Plan Summary Table
- Display before proceeding:
```
Knowledge Base Plan:

| KB | Host | Embedding Model | Data Source | Files |
|----|------|-----------------|-------------|-------|
| kb-name-1 | Orq.ai internal | cohere/embed-english-v3.0 | /path/to/docs | 5 files |
| kb-name-2 | External (Pinecone) | openai/text-embedding-3-small | -- | -- |
| kb-name-3 | Skip | -- | -- | -- |

Proceed? [Y/n]:
```

**B. Update Step 3.3** (Display Swarm Summary):
Add `Knowledge Bases: [N]` line to the swarm summary display, between the Tools and Orchestrator lines:
```
Agents: [N] ([list agent keys])
Tools: [M] ([list tool keys])
Knowledge Bases: [K]
Orchestrator: [orchestrator-key]
```

**C. Update Step 5** (Deploy Resources):
Add to the deployer invocation context list:
- KB manifest (from Step 3.5): list of KBs with host type, embedding model, file paths, external connection details
- Mention that the deployer's Phase 1.5 handles KB provisioning using this manifest

Update Step 5.1 (Scoped Deployment Behavior) to add:
- **Phase 1.5 (Provision KBs):** Only provision KBs that the selected agent(s) use (from `used_by` associations). Skip all other KBs.

Update Step 5.2 (Deployer Pipeline Execution) to add Phase 1.5 progress display between Phase 1 and Phase 2:
```
Provisioning knowledge bases... (1/2)
Provisioning knowledge bases... (2/2) done
```

**D. Update Step 7** (Write Deploy Log):
Add `kb` as a resource type in the deploy log table. Add these status values to the status values list:
- `created` -- internal KB created with files uploaded and chunked
- `created (no files)` -- internal KB created, files to be uploaded later
- `external-configured` -- external KB created with connection details
- `skipped` -- KB skipped, to be configured manually
  </action>
  <verify>
    <automated>grep -c "Step 3.5" orq-agent/commands/deploy.md && grep -c "Knowledge Bases:" orq-agent/commands/deploy.md && grep -c "kb_manifest\|KB manifest" orq-agent/commands/deploy.md</automated>
  </verify>
  <done>Deploy command has Step 3.5 with KB detection, embedding model picker, per-KB host selection, data source collection, external connection details, and plan summary table. Step 3.3 shows KB count, Step 5 passes KB manifest, Step 7 logs KB resources.</done>
</task>

</tasks>

<verification>
All three files updated with consistent KB provisioning flow:
1. API reference documents all KB endpoints (grep for `/v2/knowledge` returns 5+ matches)
2. Deployer has Phase 1.5 between Phase 1 and Phase 2 (grep for "Phase 1.5" returns matches)
3. Deploy command has Step 3.5 between Step 3 and Step 4 (grep for "Step 3.5" returns matches)
4. Cross-file consistency: deploy command passes KB manifest -> deployer uses it in Phase 1.5 -> deployer references API endpoints from reference doc
</verification>

<success_criteria>
- orqai-api-endpoints.md has a Knowledge Bases section with all KB CRUD, file upload, datasource, chunking, and search endpoints
- deployer.md has Phase 1.5 with complete KB provisioning logic, updated deploy order, kb_id_map wiring, KB verification, and KB anti-patterns
- deploy.md has Step 3.5 with full user interaction flow for KB configuration, updated summary display, deployer context passing, and deploy log entries
- All three files maintain their existing formatting style and structure
</success_criteria>

<output>
After completion, create `.planning/quick/3-add-kb-provisioning-to-deploy-flow/3-SUMMARY.md`
</output>
