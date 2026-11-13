"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Plus, Search } from "lucide-react";
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
  getMalpracticeStatusMeta,
  hasAllowedRole,
  validateMalpracticeReportForm,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
  invalidateUserCache,
} from "@frontend/services/dataCache";
import {
  createMalpracticeReport,
  fetchBadgesCatalog,
  fetchMalpracticeQueue,
  fetchStaffStudentsRoster,
} from "@frontend/services/hubApi";
import type {
  BadgeSummary,
  MalpracticeQueueRow,
  MalpracticeStatus,
  StudentRosterItem,
} from "@frontend/types/api";

const STATUS_TABS: Array<{ id: "ALL" | MalpracticeStatus; label: string }> = [
  { id: "ALL", label: "All Cases" },
  { id: "REPORTED", label: "Reported" },
  { id: "UNDER_REVIEW", label: "Under Review" },
  { id: "CONFIRMED", label: "Confirmed" },
  { id: "APPEALED", label: "Appealed" },
  { id: "DISMISSED", label: "Dismissed" },
  { id: "REINSTATED", label: "Reinstated" },
];

interface OpsMalpracticeCache {
  queue: MalpracticeQueueRow[];
  students: StudentRosterItem[];
  badges: BadgeSummary[];
}

const CACHE_KEY = "ops:malpractice";

export function OperationsMalpracticeView() {
  const { profile } = useAuth();
  const { pushToast } = useToast();
  const userId = profile?.id ?? null;
  const isStaff = Boolean(
    profile && hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])
  );

  const initialCached = userId
    ? getCachedData<OpsMalpracticeCache>(userId, CACHE_KEY)?.data ?? null
    : null;

  const [queue, setQueue] = useState<MalpracticeQueueRow[]>(
    () => initialCached?.queue ?? []
  );
  const [students, setStudents] = useState<StudentRosterItem[]>(
    () => initialCached?.students ?? []
  );
  const [badges, setBadges] = useState<BadgeSummary[]>(
    () => initialCached?.badges ?? []
  );
  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"ALL" | MalpracticeStatus>(
    "ALL"
  );
  const [query, setQuery] = useState("");

  // Create Malpractice Report Form State
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [studentId, setStudentId] = useState("");
  const [badgeId, setBadgeId] = useState("");
  const [reasonCode, setReasonCode] = useState("INTEGRITY_VIOLATION");
  const [description, setDescription] = useState("");
  const [evidenceReference, setEvidenceReference] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [createError, setCreateError] = useState<string | null>(null);
  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateUuid()
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadQueue = useCallback(
    async (force = false) => {
      if (!userId || !isStaff) return;

      const cached = getCachedData<OpsMalpracticeCache>(userId, CACHE_KEY);
      if (cached && !force) {
        setQueue(cached.data.queue);
        setStudents(cached.data.students);
        setBadges(cached.data.badges);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const result = await fetchWithUserCache<OpsMalpracticeCache>(
          userId,
          CACHE_KEY,
          async () => {
            const [queueData, studentsData, badgesData] = await Promise.all([
              fetchMalpracticeQueue(),
              fetchStaffStudentsRoster().catch(() => [] as StudentRosterItem[]),
              fetchBadgesCatalog().catch(() => [] as BadgeSummary[]),
            ]);
            return {
              queue: queueData,
              students: studentsData,
              badges: badgesData,
            };
          },
          { force }
        );
        setQueue(result.queue);
        setStudents(result.students);
        setBadges(result.badges);
      } catch (err) {
        if (!cached) {
          setError(formatApiErrorMessage(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [isStaff, userId]
  );

  useEffect(() => {
    void loadQueue(false);
  }, [loadQueue]);

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );
  const badgeMap = useMemo(
    () => new Map(badges.map((b) => [b.id, b])),
    [badges]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return queue.filter((row) => {
      if (statusFilter !== "ALL" && row.status !== statusFilter) return false;
      if (!q) return true;
      const student = studentMap.get(row.student_id);
      const badge = badgeMap.get(row.badge_id);
      return (
        row.id.toLowerCase().includes(q) ||
        row.reason_code.toLowerCase().includes(q) ||
        row.description.toLowerCase().includes(q) ||
        row.student_id.toLowerCase().includes(q) ||
        row.badge_id.toLowerCase().includes(q) ||
        (student?.profile?.full_name ?? "").toLowerCase().includes(q) ||
        (student?.external_student_id ?? "").toLowerCase().includes(q) ||
        (badge?.name ?? "").toLowerCase().includes(q)
      );
    });
  }, [queue, statusFilter, query, studentMap, badgeMap]);

  const handleOpenCreateConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    setCreateError(null);
    const errors = validateMalpracticeReportForm({
      studentId,
      badgeId,
      reasonCode,
      description,
      evidenceReference,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;
    setConfirmOpen(true);
  };

  const handleConfirmCreate = async () => {
    setSubmitting(true);
    setCreateError(null);
    try {
      const created = await createMalpracticeReport({
        studentId: studentId.trim(),
        badgeId: badgeId.trim(),
        reasonCode: reasonCode.trim(),
        description: description.trim(),
        ...(evidenceReference.trim()
          ? { evidenceReference: evidenceReference.trim() }
          : {}),
        idempotencyKey,
      });

      setConfirmOpen(false);
      setStudentId("");
      setBadgeId("");
      setReasonCode("INTEGRITY_VIOLATION");
      setDescription("");
      setEvidenceReference("");
      setFieldErrors({});
      setShowCreateForm(false);
      setIdempotencyKey(generateUuid());

      pushToast({
        tone: "success",
        title: "Malpractice report filed",
        description: `Case ${created.id.slice(0, 8)}… created in ${created.status} status.`,
      });
      if (userId) invalidateUserCache(userId, "ops:");
      await loadQueue(true);
    } catch (err) {
      setConfirmOpen(false);
      setCreateError(formatApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell
      allowedRoles={["OPERATIONS", "ADMIN"]}
      sectionLabel="Operations Portal"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Operations Portal", href: "/operations" },
          { label: "Malpractice Queue" },
        ]}
        title="Malpractice & Integrity Governance"
        description="File integrity reports, advance case reviews, and execute certification nullifications or appeal reinstatements."
        actions={
          <button
            type="button"
            onClick={() => setShowCreateForm((prev) => !prev)}
            className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
          >
            <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>{showCreateForm ? "Close Report Form" : "File Report"}</span>
          </button>
        }
      />

      {/* Collapsible Create Report Panel */}
      {showCreateForm ? (
        <section className="mb-6 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
          <div className="mb-4 border-b border-[var(--border-hairline)] pb-3">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              Create Malpractice Report
            </h2>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Reports enter REPORTED status. Note: the user who files a report
              cannot review that same case (separation of duties enforced by
              backend).
            </p>
          </div>

          <form
            onSubmit={handleOpenCreateConfirm}
            noValidate
            className="grid grid-cols-1 gap-4 md:grid-cols-2"
          >
            {createError ? (
              <div
                role="alert"
                className="rounded-md bg-[var(--status-error-bg)] px-4 py-3 text-xs text-[var(--status-error)] md:col-span-2"
              >
                {createError}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="mal-student"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Student
              </label>
              {students.length > 0 ? (
                <select
                  id="mal-student"
                  value={studentId}
                  onChange={(e) => {
                    setStudentId(e.target.value);
                    setIdempotencyKey(generateUuid());
                  }}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                >
                  <option value="">Select a student...</option>
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.profile?.full_name ?? "Student"} (
                      {s.external_student_id})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="mal-student"
                  type="text"
                  value={studentId}
                  onChange={(e) => {
                    setStudentId(e.target.value);
                    setIdempotencyKey(generateUuid());
                  }}
                  placeholder="Student UUID"
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              )}
              {fieldErrors.studentId ? (
                <p className="mt-1 text-xs text-[var(--status-error)]">
                  {fieldErrors.studentId}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="mal-badge"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Badge
              </label>
              {badges.length > 0 ? (
                <select
                  id="mal-badge"
                  value={badgeId}
                  onChange={(e) => {
                    setBadgeId(e.target.value);
                    setIdempotencyKey(generateUuid());
                  }}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                >
                  <option value="">Select a badge...</option>
                  {badges.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} ({b.level})
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  id="mal-badge"
                  type="text"
                  value={badgeId}
                  onChange={(e) => {
                    setBadgeId(e.target.value);
                    setIdempotencyKey(generateUuid());
                  }}
                  placeholder="Badge UUID"
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
              )}
              {fieldErrors.badgeId ? (
                <p className="mt-1 text-xs text-[var(--status-error)]">
                  {fieldErrors.badgeId}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="mal-reason-code"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Reason Code (max 64 chars)
              </label>
              <input
                id="mal-reason-code"
                type="text"
                value={reasonCode}
                onChange={(e) => {
                  setReasonCode(e.target.value);
                  setIdempotencyKey(generateUuid());
                }}
                placeholder="CODE_PLAGIARISM"
                className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
              {fieldErrors.reasonCode ? (
                <p className="mt-1 text-xs text-[var(--status-error)]">
                  {fieldErrors.reasonCode}
                </p>
              ) : null}
            </div>

            <div>
              <label
                htmlFor="mal-evidence"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Evidence Reference (Optional, max 500 chars)
              </label>
              <input
                id="mal-evidence"
                type="text"
                value={evidenceReference}
                onChange={(e) => {
                  setEvidenceReference(e.target.value);
                  setIdempotencyKey(generateUuid());
                }}
                placeholder="Session recording reference or incident ticket ID"
                className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
              {fieldErrors.evidenceReference ? (
                <p className="mt-1 text-xs text-[var(--status-error)]">
                  {fieldErrors.evidenceReference}
                </p>
              ) : null}
            </div>

            <div className="md:col-span-2">
              <label
                htmlFor="mal-description"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Detailed Description
              </label>
              <textarea
                id="mal-description"
                rows={4}
                value={description}
                onChange={(e) => {
                  setDescription(e.target.value);
                  setIdempotencyKey(generateUuid());
                }}
                placeholder="Document factual observations, timestamps, and verification findings..."
                className="mt-1.5 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
              {fieldErrors.description ? (
                <p className="mt-1 text-xs text-[var(--status-error)]">
                  {fieldErrors.description}
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-3 md:col-span-2">
              <button
                type="button"
                onClick={() => setShowCreateForm(false)}
                className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-60"
              >
                Review &amp; File Report
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {/* Filter Bar */}
      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`min-h-8 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
                statusFilter === tab.id
                  ? "bg-[var(--accent-primary)] text-white"
                  : "border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search reason, student, badge..."
            aria-label="Search malpractice cases"
            className="min-h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none sm:w-60"
          />
        </div>
      </div>

      {loading ? (
        <SectionSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadQueue(true)} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No malpractice cases match"
          description="No malpractice investigations matched the selected status or search filter."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)]">
                  <th className="px-4 py-3">Reason &amp; Case ID</th>
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">Badge</th>
                  <th className="px-4 py-3">Filed At</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filtered.map((row) => {
                  const student = studentMap.get(row.student_id);
                  const badge = badgeMap.get(row.badge_id);
                  const meta = getMalpracticeStatusMeta(row.status);
                  return (
                    <tr
                      key={row.id}
                      className="transition-colors hover:bg-[var(--bg-elevated)]"
                    >
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-medium text-[var(--text-primary)]">
                          {row.reason_code}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                          {row.id.slice(0, 8)}…
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="text-[var(--text-primary)]">
                          {student?.profile?.full_name ?? "Student"}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                          {student?.external_student_id ??
                            `${row.student_id.slice(0, 8)}…`}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="text-[var(--text-primary)]">
                          {badge?.name ?? "Badge"}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                          {row.badge_id.slice(0, 8)}…
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs tabular-nums text-[var(--text-secondary)]">
                        {formatTimestamp(row.created_at)}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <StatusText label={meta.label} tone={meta.tone} />
                      </td>
                      <td className="px-4 py-3.5 text-right align-top">
                        <Link
                          href={`/operations/malpractice/${row.id}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                        >
                          <span>Inspect &amp; Act</span>
                          <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Malpractice Report Filing"
        description="Submitting this malpractice report creates an immutable investigation record and notifies governance workflows. Proceed?"
        confirmLabel="File Malpractice Report"
        destructive
        busy={submitting}
        onCancel={() => {
          if (!submitting) setConfirmOpen(false);
        }}
        onConfirm={() => void handleConfirmCreate()}
      />
    </AppShell>
  );
}
