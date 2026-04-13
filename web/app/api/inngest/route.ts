import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { executePipeline } from "@/lib/inngest/functions/pipeline";
import { runHealthCheck } from "@/lib/inngest/functions/health-check";
import { collectOrqaiAnalytics } from "@/lib/inngest/functions/orqai-collector";
import { scrapeZapierAnalytics } from "@/lib/inngest/functions/zapier-scraper";
import { processProliusReport } from "@/lib/inngest/functions/prolius-report";
import { aggregateDashboard } from "@/lib/inngest/functions/dashboard-aggregator";
import { processUrenControle } from "@/lib/inngest/functions/uren-controle-process";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [executePipeline, runHealthCheck, collectOrqaiAnalytics, scrapeZapierAnalytics, processProliusReport, aggregateDashboard, processUrenControle],
});
