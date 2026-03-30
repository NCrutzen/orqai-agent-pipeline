"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  costPerRun: { label: "Cost Per Run", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface CostTrendChartProps {
  data: Array<{ date: string; costPerRun: number | null }>;
}

export function CostTrendChart({ data }: CostTrendChartProps) {
  const filtered = data.filter(
    (d): d is { date: string; costPerRun: number } => d.costPerRun !== null
  );

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No cost trend data available yet.
      </p>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[300px] w-full">
      <LineChart data={filtered}>
        <CartesianGrid vertical={false} />
        <XAxis
          dataKey="date"
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: string) => v.slice(5)}
        />
        <YAxis
          tickLine={false}
          axisLine={false}
          tickFormatter={(v: number) => `$${v.toFixed(2)}`}
        />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value) => `$${Number(value).toFixed(2)} per run`}
            />
          }
        />
        <Line
          type="monotone"
          dataKey="costPerRun"
          stroke="var(--color-costPerRun)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
