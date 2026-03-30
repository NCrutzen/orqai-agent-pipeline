"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  rate: { label: "Success Rate %", color: "var(--chart-1)" },
} satisfies ChartConfig;

interface SuccessRateChartProps {
  data: Array<{ date: string; rate: number | null }>;
}

export function SuccessRateChart({ data }: SuccessRateChartProps) {
  const filtered = data.filter(
    (d): d is { date: string; rate: number } => d.rate !== null
  );

  if (filtered.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No success rate data available yet.
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
          domain={[0, 100]}
          tickFormatter={(v: number) => `${v}%`}
        />
        <ChartTooltip content={<ChartTooltipContent indicator="dot" />} />
        <Line
          type="monotone"
          dataKey="rate"
          stroke="var(--color-rate)"
          strokeWidth={2}
          dot={false}
        />
      </LineChart>
    </ChartContainer>
  );
}
