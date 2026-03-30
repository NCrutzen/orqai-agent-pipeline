"use client";

import { Bar, BarChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const chartConfig = {
  count: { label: "Projects", color: "var(--chart-2)" },
} satisfies ChartConfig;

interface TypeBreakdownChartProps {
  data: Record<string, number>;
}

export function TypeBreakdownChart({ data }: TypeBreakdownChartProps) {
  const chartData = Object.entries(data).map(([type, count]) => ({
    type,
    count,
  }));

  if (chartData.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No automation type data available yet.
      </p>
    );
  }

  return (
    <ChartContainer config={chartConfig} className="min-h-[250px] w-full">
      <BarChart data={chartData} layout="vertical">
        <YAxis
          dataKey="type"
          type="category"
          tickLine={false}
          axisLine={false}
          width={120}
        />
        <XAxis type="number" tickLine={false} axisLine={false} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar dataKey="count" fill="var(--color-count)" radius={4} />
      </BarChart>
    </ChartContainer>
  );
}
