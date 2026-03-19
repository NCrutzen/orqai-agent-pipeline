"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus, Loader2 } from "lucide-react";
import { z } from "zod/v4";

interface InviteMemberModalProps {
  projectId: string;
  currentMembers: { user_id: string; email?: string }[];
}

const emailSchema = z.email();

export function InviteMemberModal({
  projectId,
  currentMembers,
}: InviteMemberModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [email, setEmail] = useState("");

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setError(null);
      setSuccess(null);
      setEmail("");
    }
  }, [open]);

  const inviteUser = useCallback(
    async (inviteEmail: string) => {
      setLoading(true);
      setError(null);
      setSuccess(null);

      try {
        const res = await fetch("/api/invite", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            email: inviteEmail,
            projectId,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to send invite.");
          return;
        }

        setSuccess(`Invited ${inviteEmail} successfully.`);
        setEmail("");
        router.refresh();
      } catch {
        setError("An unexpected error occurred.");
      } finally {
        setLoading(false);
      }
    },
    [projectId, router]
  );

  function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    const result = emailSchema.safeParse(email);
    if (!result.success) {
      setError("Please enter a valid email address.");
      return;
    }
    inviteUser(email);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">
          <UserPlus className="size-4" />
          Invite Member
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Invite Member</DialogTitle>
          <DialogDescription>
            Invite a colleague to join this project.
          </DialogDescription>
        </DialogHeader>

        {/* Email invite form */}
        <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="invite-email" className="text-sm font-medium">
              Email address
            </label>
            <Input
              id="invite-email"
              type="email"
              placeholder="colleague@company.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
              autoFocus
            />
            <p className="text-xs text-muted-foreground">
              They&apos;ll receive an invite email to create an account.
            </p>
          </div>
          <Button type="submit" disabled={loading || !email.trim()}>
            {loading && <Loader2 className="size-4 animate-spin" />}
            Send Invite
          </Button>
        </form>

        {/* Feedback messages */}
        {error && <p className="text-sm text-destructive">{error}</p>}
        {success && (
          <p className="text-sm text-emerald-600">{success}</p>
        )}

        {/* Current members */}
        {currentMembers.length > 0 && (
          <div className="mt-2 border-t pt-3">
            <p className="mb-2 text-xs font-medium text-muted-foreground">
              Current members ({currentMembers.length})
            </p>
            <div className="flex flex-col gap-1.5">
              {currentMembers.map((member) => (
                <div
                  key={member.user_id}
                  className="flex items-center gap-2 text-sm text-muted-foreground"
                >
                  <Avatar className="size-5">
                    <AvatarFallback className="text-[10px]">
                      {member.email?.[0]?.toUpperCase() || "?"}
                    </AvatarFallback>
                  </Avatar>
                  <span className="truncate">
                    {member.email || member.user_id}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
