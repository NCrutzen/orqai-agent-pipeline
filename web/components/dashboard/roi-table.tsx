import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { EstimatedBadge } from "./estimated-badge";
import type { RoiProject } from "@/lib/dashboard/types";
import { formatCurrency } from "@/lib/dashboard/format";

interface RoiTableProps {
  projects: RoiProject[];
  totalProjects: number;
  projectsWithBaselines: number;
}

function getRoiBand(eurImpact: number): {
  label: string;
  variant: "default" | "secondary" | "destructive" | "outline";
  className: string;
} {
  if (eurImpact < 500) {
    return {
      label: "Low",
      variant: "destructive",
      className: "",
    };
  }
  if (eurImpact < 2000) {
    return {
      label: "Medium",
      variant: "secondary",
      className: "",
    };
  }
  return {
    label: "High",
    variant: "default",
    className: "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800 dark:text-green-400",
  };
}

export function RoiTable({
  projects,
  totalProjects,
  projectsWithBaselines,
}: RoiTableProps) {
  const totalHours = projects.reduce(
    (sum, p) => sum + p.estimatedHoursSaved,
    0
  );
  const totalEur = projects.reduce(
    (sum, p) => sum + p.estimatedEurImpact,
    0
  );

  return (
    <div className="space-y-4">
      {/* Portfolio Summary Card */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-normal flex items-center gap-2">
            Portfolio ROI Summary
            <EstimatedBadge
              tooltipText={`Based on ${projectsWithBaselines} of ${totalProjects} projects with baselines. Projects without baselines use global defaults (15 min/task, 20 tasks/month, EUR 45/hour).`}
            />
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-sm text-muted-foreground">
                Est. Total Hours Saved
              </p>
              <p className="text-2xl font-bold font-mono">
                ~{Math.round(totalHours)}h
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">
                Est. Financial Impact
              </p>
              <p className="text-2xl font-bold font-mono">
                ~{formatCurrency(totalEur)}
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">Projects Tracked</p>
              <p className="text-2xl font-bold font-mono">{totalProjects}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* ROI Table */}
      {projects.length > 0 ? (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Project</TableHead>
                <TableHead>Est. Hours Saved</TableHead>
                <TableHead>Est. EUR Impact</TableHead>
                <TableHead>Baseline</TableHead>
                <TableHead>ROI Band</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {projects.map((p) => {
                const band = getRoiBand(p.estimatedEurImpact);
                return (
                  <TableRow key={p.projectId}>
                    <TableCell className="text-sm font-medium">
                      {p.name}
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        ~{Math.round(p.estimatedHoursSaved)}h
                        <EstimatedBadge />
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">
                      <span className="inline-flex items-center gap-1.5">
                        ~{formatCurrency(p.estimatedEurImpact)}
                        <EstimatedBadge />
                      </span>
                    </TableCell>
                    <TableCell>
                      {p.hasBaseline ? (
                        <span className="text-sm text-green-600 dark:text-green-400">
                          Custom
                        </span>
                      ) : (
                        <span className="text-sm text-muted-foreground">
                          Default
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Badge
                        variant={band.variant}
                        className={band.className}
                      >
                        {band.label}
                      </Badge>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          <p className="text-xs text-muted-foreground mt-2">
            Based on {projectsWithBaselines} of {totalProjects} projects with
            baselines
          </p>
        </>
      ) : (
        <p className="text-sm text-muted-foreground py-4 text-center">
          No ROI data available yet.
        </p>
      )}
    </div>
  );
}
