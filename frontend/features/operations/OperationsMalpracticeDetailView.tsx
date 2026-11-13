"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, RotateCcw, ShieldX } from "lucide-react";
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
  canNullifyCase,
  canReinstateCase,
  formatTimestamp,
  generateUuid,
  getAllowedReviewTransitions,
  getCertificationStatusMeta,
  getMalpracticeStatusMeta,
  hasAllowedRole,
  validateReinstateForm,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchBadgesCatalog,
  fetchMalpracticeQueue,
  fetchStaffStudentsRoster,
  nullifyBadgeAward,
  reinstateBadgeAward,
  reviewMalpracticeReport,
} from "@frontend/services/hubApi";
import type {
  BadgeAwardRecord,
  BadgeSummary,
  MalpracticeQueueRow,
  MalpracticeReviewTargetStatus,
  StudentRosterItem,
} from "@frontend/types/api";

type ActiveDialog =
  | { type: "review"; toStatus: MalpracticeReviewTargetStatus }
  | { type: "nullify" }
  | { type: "reinstate" }
  | null;

export function OperationsMalpracticeDetailView({
  reportId,
}: {
  reportId: string;
}) {
  const { profile } = useAuth();
  const { pushToast } = useToast();

  const [report, setReport] = useState<MalpracticeQueueRow | null>(null);
  const [student, setStudent] = useState<StudentRosterItem | null>(null);
  const [badge, setBadge] = useState<BadgeSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedTransition, setSelectedTransition] = useState<
    MalpracticeReviewTargetStatus | ""
  >("");
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [reinstateReason, setReinstateReason] = useState("");
  const [reinstateError, setReinstateError] = useState<string | null>(null);

  const [actionError, setActionError] = useState<string | null>(null);
  const [activeDialog, setActiveDialog] = useState<ActiveDialog>(null);
  const [busy, setBusy] = useState(false);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateUuid()
  );
  const [lastAwardUpdate, setLastAwardUpdate] =
    useState<BadgeAwardRecord | null>(null);

  const loadCase = useCallback(async () => {
    if (!profile || !hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [queueData, studentsData, badgesData] = await Promise.all([
        fetchMalpracticeQueue(),
        fetchStaffStudentsRoster().catch(() => [] as StudentRosterItem[]),
        fetchBadgesCatalog().catch(() => [] as BadgeSummary[]),
      ]);

      const match = queueData.find((r) => r.id === reportId) ?? null;
      setReport(match);

      if (match) {
        setStudent(studentsData.find((s) => s.id === match.student_id) ?? null);
        setBadge(badgesData.find((b) => b.id === match.badge_id) ?? null);
        const allowed = getAllowedReviewTransitions(match.status);
        setSelectedTransition(allowed[0] ?? "");
      }
    } catch (err) {
      setError(formatApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [reportId, profile]);

  useEffect(() => {
    void loadCase();
  }, [loadCase]);

  const handleConfirmAction = async () => {
    if (!report || !activeDialog) return;
    setBusy(true);
    setActionError(null);
    try {
      if (activeDialog.type === "review") {
        const updated = await reviewMalpracticeReport(report.id, {
          toStatus: activeDialog.toStatus,
          ...(reviewerNotes.trim()
            ? { reviewerNotes: reviewerNotes.trim() }
            : {}),
          idempotencyKey,
        });
        setActiveDialog(null);
        setReviewerNotes("");
        setIdempotencyKey(generateUuid());
        pushToast({
          tone: "success",
          title: "Case status updated",
          description: `Investigation transitioned to ${updated.status}.`,
        });
        await loadCase();
      } else if (activeDialog.type === "nullify") {
        const award = await nullifyBadgeAward(report.id, { idempotencyKey });
        setLastAwardUpdate(award);
        setActiveDialog(null);
        setIdempotencyKey(generateUuid());
        pushToast({
          tone: "warning",
          title: "Badge award nullified",
          description: `Badge Award ${award.id.slice(0, 8)}… is now NULLIFIED.`,
        });
        await loadCase();
      } else if (activeDialog.type === "reinstate") {
        const award = await reinstateBadgeAward(report.id, {
          reason: reinstateReason.trim(),
          idempotencyKey,
        });
        setLastAwardUpdate(award);
        setActiveDialog(null);
        setReinstateReason("");
        setReinstateError(null);
        setIdempotencyKey(generateUuid());
        pushToast({
          tone: "success",
          title: "Badge award reinstated",
          description: `Badge Award ${award.id.slice(0, 8)}… restored and case marked REINSTATED.`,
        });
        await loadCase();
      }
    } catch (err) {
      setActiveDialog(null);
      setActionError(formatApiErrorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const allowedTransitions = report
    ? getAllowedReviewTransitions(report.status)
    : [];
  const isSelfReporter =
    Boolean(profile?.id) &&
    Boolean(report?.reported_by) &&
    profile?.id === report?.reported_by;

  return (
    <AppShell
      allowedRoles={["OPERATIONS", "ADMIN"]}
      sectionLabel="Operations Portal"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Operations Portal", href: "/operations" },
          { label: "Malpractice Queue", href: "/operations/malpractice" },
          { label: report?.reason_code ?? "Case Detail" },
        ]}
        title={report?.reason_code ?? "Malpractice Case Review"}
        description={
          report
            ? `Case ID ${report.id} · Filed ${formatTimestamp(report.created_at)}`
            : "Inspect case evidence, transition investigation state, and execute certification actions."
        }
      />

      {loading ? (
        <SectionSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadCase} />
      ) : !report ? (
        <EmptyState
          title="Malpractice case not found"
          description="No malpractice case matching this identifier was returned from the queue."
          action={
            <Link
              href="/operations/malpractice"
              className="inline-flex items-center rounded-md bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-primary-hover)]"
            >
              Back to Malpractice Queue
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          {actionError ? (
            <ErrorBanner
              title="Governance Action Rejected"
              message={actionError}
            />
          ) : null}

          {lastAwardUpdate ? (
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-semibold text-[var(--text-primary)]">
                  Certification Award State Updated
                </p>
                {(() => {
                  const certMeta = getCertificationStatusMeta(
                    lastAwardUpdate.status
                  );
                  return (
                    <StatusText label={certMeta.label} tone={certMeta.tone} />
                  );
                })()}
              </div>
              <p className="mt-1 font-mono text-xs text-[var(--text-secondary)]">
                Award ID {lastAwardUpdate.id} · Student{" "}
                {lastAwardUpdate.student_id}
              </p>
            </section>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left Column: Case Summary & Evidence */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 lg:col-span-5">
              <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-4">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Case Evidence & Metadata
                </h2>
                {(() => {
                  const meta = getMalpracticeStatusMeta(report.status);
                  return <StatusText label={meta.label} tone={meta.tone} />;
                })()}
              </div>

              <dl className="mt-4 space-y-3.5 text-sm">
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Student
                  </dt>
                  <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                    {student?.profile?.full_name ?? "Student"}
                  </dd>
                  <dd className="font-mono text-xs text-[var(--text-secondary)]">
                    {student?.external_student_id ?? report.student_id}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Associated Badge
                  </dt>
                  <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                    {badge ? `${badge.name} (${badge.level})` : report.badge_id}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Description
                  </dt>
                  <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                    {report.description}
                  </dd>
                </div>

                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Evidence Reference
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs text-[var(--text-primary)]">
                    {report.evidence_reference || "None attached"}
                  </dd>
                </div>

                <div className="border-t border-[var(--border-hairline)] pt-3">
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Reported By (User UUID)
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                    {report.reported_by}
                  </dd>
                </div>

                {report.reviewed_at ? (
                  <div>
                    <dt className="text-xs text-[var(--text-secondary)]">
                      Last Reviewed
                    </dt>
                    <dd className="mt-0.5 text-xs tabular-nums text-[var(--text-primary)]">
                      {formatTimestamp(report.reviewed_at)}
                    </dd>
                    {report.reviewer_notes ? (
                      <dd className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                        Notes: {report.reviewer_notes}
                      </dd>
                    ) : null}
                  </div>
                ) : null}
              </dl>
            </section>

            {/* Right Column: Three Strictly Separated Governance Panels */}
            <div className="space-y-6 lg:col-span-7">
              {/* 1. Investigation Review Transitions */}
              <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                <h2 className="border-b border-[var(--border-hairline)] pb-3 text-base font-semibold text-[var(--text-primary)]">
                  1. Investigation Status Transition
                </h2>

                {isSelfReporter ? (
                  <div className="mt-4 flex items-start gap-2.5 rounded-md bg-[var(--status-warning-bg)] p-3.5 text-xs text-[var(--text-primary)]">
                    <AlertTriangle
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warning)]"
                      aria-hidden="true"
                    />
                    <span>
                      Separation of duties: you filed this report, so another
                      Operations or Admin reviewer must submit status review
                      transitions.
                    </span>
                  </div>
                ) : null}

                {allowedTransitions.length === 0 ? (
                  <p className="mt-4 text-sm text-[var(--text-secondary)]">
                    Case status is{" "}
                    <span className="font-medium text-[var(--text-primary)]">
                      {report.status}
                    </span>
                    . No further review transitions are permitted from this
                    state.
                  </p>
                ) : (
                  <div className="mt-4 space-y-4">
                    <div>
                      <label
                        htmlFor="review-target-status"
                        className="block text-xs font-medium text-[var(--text-secondary)]"
                      >
                        Allowed Next State
                      </label>
                      <select
                        id="review-target-status"
                        value={selectedTransition}
                        onChange={(e) => {
                          setSelectedTransition(
                            e.target.value as MalpracticeReviewTargetStatus
                          );
                          setIdempotencyKey(generateUuid());
                        }}
                        disabled={isSelfReporter}
                        className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-50"
                      >
                        {allowedTransitions.map((status) => (
                          <option key={status} value={status}>
                            {status.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label
                        htmlFor="review-notes"
                        className="block text-xs font-medium text-[var(--text-secondary)]"
                      >
                        Reviewer Notes (Optional, max 5000 chars)
                      </label>
                      <textarea
                        id="review-notes"
                        rows={3}
                        value={reviewerNotes}
                        onChange={(e) => {
                          setReviewerNotes(e.target.value);
                          setIdempotencyKey(generateUuid());
                        }}
                        disabled={isSelfReporter}
                        placeholder="Record review rationale for the audit log..."
                        className="mt-1.5 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] p-3 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-50"
                      />
                    </div>

                    <div className="flex justify-end">
                      <button
                        type="button"
                        disabled={!selectedTransition || isSelfReporter || busy}
                        onClick={() => {
                          if (!selectedTransition) return;
                          setActiveDialog({
                            type: "review",
                            toStatus: selectedTransition,
                          });
                        }}
                        className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
                      >
                        Transition Investigation Status
                      </button>
                    </div>
                  </div>
                )}
              </section>

              {/* 2. Certification Nullification */}
              <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
                  <ShieldX
                    className="h-4 w-4 text-[var(--status-error)]"
                    aria-hidden="true"
                  />
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    2. Badge Award Nullification
                  </h2>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  Nullifying revokes an existing AWARDED badge for this student
                  and badge. Requires the investigation status to be CONFIRMED.
                </p>

                <div className="mt-4 flex items-center justify-between gap-4">
                  <span className="text-xs text-[var(--text-muted)]">
                    {canNullifyCase(report.status)
                      ? "Eligible: Case is CONFIRMED."
                      : `Locked while status is ${report.status}.`}
                  </span>
                  <button
                    type="button"
                    disabled={!canNullifyCase(report.status) || busy}
                    onClick={() => {
                      setIdempotencyKey(generateUuid());
                      setActiveDialog({ type: "nullify" });
                    }}
                    className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md bg-[var(--status-error)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
                  >
                    Nullify Awarded Badge
                  </button>
                </div>
              </section>

              {/* 3. Certification Reinstatement */}
              <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                <div className="flex items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
                  <RotateCcw
                    className="h-4 w-4 text-[var(--status-success)]"
                    aria-hidden="true"
                  />
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    3. Appeal Reinstatement
                  </h2>
                </div>
                <p className="mt-3 text-xs leading-relaxed text-[var(--text-secondary)]">
                  Reinstates a NULLIFIED badge award and transitions this case
                  to REINSTATED. Requires the case status to be APPEALED.
                </p>

                <div className="mt-4 space-y-3">
                  <div>
                    <label
                      htmlFor="reinstate-reason"
                      className="block text-xs font-medium text-[var(--text-secondary)]"
                    >
                      Reinstatement Justification (Required)
                    </label>
                    <textarea
                      id="reinstate-reason"
                      rows={2}
                      value={reinstateReason}
                      onChange={(e) => {
                        setReinstateReason(e.target.value);
                        if (reinstateError) setReinstateError(null);
                      }}
                      disabled={!canReinstateCase(report.status)}
                      placeholder="Document appeal findings and approval rationale..."
                      className="mt-1.5 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] p-2.5 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-50"
                    />
                    {reinstateError ? (
                      <p className="mt-1 text-xs text-[var(--status-error)]">
                        {reinstateError}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex items-center justify-between gap-4">
                    <span className="text-xs text-[var(--text-muted)]">
                      {canReinstateCase(report.status)
                        ? "Eligible: Case is APPEALED."
                        : `Locked while status is ${report.status}.`}
                    </span>
                    <button
                      type="button"
                      disabled={!canReinstateCase(report.status) || busy}
                      onClick={() => {
                        const errors = validateReinstateForm({
                          reason: reinstateReason,
                        });
                        if (errors.reason) {
                          setReinstateError(errors.reason);
                          return;
                        }
                        setReinstateError(null);
                        setIdempotencyKey(generateUuid());
                        setActiveDialog({ type: "reinstate" });
                      }}
                      className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-40"
                    >
                      Reinstate Badge Award
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={activeDialog !== null}
        title={
          activeDialog?.type === "review"
            ? `Confirm Transition to ${activeDialog.toStatus}`
            : activeDialog?.type === "nullify"
              ? "Confirm Badge Nullification"
              : "Confirm Badge Reinstatement"
        }
        description={
          activeDialog?.type === "review"
            ? `Advance malpractice case ${report?.id.slice(0, 8) ?? ""}… from ${report?.status ?? ""} to ${activeDialog.toStatus}?`
            : activeDialog?.type === "nullify"
              ? "This action revokes the student's AWARDED badge certification and records a permanent nullification audit entry."
              : "This action restores the student's NULLIFIED badge certification to REINSTATED and closes the appeal."
        }
        confirmLabel={
          activeDialog?.type === "nullify"
            ? "Nullify Badge"
            : activeDialog?.type === "reinstate"
              ? "Reinstate Badge"
              : "Confirm Transition"
        }
        destructive={activeDialog?.type === "nullify"}
        busy={busy}
        onCancel={() => {
          if (!busy) setActiveDialog(null);
        }}
        onConfirm={() => void handleConfirmAction()}
      />
    </AppShell>
  );
}
