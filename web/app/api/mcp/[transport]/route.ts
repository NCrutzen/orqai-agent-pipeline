import { createMcpHandler } from "mcp-handler";

const handler = createMcpHandler(
  (server) => {
    server.registerTool(
      "health_check",
      {
        title: "Health Check",
        description: "Verify MCP adapter is responding",
        inputSchema: {},
      },
      async () => {
        return { content: [{ type: "text", text: "MCP adapter operational" }] };
      }
    );
  },
  {},
  {
    basePath: "/api/mcp",
    maxDuration: 120,
    verboseLogs: process.env.NODE_ENV === "development",
  }
);

export { handler as GET, handler as POST };
