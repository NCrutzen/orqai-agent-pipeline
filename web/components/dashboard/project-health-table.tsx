import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { HealthDot } from "./health-dot";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import type { ProjectStatus } from "@/components/project-status-badge";
import type { ProjectHealth } from "@/lib/dashboard/types";
import { formatRelativeTimestamp } from "@/lib/dashboard/format";

interface ProjectHealthTableProps {
  projects: ProjectHealth[];
}

const healthLabels: Record<string, string> = {
  green: "Healthy",
  yellow: "Warning",
  red: "Critical",
};

export function ProjectHealthTable({ projects }: ProjectHealthTableProps) {
  if (projects.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4 text-center">
        No project health data available.
      </p>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>Project</TableHead>
          <TableHead>Status</TableHead>
          <TableHead>Last Run</TableHead>
          <TableHead>Success Rate</TableHead>
          <TableHead>Health</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {projects.map((p) => (
          <TableRow key={p.projectId}>
            <TableCell>
              <Link
                href={`/projects/${p.projectId}`}
                className="text-sm font-medium hover:underline"
              >
                {p.name}
              </Link>
            </TableCell>
            <TableCell>
              <ProjectStatusBadge status={p.status as ProjectStatus} />
            </TableCell>
            <TableCell className="text-sm text-muted-foreground">
              {p.lastRun ? formatRelativeTimestamp(p.lastRun) : "Never"}
            </TableCell>
            <TableCell className="text-sm">
              {p.successRate !== null ? `${Math.round(p.successRate)}%` : "N/A"}
            </TableCell>
            <TableCell>
              <span className="inline-flex items-center gap-1.5">
                <HealthDot status={p.health} />
                <span className="text-sm">{healthLabels[p.health]}</span>
              </span>
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
