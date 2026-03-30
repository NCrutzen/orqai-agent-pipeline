"use client";

import { Cell, Pie, PieChart, Label } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

const statusColors: Record<string, string> = {
  idea: "var(--chart-4)",
  building: "#3b82f6",
  testing: "#f59e0b",
  live: "#22c55e",
};

const chartConfig = {
  count: { label: "Projects" },
  idea: { label: "Idea", color: "var(--chart-4)" },
  building: { label: "Building", color: "#3b82f6" },
  testing: { label: "Testing", color: "#f59e0b" },
  live: { label: "Live", color: "#22c55e" },
} satisfies ChartConfig;

interface StatusDistributionChartProps {
  data: Record<string, number>;
}

export function StatusDistributionChart({
  data,
}: StatusDistributionChartProps) {
  const chartData = Object.entries(data).map(([status, count]) => ({
    status,
    count,
    fill: statusColors[status] ?? "var(--chart-1)",
  }));

  const total = chartData.reduce((sum, d) => sum + d.count, 0);

  if (total === 0) {
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        No project data available yet.
      </p>
    );
  }

  return (
    <ChartContainer
      config={chartConfig}
      className="min-h-[250px] w-full mx-auto max-w-[300px]"
    >
      <PieChart>
        <ChartTooltip content={<ChartTooltipContent nameKey="status" />} />
        <Pie
          data={chartData}
          dataKey="count"
          nameKey="status"
          innerRadius={60}
          outerRadius={100}
          strokeWidth={2}
        >
          {chartData.map((entry) => (
            <Cell key={entry.status} fill={entry.fill} />
          ))}
          <Label
            content={({ viewBox }) => {
              if (viewBox && "cx" in viewBox && "cy" in viewBox) {
                return (
                  <text
                    x={viewBox.cx}
                    y={viewBox.cy}
                    textAnchor="middle"
                    dominantBaseline="middle"
                  >
                    <tspan
                      x={viewBox.cx}
                      y={viewBox.cy}
                      className="fill-foreground text-2xl font-bold"
                    >
                      {total}
                    </tspan>
                    <tspan
                      x={viewBox.cx}
                      y={(viewBox.cy ?? 0) + 20}
                      className="fill-muted-foreground text-xs"
                    >
                      projects
                    </tspan>
                  </text>
                );
              }
              return null;
            }}
          />
        </Pie>
      </PieChart>
    </ChartContainer>
  );
}
