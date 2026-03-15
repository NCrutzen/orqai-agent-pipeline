import { notFound } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { InviteMemberModal } from "@/components/invite-member-modal";
import { ChevronRight, Calendar, Play } from "lucide-react";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({ params }: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  // RLS ensures only members can access this project
  const { data: project, error } = await supabase
    .from("projects")
    .select("*, project_members(user_id)")
    .eq("id", id)
    .single();

  if (error || !project) {
    notFound();
  }

  // Fetch member emails for display (using admin would bypass RLS, but we need it for display)
  // For now, show user_ids -- email display would need a profiles table or admin lookup
  const members: { user_id: string; email?: string }[] = (
    project.project_members ?? []
  ).map((m: { user_id: string }) => ({
    user_id: m.user_id,
    email: undefined,
  }));

  const createdDate = new Date(project.created_at).toLocaleDateString(
    "en-US",
    {
      year: "numeric",
      month: "long",
      day: "numeric",
    }
  );

  return (
    <div className="p-6">
      {/* Breadcrumb */}
      <nav className="mb-4 flex items-center gap-1 text-sm text-muted-foreground">
        <Link href="/" className="hover:text-foreground transition-colors">
          Dashboard
        </Link>
        <ChevronRight className="size-3.5" />
        <span className="font-medium text-foreground">{project.name}</span>
      </nav>

      {/* Project header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold">{project.name}</h1>
          {project.description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              {project.description}
            </p>
          )}
          <div className="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <Calendar className="size-3.5" />
              Created {createdDate}
            </span>
          </div>
        </div>
        <InviteMemberModal projectId={project.id} currentMembers={members} />
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-3">
        {/* Members section */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="text-sm">
              Members ({members.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col gap-2">
              {members.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-2"
                >
                  <Avatar className="size-7">
                    <AvatarFallback className="text-xs">
                      {member.email?.[0]?.toUpperCase() || "U"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate text-sm">
                    {member.email || `User ${member.user_id.slice(0, 8)}...`}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Pipeline runs placeholder */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-sm">Pipeline Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col items-center py-8 text-center">
              <div className="rounded-full bg-muted p-3">
                <Play className="size-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-medium">No pipeline runs yet</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Pipeline execution will be available in a future update.
              </p>
              <Badge variant="outline" className="mt-3">
                Coming in Phase 35
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
