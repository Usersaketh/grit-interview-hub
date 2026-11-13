"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AlertCircle, ArrowRight, Lock } from "lucide-react";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import { resolveDefaultPortalPath } from "@frontend/lib/domain";
import { ThemeSwitch } from "@frontend/components/ThemeSwitch";

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, supabaseConfigured, signIn } = useAuth();
  const { pushToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : null;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setFormError("Enter a valid institutional email address.");
      return;
    }
    if (!password) {
      setFormError("Enter your account password.");
      return;
    }

    setSubmitting(true);
    try {
      const signedInProfile = await signIn(trimmedEmail, password);
      pushToast({
        title: "Signed in",
        description: `Authenticated as ${signedInProfile.full_name}`,
        tone: "success",
      });
      const destination =
        safeNext && safeNext !== "/login"
          ? safeNext
          : resolveDefaultPortalPath(signedInProfile.roles);
      router.push(destination);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Authentication failed. Check your credentials and try again."
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="flex h-14 items-center justify-between gap-4 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 sm:px-8">
        <Link
          href="/"
          className="whitespace-nowrap text-base font-semibold tracking-tight text-[var(--text-primary)]"
        >
          GRIT Interview Hub
        </Link>
        <ThemeSwitch />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 sm:p-8">
          <div className="mb-6">
            <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Sign in to GRIT Interview Hub
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              Authenticate with your Supabase account credentials to access your
              assigned portal.
            </p>
          </div>

          {!supabaseConfigured ? (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2.5 rounded-md border border-[var(--border-hairline)] bg-[var(--status-warning-bg)] p-3.5 text-xs leading-relaxed text-[var(--text-primary)]"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warning)]"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">Supabase Auth Not Configured</p>
                <p className="mt-0.5 text-[var(--text-secondary)]">
                  Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
                  to enable browser sign-in.
                </p>
              </div>
            </div>
          ) : null}

          {profile ? (
            <div className="space-y-4">
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4">
                <p className="text-xs font-medium text-[var(--text-secondary)]">
                  Currently signed in as
                </p>
                <p className="mt-1 text-sm font-semibold text-[var(--text-primary)]">
                  {profile.full_name}
                </p>
                <p className="text-xs text-[var(--text-secondary)]">
                  {profile.email} · {profile.roles.join(", ") || "No role"}
                </p>
              </div>
              <Link
                href={resolveDefaultPortalPath(profile.roles)}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)]"
              >
                <span>Open My Portal</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {formError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-[var(--border-hairline)] bg-[var(--status-error-bg)] p-3 text-xs text-[var(--status-error)]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="login-email"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Email address
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@institution.edu"
                  className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Password
                </label>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>

              <button
                type="submit"
                disabled={submitting || !supabaseConfigured}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
              >
                <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{submitting ? "Signing in..." : "Sign in"}</span>
              </button>

              <p className="pt-2 text-center text-xs text-[var(--text-secondary)]">
                New student?{" "}
                <Link
                  href="/signup"
                  className="font-medium text-[var(--accent-text)] hover:underline"
                >
                  Create a student account
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
