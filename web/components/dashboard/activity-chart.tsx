"use client";

import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  pipeline: { label: "Pipeline", color: "var(--chart-1)" },
  zapier: { label: "Zapier", color: "var(--chart-2)" },
  orqai: { label: "Orq.ai", color: "var(--chart-3)" },
} satisfies ChartConfig;

interface ActivityChartProps {
  data: Array<{
    date: string;
    pipeline: number;
    zapier: number;
    orqai: number;
  }>;
}

export function ActivityChart({ data }: ActivityChartProps) {
  if (data.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No activity data available yet.
      </p>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <AreaChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <ChartLegend content={<ChartLegendContent />} />
        <Area
          type="monotone"
          dataKey="pipeline"
          stackId="1"
          fill="var(--color-pipeline)"
          stroke="var(--color-pipeline)"
          fillOpacity={0.4}
        />
        <Area
          type="monotone"
          dataKey="zapier"
          stackId="1"
          fill="var(--color-zapier)"
          stroke="var(--color-zapier)"
          fillOpacity={0.4}
        />
        <Area
          type="monotone"
          dataKey="orqai"
          stackId="1"
          fill="var(--color-orqai)"
          stroke="var(--color-orqai)"
          fillOpacity={0.4}
        />
      </AreaChart>
    </ChartContainer>
  );
}
