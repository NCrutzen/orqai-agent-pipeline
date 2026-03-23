import { inngest } from "@/lib/inngest/client";
import { createAdminClient } from "@/lib/supabase/admin";
import type { ServiceHealthResult } from "@/lib/credentials/types";

/**
 * Inngest function that tests all 3 infrastructure services:
 * 1. Browserless.io (browser automation execution)
 * 2. Supabase Storage (screenshot/artifact storage)
 * 3. MCP adapter (tool hosting endpoint)
 *
 * Results are upserted to health_checks table and broadcast via Supabase Realtime.
 */
export const runHealthCheck = inngest.createFunction(
  { id: "infrastructure/health-check" },
  { event: "infrastructure/health-check.requested" },
  async ({ step }) => {
    // Step 1: Check Browserless.io connectivity
    const browserless = await step.run("check-browserless", async () => {
      const start = Date.now();
      try {
        const token = process.env.BROWSERLESS_API_TOKEN;
        if (!token) {
          return {
            status: "unreachable" as const,
            error: "BROWSERLESS_API_TOKEN not configured",
          };
        }

        const res = await fetch(
          `https://production-sfo.browserless.io/function?token=${token}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/javascript" },
            body: `export default async function() { return { data: "ok", type: "application/json" }; }`,
            signal: AbortSignal.timeout(15000),
          }
        );

        const latencyMs = Date.now() - start;
        return {
          status: res.ok
            ? ("connected" as const)
            : ("unreachable" as const),
          latencyMs,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        };
      } catch (err) {
        return {
          status: "unreachable" as const,
          latencyMs: Date.now() - start,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    });

    // Step 2: Check Supabase Storage connectivity
    const storage = await step.run("check-storage", async () => {
      const start = Date.now();
      try {
        const admin = createAdminClient();
        const testFile = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
        const testPath = `_health-check/${Date.now()}.txt`;

        // Upload test file
        const { error: uploadError } = await admin.storage
          .from("automations")
          .upload(testPath, testFile, { contentType: "text/plain" });

        if (uploadError) {
          return {
            status: "unreachable" as const,
            latencyMs: Date.now() - start,
            error: uploadError.message,
          };
        }

        // Delete test file
        await admin.storage.from("automations").remove([testPath]);

        return {
          status: "connected" as const,
          latencyMs: Date.now() - start,
        };
      } catch (err) {
        return {
          status: "unreachable" as const,
          latencyMs: Date.now() - start,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    });

    // Step 3: Check MCP adapter connectivity
    const mcp = await step.run("check-mcp", async () => {
      const start = Date.now();
      try {
        const appUrl =
          process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        const res = await fetch(`${appUrl}/api/mcp/mcp`, {
          signal: AbortSignal.timeout(10000),
        });

        return {
          status: res.ok
            ? ("connected" as const)
            : ("unreachable" as const),
          latencyMs: Date.now() - start,
          ...(res.ok ? {} : { error: `HTTP ${res.status}` }),
        };
      } catch (err) {
        return {
          status: "unreachable" as const,
          latencyMs: Date.now() - start,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    });

    // Step 4: Store results and broadcast
    await step.run("store-results", async () => {
      const admin = createAdminClient();
      const checkedAt = new Date().toISOString();

      // Upsert into health_checks table (id='latest' for single-row pattern)
      await admin.from("health_checks").upsert(
        {
          id: "latest",
          browserless,
          storage,
          mcp,
          checked_at: checkedAt,
        },
        { onConflict: "id" }
      );

      // Broadcast health update via Supabase Realtime
      const channel = admin.channel("health:status");
      await channel.send({
        type: "broadcast",
        event: "health-update",
        payload: {
          browserless,
          storage,
          mcp,
          checked_at: checkedAt,
        } satisfies {
          browserless: ServiceHealthResult;
          storage: ServiceHealthResult;
          mcp: ServiceHealthResult;
          checked_at: string;
        },
      });
      admin.removeChannel(channel);
    });

    return { browserless, storage, mcp };
  }
);
