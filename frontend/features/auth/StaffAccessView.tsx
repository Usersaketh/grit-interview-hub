"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { ThemeSwitch } from "@frontend/components/ThemeSwitch";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import {
  hasAllowedRole,
  resolveDefaultPortalPath,
  resolvePortalRedirect,
} from "@frontend/lib/domain";

export function StaffAccessView() {
  const router = useRouter();
  const { profile, loading, supabaseConfigured, signIn } = useAuth();
  const { pushToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const redirectedRef = useRef(false);

  useEffect(() => {
    if (loading || !profile || redirectedRef.current) return;
    const decision = resolvePortalRedirect({
      pathname: "/staff-access",
      profile,
      loading,
    });
    if (!decision) return;
    redirectedRef.current = true;
    if (decision.toastTitle) {
      pushToast({
        title: decision.toastTitle,
        description: decision.toastDescription,
        tone: "warning",
      });
    }
    router.replace(decision.target);
  }, [loading, profile, pushToast, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setFormError("Enter a valid staff email address.");
      return;
    }
    if (!password) {
      setFormError("Enter your account password.");
      return;
    }

    setSubmitting(true);
    try {
      const signedInProfile = await signIn(trimmedEmail, password);
      if (hasAllowedRole(signedInProfile.roles, ["OPERATIONS", "ADMIN"])) {
        pushToast({
          title: "Staff workspace unlocked",
          description: `Signed in as ${signedInProfile.full_name}`,
          tone: "success",
        });
        redirectedRef.current = true;
        router.replace("/operations");
        return;
      }

      const fallback = resolveDefaultPortalPath(signedInProfile.roles);
      pushToast({
        title: "Staff access restricted",
        description: "Your account does not have Operations privileges. Opened your assigned portal.",
        tone: "warning",
      });
      redirectedRef.current = true;
      router.replace(fallback);
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
      <header className="flex h-14 items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-glass)] px-4 backdrop-blur-md sm:px-8">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm font-semibold tracking-tight text-[var(--text-primary)]"
        >
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="truncate">GRIT Interview Hub</span>
        </Link>
        <ThemeSwitch />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-elevated)] sm:p-8">
          <div className="mb-6">
            <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--accent-text)]">
              Restricted Staff Entry
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Operations Sign In
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              Sign in with an authorized Operations or Admin account to access governance, invitations, and certification approvals.
            </p>
          </div>

          {!supabaseConfigured ? (
            <div
              role="alert"
              className="mb-6 flex items-start gap-2.5 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)] p-3.5 text-xs leading-relaxed text-[var(--text-primary)]"
            >
              <AlertCircle
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warning)]"
                aria-hidden="true"
              />
              <div>
                <p className="font-semibold">Supabase Auth Not Configured</p>
                <p className="mt-0.5 text-[var(--text-secondary)]">
                  Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to enable staff authentication.
                </p>
              </div>
            </div>
          ) : null}

          {profile ? (
            <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-secondary)]">
              Validating workspace access...
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {formError ? (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-bg)] p-3 text-xs text-[var(--status-error)]"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{formError}</span>
                </div>
              ) : null}

              <div>
                <label
                  htmlFor="staff-email"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Staff email address
                </label>
                <input
                  id="staff-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="coordinator@institution.edu"
                  className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="staff-password"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="staff-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2 pl-3 pr-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                  >
                    {showPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || !supabaseConfigured}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
                <span>{submitting ? "Verifying access..." : "Sign in to Operations"}</span>
              </button>

              <p className="pt-2 text-center text-xs text-[var(--text-muted)]">
                Looking for student or interviewer access?{" "}
                <Link
                  href="/login"
                  className="font-medium text-[var(--accent-text)] hover:underline"
                >
                  Standard sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
