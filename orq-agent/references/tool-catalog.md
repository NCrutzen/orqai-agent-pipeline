# Orq.ai Unified Tool Catalog

Curated catalog of Orq.ai tool types including built-in tools, MCP servers, and configuration patterns. The tool resolver subagent loads this to ground tool recommendations in verified options before falling back to web search.

**Scope:** Built-in tools, curated MCP servers, and the resolution priority chain. For Orq.ai tool field definitions, see `orqai-agent-fields.md`.

## Built-in Tools

> **Source of truth:** All built-in tool identifiers below must match `orqai-agent-fields.md`. When in doubt, defer to that reference.

| Tool Name | Type Key | Capabilities | Use Case Triggers |
|-----------|----------|-------------|-------------------|
| Web Search | `google_search` | Search the web for information | "search online", "find information", "look up" |
| Current Date | `current_date` | Get today's date | "today's date", time-sensitive tasks |
| Web Scraper | `web_scraper` | Extract content from a URL | "read URL", "scrape page", "extract web content" |
| Memory Discovery | `retrieve_memory_stores` | Discover available memory stores | "what memory stores exist", "list stores", memory store discovery |
| Memory Query | `query_memory_store` | Search stored information | "recall", "what did we discuss", memory retrieval |
| Write Memory | `write_memory_store` | Store information persistently | "remember", "save for later", persistent context |
| Delete Memory | `delete_memory_document` | Remove stored information | "forget", "remove memory", cleanup tasks |
| KB Discovery | `retrieve_knowledge_bases` | List available knowledge bases | "find knowledge", "which KBs exist" |
| KB Query | `query_knowledge_base` | Search a specific knowledge base | "look up in KB", "company policies", RAG tasks |
| Agent Discovery | `retrieve_agents` | List sub-agents in a team | Multi-agent orchestrator routing |
| Agent Invocation | `call_sub_agent` | Delegate a task to a sub-agent | Multi-agent orchestrator delegation |

## MCP Servers

Curated list of 21 verified MCP servers organized by integration category. Each MCP server is confirmed on GitHub. Use `{{PLACEHOLDER}}` for deployment-specific server URLs. All MCP connections use HTTP transport (`connection_type: "http"`).

### Search & Web

| Server | Source | Capabilities | Triggers | Auth |
|--------|--------|-------------|----------|------|
| Brave Search | github.com/brave/brave-search-mcp-server | Privacy-focused web search | "search", "web lookup" when privacy matters | API key |
| Fetch | github.com/modelcontextprotocol/servers | Web content fetching, markdown conversion | "fetch URL", "read web page" | None |
| Firecrawl | github.com/mendableai/firecrawl-mcp-server | Website crawling, clean markdown extraction | "crawl site", "scrape website" | API key |

### Code & DevOps

| Server | Source | Capabilities | Triggers | Auth |
|--------|--------|-------------|----------|------|
| GitHub | github.com/modelcontextprotocol/servers | Repos, issues, PRs, code search | "GitHub", "repository", "pull request" | PAT |
| Git | github.com/modelcontextprotocol/servers | Local git operations | "git log", "commit history" | None |
| Linear | github.com/linear/linear-mcp-server | Issue tracking, project management | "Linear", "issue tracker" | API key |

### Communication

| Server | Source | Capabilities | Triggers | Auth |
|--------|--------|-------------|----------|------|
| Slack | github.com/modelcontextprotocol/servers | Channels, messages, search | "Slack", "send message", "channel" | Bot Token |
| Notion | github.com/makenotion/notion-mcp-server | Pages, databases, content management | "Notion", "wiki", "documentation" | API key |
| Google Workspace | Community implementations | Gmail, Drive, Docs, Sheets, Calendar | "email", "Google Docs", "spreadsheet" | OAuth |

### Database

| Server | Source | Capabilities | Triggers | Auth |
|--------|--------|-------------|----------|------|
| PostgreSQL | github.com/modelcontextprotocol/servers | Schema inspection, read-only queries | "Postgres", "SQL query", "database" | Connection string |
| MySQL | github.com/myheisenberg/mysql-mcp-server | Queries, schema inspection | "MySQL", "database query" | Connection string |
| Supabase | Official Supabase MCP | Postgres + edge functions + auth | "Supabase", "backend" | Project credentials |

### File & Storage

| Server | Source | Capabilities | Triggers | Auth |
|--------|--------|-------------|----------|------|
| Filesystem | github.com/modelcontextprotocol/servers | Secure file operations | "read file", "write file", "local files" | None |
| Google Drive | github.com/piotr-agier/google-drive-mcp | Drive file management | "Google Drive", "shared files" | OAuth |

### CRM & Business

| Server | Source | Capabilities | Triggers | Auth |
|--------|--------|-------------|----------|------|
| HubSpot | Community implementations | Read-only CRM data access | "HubSpot", "CRM", "contacts" | Developer account |
| Salesforce | Community implementations | CRUD on Salesforce objects | "Salesforce", "leads", "opportunities" | OAuth |

### Project Management

| Server | Source | Capabilities | Triggers | Auth |
|--------|--------|-------------|----------|------|
| Jira/Confluence | Official Atlassian Rovo | Issues, pages, search | "Jira", "Confluence", "sprint" | API token |
| Asana | Community implementations | Task and project management | "Asana", "tasks", "project board" | PAT |

### AI & Data

| Server | Source | Capabilities | Triggers | Auth |
|--------|--------|-------------|----------|------|
| Vectara | github.com/vectara implementation | Semantic search, RAG | "semantic search", "vector search" | API key |
| Memory | github.com/modelcontextprotocol/servers | Knowledge graph persistent memory | "long-term memory", "knowledge graph" | None |

### Automation

| Server | Source | Capabilities | Triggers | Auth |
|--------|--------|-------------|----------|------|
| Zapier | Official Zapier MCP | Connect 5000+ apps via workflows | "Zapier", "automation", "workflow trigger" | Zapier account |

## Resolution Priority Chain

When the tool resolver identifies a capability need, resolve it in this order (MCP-first for external integrations):

1. **Built-in tool** -- Generic capabilities (web search, date, memory, knowledge base). Zero setup.
2. **MCP server from catalog** -- External integrations with a known server above. Verified and reliable.
3. **MCP server via web search** -- Search GitHub for `"[capability] mcp server"`. Must verify existence before recommending.
4. **HTTP tool** -- Direct API endpoint when no MCP server exists. Provide URL template and method in config.
5. **Function tool** -- Custom business logic with no MCP or HTTP option. Provide JSON Schema scaffold as starting point.
6. **Code tool** -- Python computation. Recommend when data processing or calculation is needed.

## Orq.ai MCP Configuration Format

**Step 1 -- Create the MCP tool (Orq.ai Studio or API):**

```json
{
  "key": "github-mcp",
  "description": "GitHub repository management and code operations",
  "type": "mcp",
  "path": "Default",
  "mcp": {
    "server_url": "{{GITHUB_MCP_SERVER_URL}}",
    "connection_type": "http"
  }
}
```

**Step 2 -- Reference the tool in agent settings:**

```json
{
  "type": "mcp",
  "tool_id": "{{GITHUB_MCP_TOOL_ID}}"
}
```

Key fields: `server_url` is the remote MCP server HTTP endpoint. `connection_type` is always `"http"` (Orq.ai uses HTTP-based MCP connections -- do NOT use SSE). `tool_id` is returned by Orq.ai when the MCP tool is created and used for agent references.
