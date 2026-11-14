"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  MailCheck,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import { resolvePortalRedirect } from "@frontend/lib/domain";
import { ThemeSwitch } from "@frontend/components/ThemeSwitch";
import { getSupabaseBrowserClient } from "@frontend/services/supabaseBrowser";

export function LoginView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { profile, loading, supabaseConfigured, signIn } = useAuth();
  const { pushToast } = useToast();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [unconfirmedEmail, setUnconfirmedEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState<string | null>(null);

  const redirectedRef = useRef(false);
  const nextParam = searchParams.get("next");

  useEffect(() => {
    if (loading || !profile || redirectedRef.current) return;
    const decision = resolvePortalRedirect({
      pathname: "/login",
      nextParam,
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
  }, [loading, nextParam, profile, pushToast, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);
    setUnconfirmedEmail(null);
    setResendMessage(null);

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

      const decision = resolvePortalRedirect({
        pathname: "/login",
        nextParam,
        profile: signedInProfile,
        loading: false,
      });
      redirectedRef.current = true;
      router.replace(decision?.target ?? "/");
    } catch (err) {
      const raw =
        err instanceof Error
          ? err.message
          : "Authentication failed. Check your credentials and try again.";
      if (raw.toLowerCase().includes("email not confirmed")) {
        setUnconfirmedEmail(trimmedEmail.toLowerCase());
        setFormError(
          "Your email address has not been confirmed yet. Check your inbox or resend the verification link below."
        );
      } else {
        setFormError(raw);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResendVerification = async () => {
    if (!unconfirmedEmail) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setResending(true);
    setResendMessage(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/student")}`;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: unconfirmedEmail,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setResendMessage(`Verification link sent to ${unconfirmedEmail}.`);
    } catch (err) {
      setFormError(
        err instanceof Error
          ? err.message
          : "Failed to resend verification email."
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="flex h-14 items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-glass)] px-4 backdrop-blur-md sm:gap-4 sm:px-8">
        <Link
          href="/"
          className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm font-semibold tracking-tight text-[var(--text-primary)]"
        >
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span className="truncate">GRIT Interview Hub</span>
        </Link>
        <div className="flex shrink-0 items-center gap-2.5 sm:gap-3">
          <Link
            href="/signup"
            className="hidden whitespace-nowrap text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] sm:inline"
          >
            Student Signup
          </Link>
          <ThemeSwitch />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-elevated)] sm:p-8">
          <div className="mb-6">
            <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--accent-text)]">
              Account Access
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Sign in to GRIT Hub
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              Authenticate with your verified account credentials to enter your
              assigned portal.
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
                  Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY
                  to enable browser sign-in.
                </p>
              </div>
            </div>
          ) : null}

          {profile ? (
            <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-secondary)]">
              Redirecting to your portal...
            </div>
          ) : (
            <form onSubmit={handleSubmit} noValidate className="space-y-4">
              {formError ? (
                <div
                  role="alert"
                  className="space-y-2.5 rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-bg)] p-3 text-xs text-[var(--status-error)]"
                >
                  <div className="flex items-start gap-2">
                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>{formError}</span>
                  </div>
                  {unconfirmedEmail ? (
                    <button
                      type="button"
                      onClick={handleResendVerification}
                      disabled={resending}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50"
                    >
                      {resending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      <span>
                        {resending ? "Sending..." : "Resend verification email"}
                      </span>
                    </button>
                  ) : null}
                </div>
              ) : null}

              {resendMessage ? (
                <div className="flex items-start gap-2 rounded-md border border-[var(--status-success)]/30 bg-[var(--status-success-bg)] p-3 text-xs text-[var(--status-success)]">
                  <MailCheck className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{resendMessage}</span>
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
                  className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="login-password"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="login-password"
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
                  <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                )}
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
