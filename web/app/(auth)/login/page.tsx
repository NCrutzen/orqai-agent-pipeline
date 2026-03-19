"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

function LoginForm() {
  const searchParams = useSearchParams();
  const error = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const supabase = createClient();

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
      // Successful sign-in -- redirect to dashboard
      window.location.href = "/";
    }
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader className="text-center">
        <CardTitle className="text-2xl">Sign in</CardTitle>
        <CardDescription>
          Sign in to access your projects and pipelines
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Error messages */}
        {error === "no_access" && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            You don&apos;t have access to this app. Contact your project admin
            to get invited.
          </div>
        )}
        {error === "auth_failed" && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Sign-in failed. Please try again.
          </div>
        )}
        {error === "invalid_link" && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            Invalid or expired invite link. Please request a new one.
          </div>
        )}
        {formError && (
          <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
            {formError}
          </div>
        )}

        {/* Email/password form */}
        <form onSubmit={handleEmailSignIn} className="space-y-4">
          <div className="space-y-2">
            <Input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <div className="space-y-2">
            <Input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              disabled={loading}
            />
          </div>
          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "Signing in..." : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
