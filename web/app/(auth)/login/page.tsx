"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GlassCard } from "@/components/ui/glass-card";

function MicrosoftIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 21 21"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function ErrorBanner({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-[var(--v7-radius-sm)] border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-200">
      {children}
    </div>
  );
}

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");
  const rawNext = searchParams.get("next");
  const next =
    rawNext && rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ssoLoading, setSsoLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const supabase = createClient();

  async function handleMicrosoftLogin() {
    setSsoLoading(true);
    setFormError(null);

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "azure",
      options: {
        scopes: "email profile openid",
        redirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`,
      },
    });

    if (error) {
      setFormError(error.message);
      setSsoLoading(false);
    }
  }

  async function handleEmailSignIn(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setFormError(null);

    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      setFormError(error.message);
      setLoading(false);
    } else {
      window.location.href = next;
    }
  }

  return (
    <GlassCard className="w-full max-w-md p-8 backdrop-blur-2xl">
      <div className="mb-8 text-center">
        <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-[var(--v7-radius-sm)] bg-gradient-to-br from-[var(--v7-teal)] to-[var(--v7-blue)] shadow-[var(--v7-glass-shadow)]">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            aria-hidden
          >
            <path
              d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"
              stroke="white"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <h1 className="text-3xl font-bold tracking-tight text-[var(--v7-text)]">
          Agent Workforce
        </h1>
        <p className="mt-2 text-sm text-[var(--v7-muted)]">
          Sign in to access your projects and pipelines
        </p>
      </div>

      <div className="space-y-5">
        {error === "no_access" && (
          <ErrorBanner>
            You don&apos;t have access to this app. Contact your project admin
            to get invited.
          </ErrorBanner>
        )}
        {error === "auth_failed" && (
          <ErrorBanner>Sign-in failed. Please try again.</ErrorBanner>
        )}
        {error === "invalid_link" && (
          <ErrorBanner>
            Invalid or expired invite link. Please request a new one.
          </ErrorBanner>
        )}
        {error === "sso_failed" && (
          <ErrorBanner>
            Sign-in failed. Microsoft returned an error. Try again or contact
            your administrator if the problem persists.
          </ErrorBanner>
        )}
        {formError && <ErrorBanner>{formError}</ErrorBanner>}

        <Button
          type="button"
          variant="outline"
          className="w-full border-[var(--v7-line)] bg-[var(--v7-panel-2)]/60 text-[var(--v7-text)] hover:bg-[var(--v7-panel-2)]"
          onClick={handleMicrosoftLogin}
          disabled={ssoLoading || loading}
        >
          <MicrosoftIcon />
          {ssoLoading ? "Redirecting..." : "Sign in with Microsoft"}
        </Button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <span className="w-full border-t border-[var(--v7-line)]" />
          </div>
          <div className="relative flex justify-center text-xs uppercase tracking-wider">
            <span className="bg-[var(--v7-glass-bg)] px-3 text-[var(--v7-faint)]">
              or
            </span>
          </div>
        </div>

        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <Input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={loading}
            className="border-[var(--v7-line)] bg-[var(--v7-panel-2)]/60 text-[var(--v7-text)] placeholder:text-[var(--v7-faint)]"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            disabled={loading}
            className="border-[var(--v7-line)] bg-[var(--v7-panel-2)]/60 text-[var(--v7-text)] placeholder:text-[var(--v7-faint)]"
          />
          <Button
            type="submit"
            className="w-full bg-gradient-to-r from-[var(--v7-teal)] to-[var(--v7-blue)] text-white shadow-[var(--v7-glass-shadow)] hover:opacity-90"
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </div>
    </GlassCard>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
