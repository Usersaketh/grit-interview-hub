"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import { PageHeader } from "@frontend/components/PageHeader";
import { StatusText } from "@frontend/components/StatusText";
import {
  EmptyState,
  ErrorBanner,
  SectionSkeleton,
} from "@frontend/components/SurfaceStates";
import { useAuth } from "@frontend/hooks/useAuth";
import {
  formatTimestamp,
  getBookingStatusMeta,
  getOutcomeMeta,
  hasAllowedRole,
  normalizeInterviewResult,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
} from "@frontend/services/dataCache";
import {
  fetchScopedInterviews,
  fetchStaffInterviewersRoster,
  fetchStaffStudentsRoster,
} from "@frontend/services/hubApi";
import type {
  BookingStatus,
  EvaluationOutcome,
  InterviewRecord,
  InterviewerRosterItem,
  StudentRosterItem,
} from "@frontend/types/api";

const PAGE_SIZE = 15;
const CACHE_KEY = "ops:interviews";

interface OpsInterviewsCache {
  interviews: InterviewRecord[];
  students: StudentRosterItem[];
  interviewers: InterviewerRosterItem[];
}

export function OperationsInterviewsView() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const isStaff = Boolean(
    profile && hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])
  );

  const searchParams = useSearchParams();
  const initialStudentId = searchParams.get("studentId") ?? "";

  const initialCached = userId
    ? getCachedData<OpsInterviewsCache>(userId, CACHE_KEY)?.data ?? null
    : null;

  const [interviews, setInterviews] = useState<InterviewRecord[]>(
    () => initialCached?.interviews ?? []
  );
  const [students, setStudents] = useState<StudentRosterItem[]>(
    () => initialCached?.students ?? []
  );
  const [interviewers, setInterviewers] = useState<InterviewerRosterItem[]>(
    () => initialCached?.interviewers ?? []
  );
  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<"ALL" | BookingStatus>("ALL");
  const [outcomeFilter, setOutcomeFilter] = useState<
    "ALL" | EvaluationOutcome
  >("ALL");
  const [query, setQuery] = useState(initialStudentId);
  const [page, setPage] = useState(1);

  const loadData = useCallback(
    async (force = false) => {
      if (!userId || !isStaff) return;

      const cached = getCachedData<OpsInterviewsCache>(userId, CACHE_KEY);
      if (cached && !force) {
        setInterviews(cached.data.interviews);
        setStudents(cached.data.students);
        setInterviewers(cached.data.interviewers);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const result = await fetchWithUserCache<OpsInterviewsCache>(
          userId,
          CACHE_KEY,
          async () => {
            const [interviewsData, studentsData, interviewersData] =
              await Promise.all([
                fetchScopedInterviews(),
                fetchStaffStudentsRoster().catch(
                  () => [] as StudentRosterItem[]
                ),
                fetchStaffInterviewersRoster().catch(
                  () => [] as InterviewerRosterItem[]
                ),
              ]);
            return {
              interviews: interviewsData,
              students: studentsData,
              interviewers: interviewersData,
            };
          },
          { force }
        );
        setInterviews(result.interviews);
        setStudents(result.students);
        setInterviewers(result.interviewers);
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
    void loadData(false);
  }, [loadData]);

  const studentMap = useMemo(
    () => new Map(students.map((s) => [s.id, s])),
    [students]
  );
  const interviewerMap = useMemo(
    () => new Map(interviewers.map((i) => [i.id, i])),
    [interviewers]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return interviews.filter((item) => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      const res = normalizeInterviewResult(item.interview_results);
      if (outcomeFilter !== "ALL") {
        if (!res || res.outcome !== outcomeFilter) return false;
      }

      if (!q) return true;
      const student = studentMap.get(item.student_id);
      const interviewer = interviewerMap.get(item.interviewer_id);
      return (
        item.booking_reference.toLowerCase().includes(q) ||
        item.student_id.toLowerCase().includes(q) ||
        item.interviewer_id.toLowerCase().includes(q) ||
        (item.badges?.name ?? "").toLowerCase().includes(q) ||
        (student?.profile?.full_name ?? "").toLowerCase().includes(q) ||
        (student?.external_student_id ?? "").toLowerCase().includes(q) ||
        (interviewer?.profile?.full_name ?? "").toLowerCase().includes(q)
      );
    });
  }, [
    interviews,
    statusFilter,
    outcomeFilter,
    query,
    studentMap,
    interviewerMap,
  ]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageItems = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE
  );

  return (
    <AppShell
      allowedRoles={["OPERATIONS", "ADMIN"]}
      sectionLabel="Operations Portal"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Operations Portal", href: "/operations" },
          { label: "Interviews" },
        ]}
        title="Interview Operations"
        description="Inspect all scheduled, in-progress, and evaluated badge interviews across students and interviewers."
      />

      {/* Filter Bar */}
      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="sr-only" htmlFor="ops-status-filter">
              Booking status filter
            </label>
            <select
              id="ops-status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as "ALL" | BookingStatus);
                setPage(1);
              }}
              className="min-h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              <option value="ALL">All Booking Statuses</option>
              <option value="BOOKED">Booked</option>
              <option value="RESCHEDULE_PENDING">Reschedule Pending</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="AWAITING_OUTCOME">Awaiting Outcome</option>
              <option value="EVALUATED">Evaluated</option>
              <option value="CANCELLED">Cancelled</option>
              <option value="INTERVIEWER_CANCELLED">Interviewer Cancelled</option>
              <option value="NO_SHOW">No Show</option>
            </select>
          </div>

          <div>
            <label className="sr-only" htmlFor="ops-outcome-filter">
              Evaluation outcome filter
            </label>
            <select
              id="ops-outcome-filter"
              value={outcomeFilter}
              onChange={(e) => {
                setOutcomeFilter(e.target.value as "ALL" | EvaluationOutcome);
                setPage(1);
              }}
              className="min-h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              <option value="ALL">All Outcomes</option>
              <option value="PASS">Pass</option>
              <option value="FAIL">Fail</option>
              <option value="RETAKE_LATER">Retake Later</option>
            </select>
          </div>
        </div>

        <div className="relative">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
            aria-hidden="true"
          />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder="Search reference, student, badge..."
            aria-label="Search operations interviews"
            className="min-h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none sm:w-64"
          />
        </div>
      </div>

      {loading ? (
        <SectionSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadData(true)} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No interviews match current filters"
          description="Adjust the status, outcome, or search filters to view records."
        />
      ) : (
        <div className="space-y-4">
          <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)]">
                    <th className="px-4 py-3">Reference &amp; Badge</th>
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Interviewer</th>
                    <th className="px-4 py-3">Scheduled Time</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Outcome</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {pageItems.map((item) => {
                    const student = studentMap.get(item.student_id);
                    const interviewer = interviewerMap.get(item.interviewer_id);
                    const statusMeta = getBookingStatusMeta(item.status);
                    const res = normalizeInterviewResult(
                      item.interview_results
                    );
                    const outcomeMeta = res
                      ? getOutcomeMeta(res.outcome)
                      : null;

                    return (
                      <tr
                        key={item.id}
                        className="transition-colors hover:bg-[var(--bg-elevated)]"
                      >
                        <td className="px-4 py-3.5 align-top">
                          <p className="font-medium text-[var(--text-primary)]">
                            {item.badges?.name ?? "Badge Interview"}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                            {item.booking_reference} · #{item.attempt_number}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <p className="text-[var(--text-primary)]">
                            {student?.profile?.full_name ?? "Student"}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                            {student?.external_student_id ??
                              `${item.student_id.slice(0, 8)}…`}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <p className="text-[var(--text-primary)]">
                            {interviewer?.profile?.full_name ?? "Interviewer"}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                            {item.interviewer_id.slice(0, 8)}…
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-top text-xs tabular-nums text-[var(--text-secondary)]">
                          <p className="text-[var(--text-primary)]">
                            {formatTimestamp(item.starts_at, item.timezone)}
                          </p>
                          <p className="mt-0.5">{item.timezone}</p>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <StatusText
                            label={statusMeta.label}
                            tone={statusMeta.tone}
                          />
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          {outcomeMeta ? (
                            <StatusText
                              label={outcomeMeta.label}
                              tone={outcomeMeta.tone}
                            />
                          ) : (
                            <span className="text-xs text-[var(--text-muted)]">
                              Pending
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

          {totalPages > 1 ? (
            <div className="flex items-center justify-between text-xs text-[var(--text-secondary)]">
              <span className="tabular-nums">
                Showing {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, filtered.length)} of{" "}
                {filtered.length} interviews
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={safePage <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Previous</span>
                </button>
                <span className="tabular-nums">
                  Page {safePage} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  className="inline-flex min-h-8 items-center gap-1 whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
