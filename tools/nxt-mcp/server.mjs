#!/usr/bin/env node
/**
 * NXT MCP server — geeft Claude Code skills rechtstreeks toegang tot de NXT
 * REST-API (de "verborgen" /api achter de JHipster/Auth0 SPA) zonder dat de
 * skill ooit een token, Browserless of credentials hoeft aan te raken.
 *
 * Alles loopt via de gehoste passthrough-proxy op de agent-workforce Vercel-app;
 * die harvest + cached het token server-side. Deze MCP-server houdt enkel de
 * webhook-secrets + base-url vast.
 *
 * Config via env (zet bij `claude mcp add`):
 *   NXT_PROXY_BASE_URL   bv. https://agent-workforce-eosin.vercel.app
 *   NXT_ACC_SECRET       AUTOMATION_WEBHOOK_SECRET  (acceptance)
 *   NXT_PROD_SECRET      NXT_PROD_WEBHOOK_SECRET    (production, optioneel —
 *                        weglaten = deze houder kan prod niet bereiken)
 *
 * Install:  cd tools/nxt-mcp && npm install
 * Add:      claude mcp add nxt -- node /abs/path/tools/nxt-mcp/server.mjs \
 *             -e NXT_PROXY_BASE_URL=... -e NXT_ACC_SECRET=... -e NXT_PROD_SECRET=...
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = process.env.NXT_PROXY_BASE_URL;
const ACC_SECRET = process.env.NXT_ACC_SECRET;
const PROD_SECRET = process.env.NXT_PROD_SECRET;

if (!BASE || !ACC_SECRET) {
  console.error("[nxt-mcp] NXT_PROXY_BASE_URL en NXT_ACC_SECRET zijn verplicht.");
  process.exit(1);
}

async function callProxy({ env, method, path, body, allowWrite }) {
  const secret = env === "production" ? PROD_SECRET : ACC_SECRET;
  if (!secret) {
    return {
      isError: true,
      content: [{ type: "text", text: `Geen secret geconfigureerd voor env=${env}. Deze MCP-houder mag ${env} niet benaderen.` }],
    };
  }
  let res;
  try {
    res = await fetch(`${BASE}/api/automations/nxt/proxy`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-webhook-secret": secret },
      body: JSON.stringify({ env, method, path, body, allowWrite }),
    });
  } catch (e) {
    return { isError: true, content: [{ type: "text", text: `Proxy onbereikbaar: ${e.message}` }] };
  }
  const text = await res.text();
  return {
    isError: !res.ok,
    content: [{ type: "text", text }],
  };
}

const server = new McpServer({ name: "nxt", version: "1.0.0" });

server.tool(
  "nxt_request",
  "Doe een rechtstreekse call naar de NXT REST-API via de gehoste proxy. Token wordt server-side geregeld. NXT gebruikt POST ook voor reads (lookups). Op productie heeft elke niet-GET call allowWrite:true nodig.",
  {
    env: z.enum(["acceptance", "production"]).default("acceptance"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]).default("GET"),
    path: z.string().describe("NXT api path, moet met /api/ beginnen, bv /api/customers"),
    body: z.any().optional().describe("JSON body voor niet-GET calls"),
    allowWrite: z.boolean().default(false).describe("Verplicht op productie voor elke niet-GET call (incl. lookup-POST's)"),
  },
  async (args) => callProxy(args)
);

server.tool(
  "nxt_search_customers",
  "Zoek NXT-klanten op naam/term. Read-only.",
  {
    env: z.enum(["acceptance", "production"]).default("acceptance"),
    searchTerm: z.string(),
  },
  async ({ env, searchTerm }) =>
    callProxy({ env, method: "POST", path: "/api/customers", body: { searchTerm }, allowWrite: true })
);

server.tool(
  "nxt_search_items",
  "Zoek NXT-items/artikelen op term. Read-only.",
  {
    env: z.enum(["acceptance", "production"]).default("acceptance"),
    searchTerm: z.string(),
  },
  async ({ env, searchTerm }) =>
    callProxy({
      env,
      method: "POST",
      path: "/api/items/search",
      body: { searchTerm, defaultItemsOnly: true, includeInactive: false },
      allowWrite: true,
    })
);

const transport = new StdioServerTransport();
await server.connect(transport);
console.error("[nxt-mcp] running on stdio");
