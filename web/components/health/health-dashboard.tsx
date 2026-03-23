"use client";

import { useState } from "react";
import {
  Globe,
  HardDrive,
  Plug,
  RefreshCw,
  Loader2,
  Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { HealthStatusCard } from "./health-status-card";
import { useBroadcast } from "@/lib/supabase/broadcast-client";
import { triggerHealthCheck } from "@/app/(dashboard)/settings/actions";
import type {
  HealthCheckResult,
  HealthUpdatePayload,
} from "@/lib/credentials/types";

interface HealthDashboardProps {
  initialResult: HealthCheckResult | null;
}

export function HealthDashboard({ initialResult }: HealthDashboardProps) {
  const [result, setResult] = useState<HealthCheckResult | null>(
    initialResult
  );
  const [checking, setChecking] = useState(false);

  useBroadcast<HealthUpdatePayload>(
    "health:status",
    "health-update",
    (payload) => {
      setResult({ id: "latest", ...payload, checked_by: null });
      setChecking(false);
      const allOk =
        payload.browserless.status === "connected" &&
        payload.storage.status === "connected" &&
        payload.mcp.status === "connected";
      if (allOk) toast.success("All services healthy");
      else toast.warning("Some services have issues");
    }
  );

  async function handleRunCheck() {
    setChecking(true);
    const res = await triggerHealthCheck();
    if (res.error) {
      toast.error(res.error);
      setChecking(false);
    }
    // Actual results arrive via Broadcast
  }

  return (
    <div className="mt-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">System Health</h2>
          <p className="text-sm text-muted-foreground">
            Infrastructure connectivity status
          </p>
        </div>
        <Button variant="outline" onClick={handleRunCheck} disabled={checking}>
          {checking ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {checking ? "Checking..." : "Run Health Check"}
        </Button>
      </div>

      {result || checking ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4">
          <HealthStatusCard
            serviceName="Browserless.io"
            serviceIcon={Globe}
            status={checking ? "checking" : (result?.browserless?.status ?? null)}
            error={result?.browserless?.error}
            checkedAt={result?.checked_at}
          />
          <HealthStatusCard
            serviceName="Supabase Storage"
            serviceIcon={HardDrive}
            status={checking ? "checking" : (result?.storage?.status ?? null)}
            error={result?.storage?.error}
            checkedAt={result?.checked_at}
          />
          <HealthStatusCard
            serviceName="MCP Adapter"
            serviceIcon={Plug}
            status={checking ? "checking" : (result?.mcp?.status ?? null)}
            error={result?.mcp?.error}
            checkedAt={result?.checked_at}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center py-12 text-center mt-4">
          <div className="rounded-full bg-muted p-3">
            <Activity className="size-5 text-muted-foreground" />
          </div>
          <p className="mt-3 text-sm font-medium">
            Health checks not yet run
          </p>
          <p className="mt-1 max-w-sm text-xs text-muted-foreground">
            Run a health check to verify connectivity to Browserless.io,
            Supabase Storage, and the MCP adapter.
          </p>
        </div>
      )}
    </div>
  );
}
