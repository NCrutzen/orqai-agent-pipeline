"use client";

import { useState, useMemo } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { ProjectCard } from "@/components/project-card";

interface Project {
  id: string;
  name: string;
  description: string | null;
  updated_at: string;
  status: "idea" | "building" | "testing" | "live";
  automation_type: "zapier-only" | "hybrid" | "standalone-app" | "orqai-agent" | "unknown";
  project_members: { user_id: string }[];
}

interface ProjectSearchProps {
  projects: Project[];
}

export function ProjectSearch({ projects }: ProjectSearchProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) return projects;
    const lower = query.toLowerCase();
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(lower) ||
        (p.description && p.description.toLowerCase().includes(lower))
    );
  }, [projects, query]);

  return (
    <div className="mt-6">
      <div className="flex items-center gap-2">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search projects..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          {filtered.length} {filtered.length === 1 ? "project" : "projects"}
        </p>
      </div>
      <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((project) => (
          <ProjectCard key={project.id} project={project} />
        ))}
      </div>
      {filtered.length === 0 && query.trim() && (
        <p className="mt-8 text-center text-sm text-muted-foreground">
          No projects matching &ldquo;{query}&rdquo;
        </p>
      )}
    </div>
  );
}
