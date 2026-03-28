import { Zap, GitBranch, AppWindow, Bot, HelpCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export type AutomationType =
  | "zapier-only"
  | "hybrid"
  | "standalone-app"
  | "orqai-agent"
  | "unknown";

interface AutomationTypeTagProps {
  type: AutomationType;
  className?: string;
}

const typeConfig: Record<
  AutomationType,
  {
    label: string;
    variant: "default" | "secondary" | "destructive" | "outline";
    icon: React.ComponentType<{ className?: string }>;
    className: string;
  }
> = {
  "zapier-only": {
    label: "Zapier",
    variant: "secondary",
    icon: Zap,
    className: "font-normal",
  },
  hybrid: {
    label: "Hybrid",
    variant: "secondary",
    icon: GitBranch,
    className: "font-normal",
  },
  "standalone-app": {
    label: "App",
    variant: "secondary",
    icon: AppWindow,
    className: "font-normal",
  },
  "orqai-agent": {
    label: "Agent",
    variant: "secondary",
    icon: Bot,
    className: "font-normal",
  },
  unknown: {
    label: "Unclassified",
    variant: "outline",
    icon: HelpCircle,
    className: "text-muted-foreground font-normal",
  },
};

export function AutomationTypeTag({ type, className }: AutomationTypeTagProps) {
  const config = typeConfig[type];
  const Icon = config.icon;
  return (
    <Badge variant={config.variant} className={`${config.className} ${className ?? ""}`}>
      <Icon className="size-3" />
      {config.label}
    </Badge>
  );
}
