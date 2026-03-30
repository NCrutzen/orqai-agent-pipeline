import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import type { AgentMetric } from "@/lib/dashboard/types";
import { formatCompactNumber, formatCurrency } from "@/lib/dashboard/format";

interface AgentMetricsTableProps {
  agents: AgentMetric[];
}

export function AgentMetricsTable({ agents }: AgentMetricsTableProps) {
  if (agents.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No agent metrics available.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Agent Name</TableHead>
          <TableHead>Requests</TableHead>
          <TableHead>Latency</TableHead>
          <TableHead>Cost</TableHead>
          <TableHead>Error Rate</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {agents.map((a) => (
          <TableRow key={a.name}>
            <TableCell className="text-sm font-medium">{a.name}</TableCell>
            <TableCell className="text-sm">
              {formatCompactNumber(a.requests)}
            </TableCell>
            <TableCell
              className={`text-sm ${
                a.latencyMs > 5000
                  ? "text-amber-600 dark:text-amber-400"
                  : ""
              }`}
            >
              {a.latencyMs}ms
            </TableCell>
            <TableCell className="text-sm">
              {formatCurrency(a.cost, "USD")}
            </TableCell>
            <TableCell
              className={`text-sm ${
                a.errorRate > 0.05
                  ? "text-red-600 dark:text-red-400"
                  : ""
              }`}
            >
              {(a.errorRate * 100).toFixed(1)}%
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
