"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Loader2,
  MailCheck,
  RefreshCw,
  Terminal,
} from "lucide-react";
import { ThemeSwitch } from "@frontend/components/ThemeSwitch";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import {
  getRequiredRolesForPath,
  hasAllowedRole,
  parseAuthCallbackParams,
  resolveDefaultPortalPath,
} from "@frontend/lib/domain";
import { getSupabaseBrowserClient } from "@frontend/services/supabaseBrowser";

type CallbackPhase =
  | "verifying"
  | "verified"
  | "already_confirmed"
  | "expired"
  | "error";

export function AuthCallbackView() {
  const router = useRouter();
  const { refreshProfile, supabaseConfigured } = useAuth();
  const { pushToast } = useToast();

  const [phase, setPhase] = useState<CallbackPhase>("verifying");
  const [message, setMessage] = useState<string>(
    "Confirming your email verification token..."
  );
  const [destination, setDestination] = useState<string>("/student");
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendSent, setResendSent] = useState<string | null>(null);
  const [resendError, setResendError] = useState<string | null>(null);

  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const runVerification = async () => {
      const parsed = parseAuthCallbackParams(
        window.location.search,
        window.location.hash
      );

      // Strip sensitive code/tokens from the URL bar once captured
      if (window.location.search || window.location.hash) {
        window.history.replaceState({}, document.title, "/auth/callback");
      }

      const supabase = getSupabaseBrowserClient();

      if (parsed.kind === "error") {
        // If the user already has a valid active session despite clicking an old link twice,
        // check session before failing!
        if (supabase) {
          const {
            data: { session: existingSession },
          } = await supabase.auth.getSession();
          if (existingSession) {
            const loaded = await refreshProfile({ silent: true, force: true });
            if (loaded) {
              const defaultPath = resolveDefaultPortalPath(loaded.roles);
              const nextPathname = parsed.nextPath?.split("?")[0] ?? "";
              const required = parsed.nextPath
                ? getRequiredRolesForPath(nextPathname)
                : null;
              const target =
                parsed.nextPath &&
                (!required || hasAllowedRole(loaded.roles, required))
                  ? parsed.nextPath
                  : defaultPath;
              setDestination(target);
              setPhase("already_confirmed");
              setMessage(
                "Your email is already confirmed and your session is active."
              );
              return;
            }
          }
        }

        setPhase(parsed.expired ? "expired" : "error");
        setMessage(
          parsed.expired
            ? "This confirmation link has expired or has already been used. Request a fresh verification email below or sign in if you already confirmed your account."
            : parsed.message || "Email verification link could not be validated."
        );
        return;
      }

      if (!supabase) {
        setPhase("error");
        setMessage(
          "Supabase authentication is not configured in this environment."
        );
        return;
      }

      const resolveSafeDestination = (
        roles: Parameters<typeof resolveDefaultPortalPath>[0],
        requestedNext: string | null
      ) => {
        const defaultPath = resolveDefaultPortalPath(roles);
        if (!requestedNext) return defaultPath;
        const nextPathname = requestedNext.split("?")[0] ?? requestedNext;
        const required = getRequiredRolesForPath(nextPathname);
        if (!required || hasAllowedRole(roles, required)) {
          return requestedNext;
        }
        return defaultPath;
      };

      try {

        if (parsed.kind === "code") {
          const { error: exchangeError } =
            await supabase.auth.exchangeCodeForSession(parsed.code);
          if (exchangeError) {
            throw exchangeError;
          }
        } else if (parsed.kind === "token_hash") {
          const { error: verifyError } = await supabase.auth.verifyOtp({
            token_hash: parsed.tokenHash,
            type: parsed.otpType as
              | "signup"
              | "email"
              | "recovery"
              | "invite"
              | "email_change"
              | "magiclink",
          });
          if (verifyError) {
            throw verifyError;
          }
        } else if (parsed.kind === "session_tokens") {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: parsed.accessToken,
            refresh_token: parsed.refreshToken,
          });
          if (sessionError) {
            throw sessionError;
          }
        } else {
          // Empty callback params: check if session is already established (e.g. double-click or auto-detected)
          const {
            data: { session: currentSession },
          } = await supabase.auth.getSession();
          if (!currentSession) {
            setPhase("error");
            setMessage(
              "No verification code or token was found in this link. Please open the full link from your email or sign in."
            );
            return;
          }
        }

        const loaded = await refreshProfile({ silent: true, force: true });
        if (loaded) {
          const target = resolveSafeDestination(loaded.roles, parsed.nextPath);
          setDestination(target);
          setPhase("verified");
          setMessage(
            "Email verified and session activated. Taking you to your portal now."
          );
          pushToast({
            title: "Email verified",
            description: `Welcome to GRIT Interview Hub, ${loaded.full_name}.`,
            tone: "success",
          });
          window.setTimeout(() => {
            router.replace(target);
          }, 900);
          return;
        }

        setPhase("verified");
        setDestination("/login");
        setMessage(
          "Your email has been confirmed. Please sign in to open your portal."
        );
      } catch (err) {
        const raw = err instanceof Error ? err.message : String(err);
        const lower = raw.toLowerCase();
        if (lower.includes("expired") || lower.includes("otp_expired")) {
          setPhase("expired");
          setMessage(
            "This confirmation link has expired. Enter your email below to receive a new verification link."
          );
        } else {
          setPhase("error");
          setMessage(
            raw || "We could not verify this confirmation link."
          );
        }
      }
    };

    void runVerification();
  }, [pushToast, refreshProfile, router]);

  const handleResendVerification = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setResendError(null);
    setResendSent(null);

    const trimmed = resendEmail.trim().toLowerCase();
    if (!trimmed || !trimmed.includes("@")) {
      setResendError("Enter the email address you registered with.");
      return;
    }

    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setResendError("Supabase authentication is not configured.");
      return;
    }

    setResending(true);
    try {
      const redirectTo = `${window.location.origin}/auth/callback?next=${encodeURIComponent("/student")}`;
      const { error } = await supabase.auth.resend({
        type: "signup",
        email: trimmed,
        options: { emailRedirectTo: redirectTo },
      });
      if (error) {
        throw error;
      }
      setResendSent(
        `If an unconfirmed student account exists for ${trimmed}, a new verification email has been sent.`
      );
    } catch (err) {
      setResendError(
        err instanceof Error
          ? err.message
          : "Unable to resend verification email right now."
      );
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="flex h-14 items-center justify-between gap-4 border-b border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold tracking-tight text-[var(--text-primary)]"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span>GRIT Interview Hub</span>
        </Link>
        <ThemeSwitch />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-md rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-elevated)] sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            {phase === "verifying" ? (
              <Loader2
                className="h-5 w-5 animate-spin text-[var(--accent-primary)]"
                aria-hidden="true"
              />
            ) : phase === "verified" || phase === "already_confirmed" ? (
              <CheckCircle2
                className="h-5 w-5 text-[var(--status-success)]"
                aria-hidden="true"
              />
            ) : (
              <AlertCircle
                className="h-5 w-5 text-[var(--status-error)]"
                aria-hidden="true"
              />
            )}
            <div>
              <p className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                Email Verification
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                {phase === "verifying"
                  ? "Verifying your account"
                  : phase === "verified"
                    ? "Email confirmed"
                    : phase === "already_confirmed"
                      ? "Already verified"
                      : phase === "expired"
                        ? "Verification link expired"
                        : "Verification unsuccessful"}
              </h1>
            </div>
          </div>

          <p className="text-sm leading-relaxed text-[var(--text-secondary)]">
            {message}
          </p>

          {phase === "verified" || phase === "already_confirmed" ? (
            <div className="mt-6 flex flex-col gap-2.5">
              <Link
                href={destination}
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
              >
                <span>Continue to Portal</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : null}

          {phase === "expired" || phase === "error" ? (
            <div className="mt-6 space-y-5">
              {supabaseConfigured ? (
                <form
                  onSubmit={handleResendVerification}
                  noValidate
                  className="space-y-3 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4"
                >
                  <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                    <MailCheck className="h-4 w-4 text-[var(--accent-primary)]" aria-hidden="true" />
                    <span>Resend verification link</span>
                  </div>
                  <input
                    type="email"
                    value={resendEmail}
                    onChange={(e) => setResendEmail(e.target.value)}
                    placeholder="student@institution.edu"
                    aria-label="Email address for verification resend"
                    className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                  />
                  {resendError ? (
                    <p className="text-xs text-[var(--status-error)]">
                      {resendError}
                    </p>
                  ) : null}
                  {resendSent ? (
                    <p className="text-xs text-[var(--status-success)]">
                      {resendSent}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={resending}
                    className="inline-flex min-h-9 w-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-50"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {resending ? "Sending..." : "Send New Verification Email"}
                    </span>
                  </button>
                </form>
              ) : null}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Link
                  href="/login"
                  className="inline-flex min-h-10 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)]"
                >
                  <span>Go to Sign In</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/signup"
                  className="inline-flex min-h-10 flex-1 items-center justify-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                >
                  Back to Sign Up
                </Link>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </div>
  );
}
