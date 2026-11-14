"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  LogOut,
  MailCheck,
  Terminal,
} from "lucide-react";
import { StatusText } from "@frontend/components/StatusText";
import { ThemeSwitch } from "@frontend/components/ThemeSwitch";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import {
  formatTimestamp,
  getInvitationStatusMeta,
  isValidUuid,
} from "@frontend/lib/domain";
import {
  ApiClientError,
  formatApiErrorMessage,
} from "@frontend/services/apiClient";
import {
  acceptInvitationById,
  verifyInvitationById,
} from "@frontend/services/hubApi";
import { getSupabaseBrowserClient } from "@frontend/services/supabaseBrowser";
import type { InvitationVerifyInfo } from "@frontend/types/api";

export function AcceptInvitationView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const invitationId = searchParams.get("invitationId")?.trim() ?? "";

  const { profile, loading: authLoading, refreshProfile, signOut } = useAuth();
  const { pushToast } = useToast();

  const [inviteInfo, setInviteInfo] = useState<InvitationVerifyInfo | null>(null);
  const [verifying, setVerifying] = useState(true);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [verifyErrorCode, setVerifyErrorCode] = useState<string | null>(null);

  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [switchingAccount, setSwitchingAccount] = useState(false);

  const loginRedirectHref = invitationId
    ? `/login?next=${encodeURIComponent(`/invitations/accept?invitationId=${invitationId}`)}`
    : "/login";

  const loadVerification = useCallback(async () => {
    if (authLoading) return;

    if (!invitationId || !isValidUuid(invitationId)) {
      setVerifyError("No valid invitation identifier was supplied in this link.");
      setVerifyErrorCode("VALIDATION_ERROR");
      setVerifying(false);
      return;
    }

    if (!profile) {
      setInviteInfo(null);
      setVerifyError(null);
      setVerifyErrorCode(null);
      setVerifying(false);
      return;
    }

    setVerifying(true);
    setVerifyError(null);
    setVerifyErrorCode(null);
    try {
      const info = await verifyInvitationById(invitationId);
      setInviteInfo(info);
      if (info.fullName) setFullName(info.fullName);
    } catch (err) {
      setVerifyError(formatApiErrorMessage(err));
      setVerifyErrorCode(err instanceof ApiClientError ? err.code : null);
    } finally {
      setVerifying(false);
    }
  }, [authLoading, invitationId, profile]);

  useEffect(() => {
    void loadVerification();
  }, [loadVerification]);

  // Newly invited Supabase Auth users arrive signed in with zero application roles yet
  // and need to set a password for future direct logins.
  const needsPasswordSetup = Boolean(profile && profile.roles.length === 0);

  const emailMatchesSignedIn = Boolean(
    profile &&
      inviteInfo &&
      profile.email.trim().toLowerCase() === inviteInfo.email.trim().toLowerCase()
  );

  const handleSwitchAccount = async () => {
    setSwitchingAccount(true);
    try {
      await signOut();
      router.push(loginRedirectHref);
    } finally {
      setSwitchingAccount(false);
    }
  };

  const handleAccept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!inviteInfo || !profile) return;
    setSubmitError(null);

    if (needsPasswordSetup) {
      if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
        setSubmitError(
          "Create a password of at least 8 characters with letters and numbers."
        );
        return;
      }
      if (password !== confirmPassword) {
        setSubmitError("Passwords do not match.");
        return;
      }
    }

    setSubmitting(true);
    try {
      if (needsPasswordSetup) {
        const supabase = getSupabaseBrowserClient();
        if (!supabase) {
          setSubmitError("Supabase authentication is not configured.");
          setSubmitting(false);
          return;
        }
        const { error: pwError } = await supabase.auth.updateUser({
          password,
          data: fullName.trim() ? { full_name: fullName.trim() } : undefined,
        });
        if (pwError) {
          setSubmitError(pwError.message || "Could not save your password.");
          setSubmitting(false);
          return;
        }
      }

      await acceptInvitationById({
        invitationId,
        ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
      });

      await refreshProfile({ silent: true, force: true });
      setAccepted(true);
      pushToast({
        title: "Interviewer invitation accepted",
        description: "Your INTERVIEWER portal access is now active.",
        tone: "success",
      });
      router.replace("/interviewer");
    } catch (err) {
      setSubmitError(formatApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      <header className="flex h-14 items-center justify-between gap-4 border-b border-[var(--border-hairline)] bg-[var(--bg-glass)] px-4 backdrop-blur-md sm:px-8">
        <Link
          href="/"
          className="flex items-center gap-2.5 whitespace-nowrap text-sm font-semibold tracking-tight text-[var(--text-primary)]"
        >
          <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
            <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
          </span>
          <span>GRIT Interview Hub</span>
        </Link>
        <ThemeSwitch />
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-lg rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-elevated)] sm:p-8">
          <div className="mb-6 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
              <MailCheck className="h-4 w-4" aria-hidden="true" />
            </span>
            <div>
              <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--accent-text)]">
                Interviewer Onboarding
              </p>
              <h1 className="text-xl font-semibold tracking-tight text-[var(--text-primary)]">
                Accept Interviewer Invitation
              </h1>
            </div>
          </div>

          {authLoading || verifying ? (
            <div className="flex items-center gap-2.5 py-4 text-sm text-[var(--text-secondary)]">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--accent-primary)]" aria-hidden="true" />
              <span>Verifying invitation session...</span>
            </div>
          ) : !profile ? (
            <div className="space-y-4">
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4 text-sm text-[var(--text-secondary)]">
                <p className="font-medium text-[var(--text-primary)]">
                  Verified Supabase Auth session required
                </p>
                <p className="mt-1.5 text-xs leading-relaxed">
                  Open the invitation link directly from your Supabase Auth email, or sign in with your invited email address below to accept your interviewer role.
                </p>
              </div>
              <div className="flex flex-wrap gap-2.5">
                <Link
                  href={loginRedirectHref}
                  className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)]"
                >
                  <span>Sign in with Invited Email</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                >
                  Return Home
                </Link>
              </div>
            </div>
          ) : verifyError || !inviteInfo ? (
            <div className="space-y-4">
              <div
                role="alert"
                className="flex items-start gap-2.5 rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-bg)] p-4 text-sm text-[var(--status-error)]"
              >
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <div className="space-y-1">
                  <p className="font-medium">{verifyError ?? "Invalid invitation link."}</p>
                  <p className="text-xs text-[var(--text-secondary)]">
                    {verifyErrorCode === "INVITATION_EMAIL_MISMATCH"
                      ? `You are signed in as ${profile.email}. Sign out and open the invitation link using the invited email address.`
                      : "Invitation links expire automatically or may have already been accepted. Ask your GRIT Operations coordinator to issue a new invitation if needed."}
                  </p>
                </div>
              </div>
              <div className="flex flex-wrap gap-2.5">
                {verifyErrorCode === "INVITATION_EMAIL_MISMATCH" ? (
                  <button
                    type="button"
                    disabled={switchingAccount}
                    onClick={() => void handleSwitchAccount()}
                    className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-60"
                  >
                    {switchingAccount ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>Sign Out &amp; Switch Account</span>
                  </button>
                ) : (
                  <Link
                    href="/login"
                    className="inline-flex min-h-10 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)]"
                  >
                    <span>Sign in</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
                <Link
                  href="/"
                  className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                >
                  Return Home
                </Link>
              </div>
            </div>
          ) : accepted ? (
            <div className="space-y-4">
              <div className="flex items-start gap-3 rounded-md border border-[var(--status-success)]/30 bg-[var(--status-success-bg)] p-4">
                <CheckCircle2
                  className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-success)]"
                  aria-hidden="true"
                />
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    Interviewer Access Activated
                  </p>
                  <p className="mt-1 text-xs text-[var(--text-secondary)]">
                    Your account has been granted the INTERVIEWER role.
                  </p>
                </div>
              </div>
              <Link
                href="/interviewer"
                className="inline-flex min-h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)]"
              >
                <span>Open Interviewer Portal</span>
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          ) : (
            <div className="space-y-5">
              <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4 text-xs">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="font-mono font-semibold text-[var(--text-primary)]">
                    {inviteInfo.email}
                  </span>
                  <StatusText
                    label={getInvitationStatusMeta(inviteInfo.status).label}
                    tone={getInvitationStatusMeta(inviteInfo.status).tone}
                  />
                </div>
                <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <div>
                    <dt className="text-[var(--text-muted)]">Assigned Role</dt>
                    <dd className="font-mono font-medium text-[var(--text-primary)]">
                      INTERVIEWER
                    </dd>
                  </div>
                  <div>
                    <dt className="text-[var(--text-muted)]">Default Timezone</dt>
                    <dd className="font-medium text-[var(--text-primary)]">
                      {inviteInfo.defaultTimezone}
                    </dd>
                  </div>
                  {inviteInfo.title ? (
                    <div>
                      <dt className="text-[var(--text-muted)]">Title</dt>
                      <dd className="font-medium text-[var(--text-primary)]">
                        {inviteInfo.title}
                      </dd>
                    </div>
                  ) : null}
                  <div>
                    <dt className="text-[var(--text-muted)]">Expires</dt>
                    <dd className="tabular-nums text-[var(--text-primary)]">
                      {formatTimestamp(inviteInfo.expiresAt)}
                    </dd>
                  </div>
                  {inviteInfo.expertiseTags.length > 0 ? (
                    <div className="sm:col-span-2">
                      <dt className="text-[var(--text-muted)]">Assessment Focus</dt>
                      <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                        {inviteInfo.expertiseTags.join(" · ")}
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </div>

              {inviteInfo.status !== "PENDING" ? (
                <div
                  role="alert"
                  className="space-y-3 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)] p-4 text-xs text-[var(--text-primary)]"
                >
                  <p>
                    This invitation is currently <strong>{inviteInfo.status}</strong>{" "}
                    and can no longer be redeemed. Request a new invitation from an
                    Operations coordinator if needed.
                  </p>
                  {inviteInfo.status === "ACCEPTED" ? (
                    <Link
                      href="/interviewer"
                      className="inline-flex items-center gap-1.5 font-semibold text-[var(--accent-text)] hover:underline"
                    >
                      <span>Go to Interviewer Portal</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              ) : !emailMatchesSignedIn ? (
                <div
                  role="alert"
                  className="space-y-3 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)] p-4 text-xs text-[var(--text-primary)]"
                >
                  <p>
                    You are currently signed in as{" "}
                    <strong>{profile.email}</strong>, which does not match{" "}
                    <strong>{inviteInfo.email}</strong>. Sign out before accepting
                    this invitation.
                  </p>
                  <button
                    type="button"
                    disabled={switchingAccount}
                    onClick={() => void handleSwitchAccount()}
                    className="inline-flex items-center gap-1.5 font-medium text-[var(--accent-text)] hover:underline"
                  >
                    <span>Switch Account</span>
                  </button>
                </div>
              ) : (
                <form onSubmit={handleAccept} noValidate className="space-y-4">
                  {submitError ? (
                    <div
                      role="alert"
                      className="rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-bg)] p-3 text-xs text-[var(--status-error)]"
                    >
                      {submitError}
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor="invite-full-name"
                      className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                    >
                      Display Name
                    </label>
                    <input
                      id="invite-full-name"
                      type="text"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Your full name"
                      className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                    />
                  </div>

                  {needsPasswordSetup ? (
                    <>
                      <div>
                        <label
                          htmlFor="invite-password"
                          className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                        >
                          Create Password (for future sign-ins)
                        </label>
                        <div className="relative">
                          <input
                            id="invite-password"
                            type={showPassword ? "text" : "password"}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="Minimum 8 chars with letters & numbers"
                            className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] py-2 pl-3 pr-10 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            aria-label={showPassword ? "Hide password" : "Show password"}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                          >
                            {showPassword ? (
                              <EyeOff className="h-4 w-4" aria-hidden="true" />
                            ) : (
                              <Eye className="h-4 w-4" aria-hidden="true" />
                            )}
                          </button>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="invite-confirm-password"
                          className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                        >
                          Confirm Password
                        </label>
                        <input
                          id="invite-confirm-password"
                          type={showPassword ? "text" : "password"}
                          value={confirmPassword}
                          onChange={(e) => setConfirmPassword(e.target.value)}
                          placeholder="Re-enter your password"
                          className="block w-full rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                        />
                      </div>
                    </>
                  ) : (
                    <p className="text-xs text-[var(--text-secondary)]">
                      Signed in as <strong>{profile.email}</strong>. Accepting will
                      attach the INTERVIEWER role to your verified account.
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={submitting}
                    className="inline-flex min-h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-55"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                    ) : (
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    )}
                    <span>
                      {submitting
                        ? "Activating interviewer access..."
                        : "Accept Invitation & Continue"}
                    </span>
                  </button>
                </form>
              )}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
