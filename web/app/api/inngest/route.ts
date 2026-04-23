import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";

// Vercel Pro default function timeout is 60s. Several Inngest step.run
// handlers (Browserless sessions, long Orq.ai calls) need more headroom
// than that — without this, the invocation is killed mid-handshake and
// Browserless never sees the connect attempt. 300s is Vercel Pro's cap.
export const maxDuration = 300;
import { executePipeline } from "@/lib/inngest/functions/pipeline";
import { runHealthCheck } from "@/lib/inngest/functions/health-check";
import { collectOrqaiAnalytics } from "@/lib/inngest/functions/orqai-collector";
import { scrapeZapierAnalytics } from "@/lib/inngest/functions/zapier-scraper";
import { processProliusReport } from "@/lib/inngest/functions/prolius-report";
import { aggregateDashboard } from "@/lib/inngest/functions/dashboard-aggregator";
import { processUrenControle } from "@/lib/inngest/functions/uren-controle-process";
import { syncOrqaiTraces } from "@/lib/inngest/functions/orqai-trace-sync";
import {
  processHeerenOefening,
  createMonthlyInvoiceDrafts,
} from "@/lib/inngest/functions/heeren-oefeningen";
import { refreshBriefings } from "@/lib/inngest/functions/briefing-refresh";
import { syncDebtorEmailBridgeCron } from "@/lib/inngest/functions/debtor-email-bridge";
import { cleanupIControllerDispatch } from "@/lib/inngest/functions/debtor-email-icontroller-cleanup-dispatcher";
import { cleanupIControllerShardWorker } from "@/lib/inngest/functions/debtor-email-icontroller-cleanup-worker";
import { browserlessKeepalive } from "@/lib/inngest/functions/browserless-keepalive";
import { debtorEmailTriage } from "@/lib/inngest/functions/debtor-email-triage";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [
    executePipeline,
    runHealthCheck,
    collectOrqaiAnalytics,
    scrapeZapierAnalytics,
    processProliusReport,
    aggregateDashboard,
    processUrenControle,
    syncOrqaiTraces,
    processHeerenOefening,
    createMonthlyInvoiceDrafts,
    refreshBriefings,
    syncDebtorEmailBridgeCron,
    cleanupIControllerDispatch,
    cleanupIControllerShardWorker,
    browserlessKeepalive,
    debtorEmailTriage,
  ],
});
