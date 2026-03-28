import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { executePipeline } from "@/lib/inngest/functions/pipeline";
import { runHealthCheck } from "@/lib/inngest/functions/health-check";
import { collectOrqaiAnalytics } from "@/lib/inngest/functions/orqai-collector";
import { scrapeZapierAnalytics } from "@/lib/inngest/functions/zapier-scraper";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [executePipeline, runHealthCheck, collectOrqaiAnalytics, scrapeZapierAnalytics],
});
