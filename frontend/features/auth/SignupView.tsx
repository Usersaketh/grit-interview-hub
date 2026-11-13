"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  RefreshCw,
  Terminal,
  UserPlus,
} from "lucide-react";
import { ThemeSwitch } from "@frontend/components/ThemeSwitch";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import {
  resolvePortalRedirect,
  validateSignupForm,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import { signupStudentAccount } from "@frontend/services/hubApi";
import { getSupabaseBrowserClient } from "@frontend/services/supabaseBrowser";

export function SignupView() {
  const router = useRouter();
  const { profile, loading, supabaseConfigured, refreshProfile } = useAuth();
  const { pushToast } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [campusRef, setCampusRef] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [verificationEmail, setVerificationEmail] = useState<string | null>(null);
  const [resending, setResending] = useState(false);
  const [resendNotice, setResendNotice] = useState<string | null>(null);

  const redirectedRef = useRef(false);

  useEffect(() => {
    if (loading || !profile || redirectedRef.current) return;
    const decision = resolvePortalRedirect({
      pathname: "/signup",
      profile,
      loading,
    });
    if (!decision) return;
    redirectedRef.current = true;
    router.replace(decision.target);
  }, [loading, profile, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const errors = validateSignupForm({
      fullName,
      email,
      password,
      confirmPassword,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setSubmitting(true);
    try {
      const result = await signupStudentAccount({
        fullName: fullName.trim(),
        email: email.trim(),
        password,
        confirmPassword,
        ...(campusRef.trim() ? { campusRef: campusRef.trim() } : {}),
      });

      if (result.requiresEmailVerification || !result.sessionEstablished) {
        setVerificationEmail(result.email);
        pushToast({
          title: "Verify your email",
          description: `Confirmation link sent to ${result.email}.`,
          tone: "info",
        });
        return;
      }

      await refreshProfile({ silent: true, force: true });
      pushToast({
        title: "Student account created",
        description: `Welcome to GRIT Interview Hub, ${result.fullName}.`,
        tone: "success",
      });
      redirectedRef.current = true;
      router.replace("/student");
    } catch (err) {
      setFormError(formatApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleResend = async () => {
    if (!verificationEmail) return;
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    setResending(true);
    setResendNotice(null);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/student")}`;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: verificationEmail,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) throw error;
      setResendNotice(`A fresh verification email has been sent to ${verificationEmail}.`);
    } catch (err) {
      setResendNotice(
        err instanceof Error
          ? err.message
          : "Unable to resend confirmation email right now."
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <div
        aria-hidden="true"
        className="grit-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[420px] opacity-30 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />

      <header className="relative z-10 flex h-14 items-center justify-between gap-2 border-b border-[var(--border-hairline)] bg-[var(--bg-glass)] px-4 backdrop-blur-md sm:gap-4 sm:px-8">
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
            href="/login"
            className="whitespace-nowrap text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
          >
            Sign in
          </Link>
          <ThemeSwitch />
        </div>
      </header>

      <main className="relative z-10 flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-elevated)] sm:p-8">
          <div className="mb-6">
            <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--accent-text)]">
              Student Registration
            </p>
            <h1 className="mt-1.5 text-2xl font-semibold tracking-tight text-[var(--text-primary)]">
              Create your student account
            </h1>
            <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
              Public registration provisions a student portal account to track
              skill clearances and book badge interviews. Interviewers and staff
              join via official invitation only.
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
                  to enable account registration.
                </p>
              </div>
            </div>
          ) : null}

          {profile ? (
            <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-secondary)]">
              Redirecting to your portal...
            </div>
          ) : verificationEmail ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-[var(--status-success)]/30 bg-[var(--status-success-bg)] p-4">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-success)]"
                  aria-hidden="true"
                />
                <div>
                  <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                    Check your inbox to verify your email
                  </h2>
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                    We sent a confirmation link to{" "}
                    <span className="font-mono font-medium text-[var(--text-primary)]">
                      {verificationEmail}
                    </span>
                    . Open the link from your email to verify your address and
                    activate your Student Portal.
                  </p>
                </div>
              </div>

              {resendNotice ? (
                <p className="text-xs text-[var(--text-secondary)]">
                  {resendNotice}
                </p>
              ) : null}

              <div className="flex flex-col gap-2.5 sm:flex-row">
                <button
                  type="button"
                  onClick={handleResend}
                  disabled={resending}
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
                >
                  <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>{resending ? "Sending..." : "Resend Email"}</span>
                </button>
                <Link
                  href="/login"
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent-primary-hover)]"
                >
                  <span>Proceed to Sign In</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
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
                  htmlFor="signup-full-name"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Full name
                </label>
                <input
                  id="signup-full-name"
                  name="fullName"
                  type="text"
                  autoComplete="name"
                  required
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Aarav Sharma"
                  className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
                {fieldErrors.fullName ? (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {fieldErrors.fullName}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="signup-email"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Email address
                </label>
                <input
                  id="signup-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="student@institution.edu"
                  className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
                {fieldErrors.email ? (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {fieldErrors.email}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="signup-campus"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Campus / Cohort (Optional)
                </label>
                <input
                  id="signup-campus"
                  name="campusRef"
                  type="text"
                  value={campusRef}
                  onChange={(e) => setCampusRef(e.target.value)}
                  placeholder="Hyderabad / Cohort 2026"
                  className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label
                  htmlFor="signup-password"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Password
                </label>
                <div className="relative">
                  <input
                    id="signup-password"
                    name="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="8+ chars, letters & numbers"
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
                {fieldErrors.password ? (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {fieldErrors.password}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="signup-confirm-password"
                  className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Confirm password
                </label>
                <div className="relative">
                  <input
                    id="signup-confirm-password"
                    name="confirmPassword"
                    type={showConfirmPassword ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Re-enter your password"
                    className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2 pl-3 pr-10 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword((v) => !v)}
                    aria-label={
                      showConfirmPassword
                        ? "Hide confirmation password"
                        : "Show confirmation password"
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                  >
                    {showConfirmPassword ? (
                      <EyeOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Eye className="h-4 w-4" aria-hidden="true" />
                    )}
                  </button>
                </div>
                {fieldErrors.confirmPassword ? (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {fieldErrors.confirmPassword}
                  </p>
                ) : null}
              </div>

              <button
                type="submit"
                disabled={submitting || !supabaseConfigured}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-55 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
              >
                <UserPlus className="h-4 w-4 shrink-0" aria-hidden="true" />
                <span>
                  {submitting
                    ? "Creating student account..."
                    : "Create Student Account"}
                </span>
              </button>

              <p className="pt-2 text-center text-xs text-[var(--text-secondary)]">
                Already registered?{" "}
                <Link
                  href="/login"
                  className="font-medium text-[var(--accent-text)] hover:underline"
                >
                  Sign in instead
                </Link>
              </p>
            </form>
          )}
        </div>
      </main>
    </div>
  );
}
