import { Lightbulb, Hammer, FlaskConical, Rocket } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type ProjectStatus = "idea" | "building" | "testing" | "live";

interface ProjectStatusBadgeProps {
  status: ProjectStatus;
  className?: string;
}

const statusConfig: Record<
  ProjectStatus,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  idea: {
    label: "Idea",
    variant: "outline",
    icon: Lightbulb,
    className: "text-muted-foreground font-normal",
  },
  building: {
    label: "Building",
    variant: "default",
    icon: Hammer,
    className:
      "bg-blue-500/10 text-blue-600 border-blue-200 dark:border-blue-800 dark:text-blue-400 font-normal",
  },
  testing: {
    label: "Testing",
    variant: "default",
    icon: FlaskConical,
    className:
      "bg-amber-500/10 text-amber-600 border-amber-200 dark:border-amber-800 dark:text-amber-400 font-normal",
  },
  live: {
    label: "Live",
    variant: "default",
    icon: Rocket,
    className:
      "bg-green-500/10 text-green-600 border-green-200 dark:border-green-800 dark:text-green-400 font-normal",
  },
};

export function ProjectStatusBadge({ status, className }: ProjectStatusBadgeProps) {
  const config = statusConfig[status];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={`${config.className} ${className ?? ""}`}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}
