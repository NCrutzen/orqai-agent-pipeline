---
description: Manage Knowledge Bases - generate content, provision, and upload
allowed-tools: Read, Write, Edit, Bash, Glob, Grep, Agent
---

# KB Management

You are running the `/orq-agent:kb` command. This command provides standalone knowledge base management -- generate content, provision KBs in Orq.ai, and upload files.

This command supports `--mode kb` (default, full KB lifecycle) and `--mode memory` (dispatch to memory-store-generator subagent for memory store creation + round-trip test). A `--retrieval-threshold <N>` flag (default 70) configures the retrieval-quality pass bar for KBM-01.

Follow these steps in order. Stop at any step that indicates a terminal condition.

## Constraints

- **NEVER** wire a KB to a deployment without retrieval quality testing (Phase 40 KBM-01).
- **NEVER** use memory-style stores for static reference data.
- **ALWAYS** verify the embedding model is activated in AI Router before KB creation.
- **ALWAYS** record the chunking strategy chosen and why.

**Why these constraints:** KBs that return no relevant chunks silently hurt agent quality; activation failures produce opaque API errors; chunking choice drives retrieval precision.

## When to use

- An agent in the swarm references a KB in its spec or ORCHESTRATION.md.
- User wants to generate KB content from pipeline context (Option 1).
- User needs to provision KBs in Orq.ai with a chosen embedding model and host (Option 2).
- User has local files to upload into an existing KB (Option 3).

## When NOT to use

- No KB is needed for the use case → skip this command entirely.
- User is storing dynamic conversation history → use memory stores, not KBs.
- User wants to attach a KB that already exists in Orq.ai → use `/orq-agent:deploy` scoped to the agent.

## Companion Skills

Directional handoffs (→ means "this skill feeds into"):

- → `kb-generator` subagent — produces KB content files under `{swarm-dir}/kb-content/{kb-name}/`
- → `memory-store-generator` subagent — invoked when `--mode memory` flag is passed
- ← `/orq-agent` — when the generated agent spec references a KB
- → `/orq-agent:deploy` — KB is attached to the agent during deploy
- ← standalone invocation — user can generate / provision / upload without a full swarm

## Done When

- [ ] Selected action (generate / provision / upload / full setup) has completed
- [ ] Summary table shows status per KB
- [ ] For provisioning: KB `knowledge_id` recorded for downstream deploy
- [ ] For upload: file count + chunking trigger confirmed per KB

## Destructive Actions

The following actions MUST confirm via `AskUserQuestion` before proceeding:

- **Create a KB on Orq.ai** — required when a KB with the same name already exists on Orq.ai (overwrites host + embedding model assignment).
- **Upload files to an existing KB** — triggers re-chunking; confirm before uploading duplicate filenames.
- **Generate KB content via `kb-generator`** — writes to `{swarm-dir}/kb-content/{kb-name}/`; overwrites any existing generated content under that path.

## Step 1: Capability Gate

Read the config file to check the user's capability tier:

```bash
cat "$HOME/.claude/skills/orq-agent/.orq-agent/config.json" 2>/dev/null || echo "CONFIG_NOT_FOUND"
```

**If CONFIG_NOT_FOUND:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► KB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Install required. Run the orq-agent install script first.

  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

**If config exists:** Extract the `tier` value. Check against the tier hierarchy:

```
Tier hierarchy: full > test > deploy > core
Required tier:  deploy
```

**If current tier is "core":** Display the following upgrade message and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► KB — Upgrade Required
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

The kb command requires the "deploy" tier or higher.

  | Tier   | Capabilities                                  |
  |--------|-----------------------------------------------|
  | core   | Spec generation (/orq-agent)            [YOU] |
  | deploy | + Deployment (/orq-agent:deploy)               |
  | test   | + Automated testing (/orq-agent:test)          |
  | full   | + Prompt iteration (/orq-agent:iterate)        |

To upgrade, re-run the install script and select a higher tier:
  curl -sfL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash
```

**If tier is "deploy", "test", or "full":** Gate passes. Proceed to Step 1b.

## Step 1b: Mode Dispatch

Parse the invocation flags:
- `--mode kb` (default) → continue to Step 2 (full KB lifecycle: generate / provision / upload with KBM-01..04 gates).
- `--mode memory` → dispatch to the `memory-store-generator` subagent (orq-agent/agents/memory-store-generator.md) with the captured context (swarm dir, agent slug). Skip Steps 2-10 of this command. The subagent handles memory store creation, wiring, and the read/write/recall round-trip test. Return to the user with the subagent's summary.
- `--retrieval-threshold <N>` — optional integer 0-100, defaults to 70; passed to Step 7.6 retrieval quality test.

**Invariant:** `--mode memory` ALWAYS routes to memory-store-generator; never inline memory logic in this command.

## Step 2: Load API Key

The API key is stored in config.json (set during install). Extract it:

```bash
node -e "try{const c=JSON.parse(require('fs').readFileSync('$HOME/.claude/skills/orq-agent/.orq-agent/config.json','utf8'));console.log(c.orq_api_key||'')}catch(e){console.log('')}"
```

Store the result as `ORQ_API_KEY`. If empty, also check the environment variable `$ORQ_API_KEY` as fallback.

**If both are empty:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► KB — API Key Missing
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No Orq.ai API key found. Re-run the installer to configure:

  curl -sL https://raw.githubusercontent.com/NCrutzen/orqai-agent-pipeline/main/install.sh | bash -s -- --reconfigure
```

**If API key found:** Export it for use in subsequent bash commands: `export ORQ_API_KEY="<value>"`

## Step 3: Locate Swarm

Find the most recent swarm output directory. A valid swarm directory contains an `ORCHESTRATION.md` file.

Search for swarm output in the current project's `Agents/` directory:

```bash
find Agents/ -name "ORCHESTRATION.md" -type f 2>/dev/null
```

**If no ORCHESTRATION.md found:** Display the following and STOP:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► KB — No Swarm Found
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

No swarm output found. Run /orq-agent first to generate agent specifications.

Expected: Agents/<swarm-name>/ORCHESTRATION.md
```

**If ORCHESTRATION.md found:** Use the most recently modified swarm directory. Display the swarm name.

## Step 4: Detect KBs

Parse the ORCHESTRATION.md `## Knowledge Base Design` section. Extract:
- KB names (keys)
- `used_by` agent associations (which agents reference each KB)
- KB design details (source type, chunking strategy) if present

**If no KB Design section found:** Display:

```
No knowledge bases defined in ORCHESTRATION.md.
You can still generate content or upload files manually.
```

Continue to Step 5 -- the user can still use the generate or upload actions without pre-defined KB designs.

## Step 5: KB Action Menu

Display the action menu:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► KB
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Swarm: [swarm-name]
Knowledge Bases: [N] detected

What would you like to do?

  1. Generate KB content (create documents from pipeline context)
  2. Provision KBs (create in Orq.ai / configure external)
  3. Upload files to existing KB
  4. Full setup (generate + provision + upload)

Select:
```

Wait for user selection, then proceed to the corresponding step.

## Step 6: Generate (Option 1)

Spawn the kb-generator agent (`orq-agent/agents/kb-generator.md`) with the following context:
- Swarm directory path
- Target KB name(s) from Step 4 (or ask user if no KBs were detected)
- ORCHESTRATION.md KB Design section content (if available)

The kb-generator agent writes output to `{swarm-dir}/kb-content/{kb-name}/`.

After the agent completes, display the generated file listing:

```
Generated KB content:

| KB | Files | Location |
|----|-------|----------|
| {kb-name} | {N} files | {swarm-dir}/kb-content/{kb-name}/ |
```

If multiple KBs were detected, ask the user whether to generate for all KBs or select specific ones. Spawn the kb-generator once per KB with that KB's name as context.

## Step 7: Provision (Option 2)

Run the KB provisioning flow (same as deploy.md Steps 3.5.2 through 3.5.6):

### 7.0: Embedding Model Activation Check (KBM-02)

Before presenting the embedding model picker, verify the user's activated embedding models in AI Router. Use MCP `list_models --type embedding` when available; fall back to REST `curl -s -H "Authorization: Bearer $ORQ_API_KEY" "$ORQ_BASE_URL/v2/models?type=embedding"`.

Filter the picker options (Step 7.1) to show only activated embedding models. If the user's preferred model is NOT in the activated set, STOP with:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► KB — Embedding Model Not Activated
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Requested embedding model `<model_id>` is not activated in AI Router.

Remediation: Activate `<model_id>` in Orq.ai Studio → AI Router → Models → Embeddings before re-running this command.

Alternatively, choose from activated models: <list>.
```

**Invariant:** Embedding model is immutable after KB creation (existing Anti-Pattern row). Activation check MUST run before any `POST /v2/knowledge` call.

### 7.1: Embedding Model Picker

Show the embedding model picker once (applies to all KBs in this run):

```
Select embedding model for knowledge bases:

  1. cohere/embed-english-v3.0 (recommended)
  2. openai/text-embedding-3-small
  3. openai/text-embedding-3-large
  4. Custom (enter model identifier)

Select [1]:
```

Default to option 1. Note: embedding model is immutable after KB creation.

### 7.1.5: Chunking Strategy Picker (KBM-03)

For each KB, detect content type to pick the chunking strategy:

- **Prose content type** — source files are `.md` with few H2s (< 5 per 1000 lines), `.txt`, `.pdf` → **sentence** chunker, `chunk_size: 512`, `overlap: 50`.
- **Structured content type** — source files are `.md` with many H2s/H3s (≥ 5 per 1000 lines), `.html`, `.json`, or code (`.py`, `.ts`, `.js`) → **recursive** chunker, `chunk_size: 1024`, `overlap: 100`.

Detection rule (bash):

```bash
H2_COUNT=$(grep -cE '^##? ' "$source_file" 2>/dev/null || echo 0)
LINE_COUNT=$(wc -l < "$source_file")
H2_DENSITY=$(echo "scale=4; $H2_COUNT * 1000 / $LINE_COUNT" | bc 2>/dev/null)
if [[ "$extension" =~ ^(html|json|py|ts|js)$ ]] || (( $(echo "$H2_DENSITY >= 5" | bc -l) )); then
  strategy="recursive"; chunk_size=1024; overlap=100; reason="structured"
else
  strategy="sentence"; chunk_size=512; overlap=50; reason="prose"
fi
```

Record the choice in the KB plan (Step 7.4) and in KB metadata on creation:

```json
"metadata": {
  "chunking_strategy": "sentence",
  "chunk_size": 512,
  "overlap": 50,
  "reason": "prose"
}
```

### 7.2: Per-KB Host Selection

For each KB detected (or ask for KB name if none detected):

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

### 7.3: External Connection Details (external hosts only)

Collect API URL and API key for external KBs:

```
{kb-name} -- External {provider} connection:

  API URL: _
  API Key: _
```

### 7.4: KB Plan Summary

Display the complete KB plan before proceeding:

```
Knowledge Base Plan:

| KB | Host | Embedding Model | Status |
|----|------|-----------------|--------|
| kb-name-1 | Orq.ai internal | cohere/embed-english-v3.0 | pending |
| kb-name-2 | External (Pinecone) | openai/text-embedding-3-small | pending |

Proceed? [Y/n]:
```

### 7.5: Execute Provisioning

Load project context if not yet loaded:
- Select Orq.ai project (same as deploy.md Step 2.2)
- Check MCP availability (same as deploy.md Step 2.3)

For each KB in the plan:
- **Orq.ai internal:** Create via REST API (`POST /v2/knowledge`) with the selected host type and embedding model
- **External:** Create via REST API with external connection details

Display provisioning results:

```
Provisioning results:

| KB | Status | ID |
|----|--------|----|
| {kb-name} | created | {knowledge_id} |
```

### 7.6: Retrieval Quality Test (KBM-01)

After chunking completes, run a retrieval quality test BEFORE wiring the KB to any deployment.

1. **Generate 5-10 sample queries** from document headings in the uploaded content:
   - From heading `### Refund Policy` → query `How do I get a refund?`
   - From heading `## Billing FAQ` → query `Where do I update my credit card?`
   - Use an LLM (spec-generator model) to synthesize natural questions per heading.

2. **Run each query** against the newly-created KB via MCP `search_entities` with `type=knowledge_chunks, knowledge_id=$KB_ID, query=$QUERY`. Fall back to REST `POST /v2/knowledge/$KB_ID/search` on MCP failure.

3. **Pass criterion:** ≥ `--retrieval-threshold` (default 70) of queries return a chunk that semantically matches the intended source. Use an LLM-judge (binary Pass/Fail per query) or explicit user confirmation.

4. **Refuse wire-up** on failure:

   ```
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    ORQ ► KB — Retrieval Quality Test Failed
   ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

   Retrieval quality: <pct>% passed (threshold: <N>%).

   KB NOT wired to deployment.

   Remediation options:
     1. Reduce chunk_size (try 256 for sentence / 512 for recursive)
     2. Switch chunking strategy (sentence ↔ recursive)
     3. Re-ingest with cleaner source files (remove boilerplate)
     4. Lower threshold explicitly via --retrieval-threshold <N>
   ```

   Store test results under `{swarm-dir}/kb-content/{kb-name}/retrieval-test.json`.

## Step 8: Upload (Option 3)

### 8.1: Select Target KB

Show a picker from detected KBs (or allow manual entry if none detected):

```
Upload files to which knowledge base?

  1. {kb-name-1}
  2. {kb-name-2}
  3. [Enter KB name manually]

Select:
```

### 8.2: Select Source Folder

Ask for the folder path containing files to upload:

```
Path to folder with KB files:
```

Validate:
- Path exists
- List all files found
- Filter to supported formats: TXT, PDF, DOCX, CSV, XML, MD
- Warn if any file exceeds 10MB (Orq.ai upload limit)

Display file listing:

```
Files to upload:

  1. returns-policy.md (12 KB)
  2. shipping-faq.md (8 KB)
  3. product-specs.txt (24 KB)

{N} files, {total} KB total. Proceed? [Y/n]:
```

### 8.3: Execute Upload

Load project context if not yet loaded (same as Step 7.5).

For each file:
1. Upload via `POST /v2/files` with the file content
2. Create datasource via `POST /v2/knowledge/{knowledge_id}/datasources` linking the uploaded file
3. Trigger chunking

Display upload progress and results:

```
Uploading to {kb-name}...

  [1/3] returns-policy.md ... uploaded
  [2/3] shipping-faq.md ... uploaded
  [3/3] product-specs.txt ... uploaded

{N} files uploaded to {kb-name}. Chunking triggered.
```

## Step 9: Full Setup (Option 4)

Execute the following steps in sequence:

1. **Generate** -- Run Step 6 (generate KB content for all detected KBs)
2. **Provision** -- Run Step 7 (create KBs in Orq.ai)
3. **Upload** -- Run Step 8 using generated files as the source folder (`{swarm-dir}/kb-content/{kb-name}/` for each KB)

The full setup automates the entire flow -- no manual folder path entry needed since generated files are used directly.

## Step 10: Summary

After completing the selected action(s), display a summary:

```
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
 ORQ ► KB — Complete
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

| Action | KB | Status |
|--------|----|--------|
| Generated | {kb-name} | {N} files created |
| Provisioned | {kb-name} | Created (internal) |
| Uploaded | {kb-name} | {N} files uploaded |
```

Only show rows for actions that were actually performed. If only "Generate" was selected, only the Generated row appears.

## KB-vs-Memory Decision Rule (KBM-04)

- **KB (static reference data):** Docs, FAQs, product catalogs, policies, structured knowledge. Chunked + embedded + queried by similarity.
- **Memory Store (dynamic user context):** Session history, preferences, per-user facts. Keyed + written at runtime by agent decisions.
- **Block:** Memory for docs/FAQs → use KB. KB for conversation context → use Memory Store.

When the user requests an action matching a blocked pattern (e.g., "Store product catalog in memory", "Use KB for last-N user turns", "Use memory for FAQ"), STOP and guide to the correct tool. Never silently coerce.

The KB-vs-Memory boundary is enforced here; `--mode memory` dispatches to the memory-store-generator subagent without inlining memory logic in this command.

## Anti-Patterns

| Pattern | Do Instead |
|---------|-----------|
| Picking an embedding model without checking AI Router activation | Verify activation first — embedding model is immutable after KB creation |
| Uploading files larger than 10 MB | Split the file at logical boundaries; Orq.ai enforces a 10 MB per-file limit |
| Using the same KB for multiple agents with different retrieval shapes | Create per-agent KBs when retrieval queries differ meaningfully |
| Skipping the KB plan summary before provisioning | The summary is the only place host + embedding model + file plan are visible together |
| Storing product catalog / FAQ / policy docs in a memory store | Use a KB — static reference data is chunked + embedded + queried by similarity |
| Using a KB for last-N conversation turns or per-user preferences | Use a memory store — dynamic user context is keyed + written at runtime (dispatch via `--mode memory`) |
| Wiring a KB to a deployment without running the retrieval quality test | Run Step 7.6 first; refuse wire-up if the retrieval pass rate is below threshold |
| Picking an embedding model before checking AI Router activation | Run Step 7.0 activation check first; the embedding model is immutable after KB creation |

## Open in orq.ai

- **Knowledge Bases:** https://my.orq.ai/knowledge-bases

## Documentation & Resolution

When skill content conflicts with live API behavior or official docs, trust the source higher in this list:

1. **orq MCP tools** — query live data first (`search_entities`, `get_agent`, `models-list`); API responses are authoritative.
2. **orq.ai documentation MCP** — use `search_orq_ai_documentation` or `get_page_orq_ai_documentation`.
3. **Official docs** — browse https://docs.orq.ai directly.
4. **This skill file** — may lag behind API or docs changes.
