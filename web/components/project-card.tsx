"use client";

import Link from "next/link";
import { Users, Clock } from "lucide-react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { ProjectStatusBadge } from "@/components/project-status-badge";
import { AutomationTypeTag } from "@/components/automation-type-tag";

interface ProjectCardProps {
  project: {
    id: string;
    name: string;
    description: string | null;
    updated_at: string;
    status: "idea" | "building" | "testing" | "live";
    automation_type: "zapier-only" | "hybrid" | "standalone-app" | "orqai-agent" | "unknown";
    project_members: { user_id: string }[];
  };
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 30) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

export function ProjectCard({ project }: ProjectCardProps) {
  const memberCount = project.project_members?.length ?? 0;

  return (
    <Link href={`/projects/${project.id}`} className="block">
      <Card className="transition-colors hover:bg-muted/30">
        <CardHeader>
          <CardTitle className="truncate">{project.name}</CardTitle>
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            <ProjectStatusBadge status={project.status} />
            <AutomationTypeTag type={project.automation_type} />
          </div>
          {project.description && (
            <CardDescription className="line-clamp-2">
              {project.description}
            </CardDescription>
          )}
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Users className="size-3.5" />
              {memberCount} {memberCount === 1 ? "member" : "members"}
            </span>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" />
              {formatRelativeTime(project.updated_at)}
            </span>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}
