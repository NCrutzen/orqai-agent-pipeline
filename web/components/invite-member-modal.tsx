"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { UserPlus, Loader2, Mail, Building } from "lucide-react";
import { z } from "zod/v4";

interface ADUser {
  id: string;
  displayName: string;
  mail: string;
  jobTitle: string | null;
}

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
  const [mode, setMode] = useState<"directory" | "email">("directory");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Directory search state
  const [searchQuery, setSearchQuery] = useState("");
  const [adUsers, setAdUsers] = useState<ADUser[]>([]);
  const [searching, setSearching] = useState(false);
  const [directoryNote, setDirectoryNote] = useState<string | null>(null);

  // Email input state
  const [email, setEmail] = useState("");

  // Reset state when modal opens/closes
  useEffect(() => {
    if (!open) {
      setError(null);
      setSuccess(null);
      setSearchQuery("");
      setAdUsers([]);
      setEmail("");
      setDirectoryNote(null);
    }
  }, [open]);

  // Debounced directory search
  useEffect(() => {
    if (mode !== "directory" || searchQuery.length < 2) {
      setAdUsers([]);
      setDirectoryNote(null);
      return;
    }

    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(
          `/api/users/search?q=${encodeURIComponent(searchQuery)}`
        );
        const data = await res.json();
        setAdUsers(data.users ?? []);
        setDirectoryNote(data.note ?? null);
      } catch {
        setAdUsers([]);
      } finally {
        setSearching(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, mode]);

  const inviteUser = useCallback(
    async (inviteEmail: string, supabaseUserId?: string) => {
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
            supabaseUserId,
          }),
        });

        const data = await res.json();

        if (!res.ok) {
          setError(data.error || "Failed to send invite.");
          return;
        }

        setSuccess(`Invited ${inviteEmail} successfully.`);
        setEmail("");
        setSearchQuery("");
        setAdUsers([]);
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

  function handleADUserSelect(user: ADUser) {
    if (!user.mail) {
      setError("This user has no email address configured.");
      return;
    }
    // Note: supabaseUserId is the AD user's Supabase ID if they already signed in.
    // Since we can't know that from Graph, we pass email only and let the API handle it.
    inviteUser(user.mail);
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

        {/* Mode toggle */}
        <div className="flex gap-1 rounded-lg bg-muted p-1">
          <button
            type="button"
            onClick={() => {
              setMode("directory");
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "directory"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Building className="mr-1.5 inline size-3.5" />
            Directory
          </button>
          <button
            type="button"
            onClick={() => {
              setMode("email");
              setError(null);
              setSuccess(null);
            }}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              mode === "email"
                ? "bg-background shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Mail className="mr-1.5 inline size-3.5" />
            Email
          </button>
        </div>

        {/* Directory mode */}
        {mode === "directory" && (
          <div className="flex flex-col gap-2">
            <Command shouldFilter={false} className="rounded-lg border">
              <CommandInput
                placeholder="Search by name or email..."
                value={searchQuery}
                onValueChange={setSearchQuery}
              />
              <CommandList>
                {searching && (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 className="size-4 animate-spin text-muted-foreground" />
                  </div>
                )}
                {!searching && searchQuery.length >= 2 && adUsers.length === 0 && (
                  <CommandEmpty>
                    {directoryNote || "No users found."}
                  </CommandEmpty>
                )}
                {adUsers.length > 0 && (
                  <CommandGroup>
                    {adUsers.map((user) => (
                      <CommandItem
                        key={user.id}
                        onSelect={() => handleADUserSelect(user)}
                        disabled={loading}
                      >
                        <Avatar className="size-6">
                          <AvatarFallback className="text-xs">
                            {user.displayName
                              ?.split(" ")
                              .map((n) => n[0])
                              .join("")
                              .slice(0, 2)
                              .toUpperCase() || "?"}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex flex-col">
                          <span className="text-sm">{user.displayName}</span>
                          <span className="text-xs text-muted-foreground">
                            {user.mail}
                            {user.jobTitle && ` - ${user.jobTitle}`}
                          </span>
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </CommandList>
            </Command>
          </div>
        )}

        {/* Email mode */}
        {mode === "email" && (
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
                External users will receive an invite email to create an account.
              </p>
            </div>
            <Button type="submit" disabled={loading || !email.trim()}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              Send Invite
            </Button>
          </form>
        )}

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
