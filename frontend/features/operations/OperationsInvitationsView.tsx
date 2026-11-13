"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Check, Copy, MailPlus, RefreshCw, ShieldX } from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import { ConfirmDialog } from "@frontend/components/ConfirmDialog";
import { PageHeader } from "@frontend/components/PageHeader";
import { StatusText } from "@frontend/components/StatusText";
import {
  EmptyState,
  ErrorBanner,
  SectionSkeleton,
} from "@frontend/components/SurfaceStates";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import {
  formatTimestamp,
  generateUuid,
  getInvitationStatusMeta,
  hasAllowedRole,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  createAdminInvitation,
  fetchAdminInvitations,
  revokeAdminInvitation,
} from "@frontend/services/hubApi";
import type {
  InterviewerInvitationRecord,
  InvitationStatus,
} from "@frontend/types/api";

const TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Singapore",
];

export function OperationsInvitationsView() {
  const { profile } = useAuth();
  const { pushToast } = useToast();

  const [invitations, setInvitations] = useState<InterviewerInvitationRecord[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"ALL" | InvitationStatus>(
    "ALL"
  );

  // Create form
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [title, setTitle] = useState("");
  const [defaultTimezone, setDefaultTimezone] = useState("Asia/Kolkata");
  const [expertiseInput, setExpertiseInput] = useState("");
  const [expiresInDays, setExpiresInDays] = useState(7);
  const [formError, setFormError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createIdemKey, setCreateIdemKey] = useState(() => generateUuid());
  const [issuedInviteUrl, setIssuedInviteUrl] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Revoke state
  const [revokeTarget, setRevokeTarget] =
    useState<InterviewerInvitationRecord | null>(null);
  const [revoking, setRevoking] = useState(false);

  const loadInvitations = useCallback(async () => {
    if (!profile || !hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAdminInvitations();
      setInvitations(data);
    } catch (err) {
      setError(formatApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const handleCreate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFormError(null);

    const trimmedEmail = email.trim().toLowerCase();
    if (!trimmedEmail || !trimmedEmail.includes("@")) {
      setFormError("Enter a valid email address for the invited assessor.");
      return;
    }

    const expertiseTags = expertiseInput
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    setCreating(true);
    try {
      const res = await createAdminInvitation({
        email: trimmedEmail,
        ...(fullName.trim() ? { fullName: fullName.trim() } : {}),
        defaultTimezone,
        ...(title.trim() ? { title: title.trim() } : {}),
        expertiseTags,
        expiresInDays,
        idempotencyKey: createIdemKey,
      });

      setIssuedInviteUrl(res.inviteUrl);
      setCopiedUrl(false);
      setEmail("");
      setFullName("");
      setTitle("");
      setExpertiseInput("");
      setCreateIdemKey(generateUuid());
      pushToast({
        tone: "success",
        title: "Invitation created",
        description: `Issued single-use INTERVIEWER invitation for ${res.invitation.email}.`,
      });
      await loadInvitations();
    } catch (err) {
      setFormError(formatApiErrorMessage(err));
    } finally {
      setCreating(false);
    }
  };

  const handleRevokeConfirm = async () => {
    if (!revokeTarget) return;
    setRevoking(true);
    try {
      await revokeAdminInvitation(revokeTarget.id, {
        reason: "Revoked via Operations Invitation Portal",
        idempotencyKey: generateUuid(),
      });
      pushToast({
        tone: "info",
        title: "Invitation revoked",
        description: `Revoked pending invitation for ${revokeTarget.email}.`,
      });
      setRevokeTarget(null);
      await loadInvitations();
    } catch (err) {
      pushToast({
        tone: "error",
        title: "Revocation failed",
        description: formatApiErrorMessage(err),
      });
      setRevokeTarget(null);
    } finally {
      setRevoking(false);
    }
  };

  const handleCopyInviteUrl = async () => {
    if (!issuedInviteUrl || typeof navigator === "undefined") return;
    await navigator.clipboard.writeText(issuedInviteUrl);
    setCopiedUrl(true);
  };

  const filteredInvitations = useMemo(() => {
    if (statusFilter === "ALL") return invitations;
    return invitations.filter((inv) => inv.status === statusFilter);
  }, [invitations, statusFilter]);

  return (
    <AppShell
      allowedRoles={["OPERATIONS", "ADMIN"]}
      sectionLabel="Operations Portal"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Operations Portal", href: "/operations" },
          { label: "Interviewer Invitations" },
        ]}
        title="Interviewer Invitations"
        description="Onboard certified badge interviewers via secure, single-use, expiring invitations. Role assignment is strictly locked to INTERVIEWER."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left 5 Columns: Issue Invitation Form */}
        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 lg:col-span-5">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
            <div className="flex items-center gap-2">
              <MailPlus
                className="h-4 w-4 text-[var(--accent-primary)]"
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Issue Assessor Invitation
              </h2>
            </div>
            <span className="rounded bg-[var(--accent-soft)] px-2 py-0.5 text-[11px] font-semibold text-[var(--accent-text)]">
              Role: INTERVIEWER
            </span>
          </div>

          <form onSubmit={handleCreate} noValidate className="space-y-4">
            {formError ? (
              <div
                role="alert"
                className="rounded-md bg-[var(--status-error-bg)] p-3 text-xs text-[var(--status-error)]"
              >
                {formError}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="inv-email"
                className="mb-1 block text-xs font-medium text-[var(--text-primary)]"
              >
                Assessor Email (Required)
              </label>
              <input
                id="inv-email"
                type="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setCreateIdemKey(generateUuid());
                }}
                placeholder="assessor@institution.edu"
                className="block w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label
                htmlFor="inv-name"
                className="mb-1 block text-xs font-medium text-[var(--text-primary)]"
              >
                Full Name (Optional)
              </label>
              <input
                id="inv-name"
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                placeholder="Dr. Kavya Nair"
                className="block w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </div>

            <div>
              <label
                htmlFor="inv-title"
                className="mb-1 block text-xs font-medium text-[var(--text-primary)]"
              >
                Assessor Title (Optional)
              </label>
              <input
                id="inv-title"
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Staff Backend Architect"
                className="block w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="inv-timezone"
                  className="mb-1 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Default Timezone
                </label>
                <select
                  id="inv-timezone"
                  value={defaultTimezone}
                  onChange={(e) => setDefaultTimezone(e.target.value)}
                  className="block w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-2 text-sm text-[var(--text-primary)]"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz}>
                      {tz}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label
                  htmlFor="inv-expiry"
                  className="mb-1 block text-xs font-medium text-[var(--text-primary)]"
                >
                  Valid For
                </label>
                <select
                  id="inv-expiry"
                  value={expiresInDays}
                  onChange={(e) => setExpiresInDays(Number(e.target.value))}
                  className="block w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-2 text-sm text-[var(--text-primary)]"
                >
                  <option value={1}>24 hours</option>
                  <option value={3}>3 days</option>
                  <option value={7}>7 days</option>
                  <option value={14}>14 days</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="inv-tags"
                className="mb-1 block text-xs font-medium text-[var(--text-primary)]"
              >
                Expertise Tags (comma-separated, optional)
              </label>
              <input
                id="inv-tags"
                type="text"
                value={expertiseInput}
                onChange={(e) => setExpertiseInput(e.target.value)}
                placeholder="TypeScript, Distributed Systems, PostgreSQL"
                className="block w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)]"
              />
            </div>

            <button
              type="submit"
              disabled={creating}
              className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-55"
            >
              {creating ? "Generating Secure Link..." : "Create Interviewer Invitation"}
            </button>
          </form>

          {issuedInviteUrl ? (
            <div className="mt-5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4">
              <p className="text-xs font-semibold text-[var(--text-primary)]">
                Single-Use Invitation Link Ready
              </p>
              <p className="mt-1 text-xs text-[var(--text-secondary)]">
                Share this link securely with the invited interviewer. Only a
                SHA-256 hash is stored on the server.
              </p>
              <div className="mt-2.5 flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={issuedInviteUrl}
                  aria-label="Generated invitation link"
                  className="min-w-0 flex-1 rounded border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 font-mono text-[11px] text-[var(--text-primary)]"
                />
                <button
                  type="button"
                  onClick={() => void handleCopyInviteUrl()}
                  className="inline-flex shrink-0 items-center gap-1 rounded border border-[var(--border-strong)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                >
                  {copiedUrl ? (
                    <>
                      <Check className="h-3.5 w-3.5 text-[var(--status-success)]" aria-hidden="true" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}
        </section>

        {/* Right 7 Columns: Invitations Table */}
        <section className="space-y-4 lg:col-span-7">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
            <div className="flex flex-wrap gap-1.5">
              {(["ALL", "PENDING", "ACCEPTED", "REVOKED", "EXPIRED"] as const).map(
                (tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setStatusFilter(tab)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium ${
                      statusFilter === tab
                        ? "bg-[var(--accent-primary)] text-white"
                        : "border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    {tab === "ALL" ? "All" : getInvitationStatusMeta(tab).label}
                  </button>
                )
              )}
            </div>

            <button
              type="button"
              onClick={() => void loadInvitations()}
              className="inline-flex items-center gap-1.5 rounded-md border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Refresh</span>
            </button>
          </div>

          {loading ? (
            <SectionSkeleton rows={5} />
          ) : error ? (
            <ErrorBanner message={error} onRetry={loadInvitations} />
          ) : filteredInvitations.length === 0 ? (
            <EmptyState
              title="No invitations found"
              description="Issued interviewer invitations and their lifecycle statuses will appear here."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)]">
                      <th className="px-4 py-3">Assessor</th>
                      <th className="px-4 py-3">Expires / Invited By</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3 text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {filteredInvitations.map((inv) => {
                      const meta = getInvitationStatusMeta(inv.status);
                      return (
                        <tr
                          key={inv.id}
                          className="transition-colors hover:bg-[var(--bg-elevated)]"
                        >
                          <td className="px-4 py-3.5 align-top">
                            <p className="font-medium text-[var(--text-primary)]">
                              {inv.full_name || inv.email}
                            </p>
                            <p className="text-xs text-[var(--text-secondary)]">
                              {inv.email}
                              {inv.title ? ` · ${inv.title}` : ""}
                            </p>
                          </td>
                          <td className="px-4 py-3.5 align-top text-xs text-[var(--text-secondary)]">
                            <p className="tabular-nums">
                              Expires {formatTimestamp(inv.expires_at)}
                            </p>
                            {inv.invited_by_name ? (
                              <p className="mt-0.5 text-[var(--text-muted)]">
                                By {inv.invited_by_name}
                              </p>
                            ) : null}
                          </td>
                          <td className="px-4 py-3.5 align-top">
                            <StatusText label={meta.label} tone={meta.tone} />
                          </td>
                          <td className="px-4 py-3.5 text-right align-top">
                            {inv.status === "PENDING" ? (
                              <button
                                type="button"
                                onClick={() => setRevokeTarget(inv)}
                                className="inline-flex items-center gap-1 rounded border border-[var(--border-hairline)] px-2.5 py-1 text-xs font-medium text-[var(--status-error)] hover:bg-[var(--status-error-bg)]"
                              >
                                <ShieldX className="h-3.5 w-3.5" aria-hidden="true" />
                                <span>Revoke</span>
                              </button>
                            ) : (
                              <span className="text-xs text-[var(--text-muted)]">
                                {inv.accepted_at
                                  ? formatTimestamp(inv.accepted_at)
                                  : inv.revoked_at
                                    ? formatTimestamp(inv.revoked_at)
                                    : "Closed"}
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={revokeTarget !== null}
        title="Revoke Interviewer Invitation"
        description={
          revokeTarget
            ? `Revoke pending invitation for ${revokeTarget.email}? The single-use link will stop working immediately.`
            : ""
        }
        confirmLabel="Revoke Invitation"
        busy={revoking}
        onCancel={() => {
          if (!revoking) setRevokeTarget(null);
        }}
        onConfirm={() => void handleRevokeConfirm()}
      />
    </AppShell>
  );
}
