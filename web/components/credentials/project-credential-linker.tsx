"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Link2, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { CredentialStatusBadge } from "./credential-status-badge";
import {
  linkCredentialToProject,
  unlinkCredentialFromProject,
} from "@/app/(dashboard)/settings/actions";
import type { AuthProfileTypeId, CredentialStatus } from "@/lib/credentials/types";

const AUTH_TYPE_LABELS: Record<AuthProfileTypeId, string> = {
  username_password: "Username + Password",
  sso_token: "SSO Token",
  api_key: "API Key",
  certificate: "Certificate",
  totp: "TOTP",
  custom: "Custom",
};

interface ProjectCredentialLinkerProps {
  projectId: string;
  linkedCredentials: {
    id: string;
    name: string;
    auth_type: AuthProfileTypeId;
    status: CredentialStatus;
  }[];
  availableCredentials: {
    id: string;
    name: string;
    auth_type: AuthProfileTypeId;
    status: CredentialStatus;
  }[];
}

export function ProjectCredentialLinker({
  projectId,
  linkedCredentials,
  availableCredentials,
}: ProjectCredentialLinkerProps) {
  const router = useRouter();
  const [loading, setLoading] = useState<string | null>(null);

  async function handleLink(credentialId: string) {
    setLoading(credentialId);
    const res = await linkCredentialToProject(credentialId, projectId);
    if (res.error) toast.error(res.error);
    else toast.success("Credential linked to project");
    setLoading(null);
    router.refresh();
  }

  async function handleUnlink(credentialId: string) {
    setLoading(credentialId);
    const res = await unlinkCredentialFromProject(credentialId, projectId);
    if (res.error) toast.error(res.error);
    else toast.success("Credential unlinked");
    setLoading(null);
    router.refresh();
  }

  return (
    <div>
      <div className="mb-4">
        <h3 className="text-sm font-semibold">Linked Credentials</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Credentials available to automations in this project
        </p>
      </div>

      {linkedCredentials.length > 0 ? (
        <div className="flex flex-col gap-2">
          {linkedCredentials.map((cred) => (
            <div
              key={cred.id}
              className="flex items-center justify-between rounded-lg border p-3"
            >
              <div className="flex items-center gap-3">
                <KeyRound className="size-4 text-muted-foreground" />
                <div>
                  <span className="text-sm font-semibold">{cred.name}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {AUTH_TYPE_LABELS[cred.auth_type]}
                  </span>
                </div>
                <CredentialStatusBadge status={cred.status} />
              </div>
              <Button
                variant="ghost"
                size="icon"
                disabled={loading === cred.id}
                onClick={() => handleUnlink(cred.id)}
              >
                <Unlink className="size-4" />
              </Button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">
          No credentials linked to this project.
        </p>
      )}

      {availableCredentials.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold mb-2">Available to link</h3>
          <div className="flex flex-col gap-2">
            {availableCredentials.map((cred) => (
              <div
                key={cred.id}
                className="flex items-center justify-between rounded-lg border border-dashed p-3"
              >
                <div className="flex items-center gap-3">
                  <KeyRound className="size-4 text-muted-foreground" />
                  <span className="text-sm">{cred.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {AUTH_TYPE_LABELS[cred.auth_type]}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading === cred.id}
                  onClick={() => handleLink(cred.id)}
                >
                  <Link2 className="size-4" />
                  Link
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
