import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { GlassCard } from "@/components/ui/glass-card";
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
      variant: "secondary",
      className: "bg-rose-500/15 text-rose-700 dark:text-rose-300",
    };
  }
  if (eurImpact < 2000) {
    return {
      label: "Medium",
      variant: "secondary",
      className: "bg-amber-500/15 text-amber-700 dark:text-amber-300",
    };
  }
  return {
    label: "High",
    variant: "secondary",
    className: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
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
      <GlassCard className="p-5">
        <div className="pb-2">
          <h3 className="text-[16px] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)] flex items-center gap-2">
            Portfolio ROI Summary
            <EstimatedBadge
              tooltipText={`Based on ${projectsWithBaselines} of ${totalProjects} projects with baselines. Projects without baselines use global defaults (15 min/task, 20 tasks/month, EUR 45/hour).`}
            />
          </h3>
        </div>
        <div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-[14px] text-[var(--v7-muted)]">
                Est. Total Hours Saved
              </p>
              <p className="text-[26.4px] leading-[1.1] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
                ~{Math.round(totalHours)}h
              </p>
            </div>
            <div>
              <p className="text-[14px] text-[var(--v7-muted)]">
                Est. Financial Impact
              </p>
              <p className="text-[26.4px] leading-[1.1] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
                ~{formatCurrency(totalEur)}
              </p>
            </div>
            <div>
              <p className="text-[14px] text-[var(--v7-muted)]">Projects Tracked</p>
              <p className="text-[26.4px] leading-[1.1] font-bold font-[var(--font-cabinet)] text-[var(--v7-text)]">
                {totalProjects}
              </p>
            </div>
          </div>
        </div>
      </GlassCard>

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
                    <TableCell className="text-[14px] font-medium">
                      {p.name}
                    </TableCell>
                    <TableCell className="text-[14px]">
                      <span className="inline-flex items-center gap-1.5">
                        ~{Math.round(p.estimatedHoursSaved)}h
                        <EstimatedBadge />
                      </span>
                    </TableCell>
                    <TableCell className="text-[14px]">
                      <span className="inline-flex items-center gap-1.5">
                        ~{formatCurrency(p.estimatedEurImpact)}
                        <EstimatedBadge />
                      </span>
                    </TableCell>
                    <TableCell>
                      {p.hasBaseline ? (
                        <span className="text-[14px] text-emerald-700 dark:text-emerald-300">
                          Custom
                        </span>
                      ) : (
                        <span className="text-[14px] text-[var(--v7-muted)]">
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
          <p className="text-[12px] text-[var(--v7-faint)] mt-2">
            Based on {projectsWithBaselines} of {totalProjects} projects with
            baselines
          </p>
        </>
      ) : (
        <p className="text-[14px] text-[var(--v7-muted)] py-4 text-center">
          No ROI data available yet.
        </p>
      )}
    </div>
  );
}
