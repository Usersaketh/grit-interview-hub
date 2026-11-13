"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CalendarClock,
  ShieldAlert,
  ShieldCheck,
  Users,
} from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import { PageHeader } from "@frontend/components/PageHeader";
import { StatusText } from "@frontend/components/StatusText";
import {
  EmptyState,
  ErrorBanner,
  MetricStripSkeleton,
  SectionSkeleton,
} from "@frontend/components/SurfaceStates";
import { useAuth } from "@frontend/hooks/useAuth";
import {
  formatTimestamp,
  getMalpracticeStatusMeta,
  hasAllowedRole,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchAdminDashboard,
  fetchInterviewerAvailability,
  fetchMalpracticeQueue,
  fetchScopedInterviews,
  fetchStaffStudentsRoster,
} from "@frontend/services/hubApi";
import type {
  AdminDashboardMetrics,
  InterviewRecord,
  InterviewerAvailabilityRecord,
  MalpracticeQueueRow,
  StudentRosterItem,
} from "@frontend/types/api";

export function OperationsDashboardView() {
  const { profile } = useAuth();
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [malpracticeQueue, setMalpracticeQueue] = useState<MalpracticeQueueRow[]>(
    []
  );
  const [students, setStudents] = useState<StudentRosterItem[]>([]);
  const [interviews, setInterviews] = useState<InterviewRecord[]>([]);
  const [availability, setAvailability] = useState<
    InterviewerAvailabilityRecord[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadOverview = useCallback(async () => {
    if (!profile || !hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [
        dashboardData,
        queueData,
        studentsData,
        interviewsData,
        availData,
      ] = await Promise.all([
        fetchAdminDashboard(),
        fetchMalpracticeQueue(),
        fetchStaffStudentsRoster().catch(() => [] as StudentRosterItem[]),
        fetchScopedInterviews().catch(() => [] as InterviewRecord[]),
        fetchInterviewerAvailability().catch(
          () => [] as InterviewerAvailabilityRecord[]
        ),
      ]);

      setMetrics(dashboardData);
      setMalpracticeQueue(queueData);
      setStudents(studentsData);
      setInterviews(interviewsData);
      setAvailability(availData);
    } catch (err) {
      setError(formatApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const activeMalpractice = useMemo(
    () =>
      malpracticeQueue.filter(
        (c) => c.status !== "DISMISSED" && c.status !== "REINSTATED"
      ),
    [malpracticeQueue]
  );

  const statusBreakdown = useMemo(() => {
    const booked = interviews.filter(
      (i) => i.status === "BOOKED" || i.status === "RESCHEDULE_PENDING"
    ).length;
    const awaitingEval = interviews.filter(
      (i) => i.status === "IN_PROGRESS" || i.status === "AWAITING_OUTCOME"
    ).length;
    const evaluated = interviews.filter((i) => i.status === "EVALUATED").length;
    const closedOther = interviews.filter(
      (i) =>
        i.status === "CANCELLED" ||
        i.status === "INTERVIEWER_CANCELLED" ||
        i.status === "NO_SHOW"
    ).length;
    return { booked, awaitingEval, evaluated, closedOther };
  }, [interviews]);

  const activeWindowsCount = useMemo(
    () => availability.filter((a) => a.is_active).length,
    [availability]
  );

  return (
    <AppShell
      allowedRoles={["OPERATIONS", "ADMIN"]}
      sectionLabel="Operations Portal"
    >
      <PageHeader
        breadcrumbs={[{ label: "Operations Portal" }]}
        title="Operations Overview"
        description="Monitor institution-wide interview volume, pending evaluations, student rosters, interviewer availability, and certification integrity."
        actions={
          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href="/operations/certifications"
              className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Approve Certification</span>
            </Link>
            <Link
              href="/operations/malpractice"
              className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)]"
            >
              <ShieldAlert className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Malpractice Queue</span>
            </Link>
          </div>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <MetricStripSkeleton count={4} />
          <SectionSkeleton rows={4} />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadOverview} />
      ) : (
        <div className="space-y-6">
          {/* Primary KPI Strip */}
          <section
            aria-label="Operations metrics"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Total Interviews
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {metrics?.totalInterviews ?? 0}
              </p>
              <Link
                href="/operations/interviews"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                <span>Inspect interviews</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Pending Evaluations
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {metrics?.pendingEvaluations ?? 0}
              </p>
              <p className="mt-2 text-xs text-[var(--text-muted)]">
                Booked, in-progress, or awaiting outcome
              </p>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Pending Certifications
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {metrics?.pendingCertifications ?? 0}
              </p>
              <Link
                href="/operations/certifications"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                <span>Approval queue ({metrics?.evaluated ?? 0} evaluated)</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Active Malpractice Cases
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {activeMalpractice.length}
              </p>
              <Link
                href="/operations/malpractice"
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                <span>{malpracticeQueue.length} total cases</span>
                <ArrowRight className="h-3 w-3" aria-hidden="true" />
              </Link>
            </div>
          </section>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Pipeline Distribution */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Interview Lifecycle Distribution
                </h2>
                <Link
                  href="/operations/interviews"
                  className="text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  All Interviews
                </Link>
              </div>

              {interviews.length === 0 ? (
                <EmptyState
                  title="No interview records"
                  description="Booked interviews across students will appear here."
                />
              ) : (
                <div className="space-y-3.5">
                  {[
                    {
                      label: "Scheduled / Booked",
                      count: statusBreakdown.booked,
                      color: "bg-[var(--status-info)]",
                    },
                    {
                      label: "In Progress / Awaiting Outcome",
                      count: statusBreakdown.awaitingEval,
                      color: "bg-[var(--status-warning)]",
                    },
                    {
                      label: "Evaluated",
                      count: statusBreakdown.evaluated,
                      color: "bg-[var(--status-success)]",
                    },
                    {
                      label: "Cancelled / No Show",
                      count: statusBreakdown.closedOther,
                      color: "bg-[var(--text-muted)]",
                    },
                  ].map((item) => {
                    const pct =
                      interviews.length > 0
                        ? Math.round((item.count / interviews.length) * 100)
                        : 0;
                    return (
                      <div key={item.label}>
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-medium text-[var(--text-primary)]">
                            {item.label}
                          </span>
                          <span className="tabular-nums text-[var(--text-secondary)]">
                            {item.count} ({pct}%)
                          </span>
                        </div>
                        <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-[var(--bg-elevated)]">
                          <div
                            className={`h-full rounded-full ${item.color}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Operational Queues & Coverage */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
                Operational Readiness
              </h2>
              <div className="divide-y divide-[var(--border-hairline)]">
                <div className="flex items-center justify-between gap-4 py-3 first:pt-0">
                  <div className="flex items-center gap-3">
                    <Users
                      className="h-4 w-4 text-[var(--accent-primary)]"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        Registered Students
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Active student roster visible under staff scope
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold tabular-nums text-[var(--text-primary)]">
                      {students.length}
                    </span>
                    <Link
                      href="/operations/students"
                      className="text-xs font-medium text-[var(--accent-text)] hover:underline"
                    >
                      Roster
                    </Link>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 py-3">
                  <div className="flex items-center gap-3">
                    <CalendarClock
                      className="h-4 w-4 text-[var(--accent-primary)]"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        Active Availability Windows
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Published interviewer recurring schedule blocks
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-base font-semibold tabular-nums text-[var(--text-primary)]">
                      {activeWindowsCount}
                    </span>
                    <Link
                      href="/operations/availability"
                      className="text-xs font-medium text-[var(--accent-text)] hover:underline"
                    >
                      View
                    </Link>
                  </div>
                </div>

                <div className="flex items-center justify-between gap-4 py-3 last:pb-0">
                  <div className="flex items-center gap-3">
                    <ShieldCheck
                      className="h-4 w-4 text-[var(--accent-primary)]"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-sm font-medium text-[var(--text-primary)]">
                        Pending Interviewer Invitations
                      </p>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Invitation-only onboarding queue ({metrics?.pendingInvitations ?? 0} pending)
                      </p>
                    </div>
                  </div>
                  <Link
                    href="/operations/invitations"
                    className="text-xs font-medium text-[var(--accent-text)] hover:underline"
                  >
                    Manage Invites
                  </Link>
                </div>
              </div>
            </section>
          </div>

          {/* Recent Malpractice Cases */}
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Recent Malpractice Queue
              </h2>
              <Link
                href="/operations/malpractice"
                className="text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                Manage All Cases
              </Link>
            </div>

            {malpracticeQueue.length === 0 ? (
              <EmptyState
                title="No malpractice cases on file"
                description="All submitted integrity investigations and appeals will appear here."
              />
            ) : (
              <div className="divide-y divide-[var(--border-hairline)]">
                {malpracticeQueue.slice(0, 5).map((row) => {
                  const meta = getMalpracticeStatusMeta(row.status);
                  return (
                    <div
                      key={row.id}
                      className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {row.reason_code}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-[var(--text-secondary)]">
                          Student{" "}
                          <span className="font-mono">
                            {row.student_id.slice(0, 8)}…
                          </span>{" "}
                          · Filed {formatTimestamp(row.created_at)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <StatusText label={meta.label} tone={meta.tone} />
                        <Link
                          href={`/operations/malpractice/${row.id}`}
                          className="text-xs font-medium text-[var(--accent-text)] hover:underline"
                        >
                          Review
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
