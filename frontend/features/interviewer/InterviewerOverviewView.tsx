"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Calendar,
  CalendarClock,
  ClipboardCheck,
  History,
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
  formatDayOfWeek,
  formatTimeShort,
  formatTimestamp,
  getBookingStatusMeta,
  getOutcomeMeta,
  hasAllowedRole,
  isInterviewUpcoming,
  isSameLocalCalendarDate,
  normalizeInterviewResult,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
} from "@frontend/services/dataCache";
import {
  fetchInterviewerAvailability,
  fetchOwnInterviewerRow,
  fetchScopedInterviews,
} from "@frontend/services/hubApi";
import type {
  InterviewRecord,
  InterviewerAvailabilityRecord,
} from "@frontend/types/api";

interface InterviewerOverviewCache {
  interviews: InterviewRecord[];
  availability: InterviewerAvailabilityRecord[];
  defaultTimezone: string | null;
}

const CACHE_KEY = "interviewer:overview";

export function InterviewerOverviewView() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const isInterviewer = Boolean(
    profile && hasAllowedRole(profile.roles, ["INTERVIEWER"])
  );

  const [data, setData] = useState<InterviewerOverviewCache | null>(() =>
    userId ? (getCachedData<InterviewerOverviewCache>(userId, CACHE_KEY)?.data ?? null) : null
  );
  const [loading, setLoading] = useState<boolean>(() =>
    userId ? !getCachedData<InterviewerOverviewCache>(userId, CACHE_KEY) : true
  );
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(
    async (force = false) => {
      if (!userId || !isInterviewer) return;

      const cached = getCachedData<InterviewerOverviewCache>(userId, CACHE_KEY);
      if (cached && !force) {
        setData(cached.data);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const result = await fetchWithUserCache<InterviewerOverviewCache>(
          userId,
          CACHE_KEY,
          async () => {
            const [ownInterviewer, allInterviews, availRows] = await Promise.all([
              fetchOwnInterviewerRow(userId).catch(() => null),
              fetchScopedInterviews(),
              fetchInterviewerAvailability(),
            ]);
            const scoped = ownInterviewer
              ? allInterviews.filter((i) => i.interviewer_id === ownInterviewer.id)
              : allInterviews;
            return {
              interviews: scoped,
              availability: availRows,
              defaultTimezone: ownInterviewer?.default_timezone ?? null,
            };
          },
          { force }
        );
        setData(result);
      } catch (err) {
        if (!cached) {
          setError(formatApiErrorMessage(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [isInterviewer, userId]
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const interviews = useMemo(() => data?.interviews ?? [], [data]);
  const availability = useMemo(() => data?.availability ?? [], [data]);
  const defaultTimezone = data?.defaultTimezone ?? null;

  const todaysInterviews = useMemo(
    () =>
      interviews.filter(
        (item) =>
          isSameLocalCalendarDate(item.starts_at) &&
          item.status !== "CANCELLED" &&
          item.status !== "INTERVIEWER_CANCELLED"
      ),
    [interviews]
  );

  const upcomingInterviews = useMemo(
    () =>
      interviews
        .filter((item) => isInterviewUpcoming(item))
        .sort(
          (a, b) =>
            new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
        ),
    [interviews]
  );

  const pendingEvaluations = useMemo(
    () =>
      interviews.filter(
        (item) =>
          (item.status === "IN_PROGRESS" || item.status === "AWAITING_OUTCOME") &&
          normalizeInterviewResult(item.interview_results) === null
      ),
    [interviews]
  );

  const evaluatedInterviews = useMemo(
    () =>
      interviews.filter(
        (item) => normalizeInterviewResult(item.interview_results) !== null
      ),
    [interviews]
  );

  const activeAvailability = useMemo(
    () => availability.filter((w) => w.is_active),
    [availability]
  );

  return (
    <AppShell allowedRoles={["INTERVIEWER"]} sectionLabel="Interviewer Portal">
      <PageHeader
        breadcrumbs={[{ label: "Interviewer Portal" }]}
        title={`Interviewer Workspace${profile ? ` · ${profile.full_name}` : ""}`}
        description={
          defaultTimezone
            ? `Manage recurring availability (${defaultTimezone}), conduct assigned badge interviews, and submit immutable evaluations.`
            : "Manage recurring availability windows, review your interview schedule, and submit badge evaluations."
        }
        actions={
          <Link
            href="/interviewer/availability"
            className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
          >
            <CalendarClock className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>Manage Availability</span>
          </Link>
        }
      />

      {loading ? (
        <div className="space-y-6">
          <MetricStripSkeleton count={4} />
          <SectionSkeleton rows={4} />
        </div>
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadData(true)} />
      ) : (
        <div className="space-y-6">
          {/* Metrics strip */}
          <section
            aria-label="Interviewer summary metrics"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Today&apos;s Interviews
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {todaysInterviews.length}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Scheduled for today&apos;s date
              </p>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Upcoming Assigned
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {upcomingInterviews.length}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Active upcoming sessions
              </p>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Pending Evaluation
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {pendingEvaluations.length}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Ready for outcome submission
              </p>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Evaluated Completed
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {evaluatedInterviews.length}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {activeAvailability.length} active weekly windows
              </p>
            </div>
          </section>

          {/* Pending Evaluations Spotlight */}
          {pendingEvaluations.length > 0 ? (
            <section className="rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <ClipboardCheck
                    className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-warning)]"
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      {pendingEvaluations.length} interview
                      {pendingEvaluations.length === 1 ? "" : "s"} awaiting
                      evaluation
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                      Submit the formal PASS, FAIL, or RETAKE_LATER decision to
                      advance the student&apos;s certification pipeline.
                    </p>
                  </div>
                </div>
                <Link
                  href={`/interviewer/interviews/${pendingEvaluations[0].id}`}
                  className="inline-flex min-h-9 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                >
                  <span>Evaluate Next</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Upcoming Schedule */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar
                    className="h-4 w-4 text-[var(--accent-primary)]"
                    aria-hidden="true"
                  />
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Upcoming Schedule
                  </h2>
                </div>
                <Link
                  href="/interviewer/schedule"
                  className="whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  Full Schedule
                </Link>
              </div>

              {upcomingInterviews.length === 0 ? (
                <EmptyState
                  title="No upcoming interviews"
                  description="You currently have no active upcoming interview bookings assigned."
                  action={
                    <Link
                      href="/interviewer/availability"
                      className="inline-flex items-center whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      Configure Availability
                    </Link>
                  }
                />
              ) : (
                <div className="divide-y divide-[var(--border-hairline)]">
                  {upcomingInterviews.slice(0, 5).map((item) => {
                    const meta = getBookingStatusMeta(item.status);
                    return (
                      <div
                        key={item.id}
                        className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {item.badges?.name ?? "Badge Interview"}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
                            {formatTimestamp(item.starts_at, item.timezone)} ·{" "}
                            <span className="font-mono">
                              {item.booking_reference}
                            </span>
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-3">
                          <StatusText label={meta.label} tone={meta.tone} />
                          <Link
                            href={`/interviewer/interviews/${item.id}`}
                            className="whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                          >
                            Open
                          </Link>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Weekly Availability Summary */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CalendarClock
                    className="h-4 w-4 text-[var(--accent-primary)]"
                    aria-hidden="true"
                  />
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Weekly Availability Windows
                  </h2>
                </div>
                <Link
                  href="/interviewer/availability"
                  className="whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  Edit Windows
                </Link>
              </div>

              {activeAvailability.length === 0 ? (
                <EmptyState
                  title="No active availability windows"
                  description="Publish your recurring weekly hours so students can book interview slots."
                  action={
                    <Link
                      href="/interviewer/availability"
                      className="inline-flex items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                    >
                      Add Availability
                    </Link>
                  }
                />
              ) : (
                <div className="divide-y divide-[var(--border-hairline)]">
                  {activeAvailability.slice(0, 6).map((windowItem) => (
                    <div
                      key={windowItem.id}
                      className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {formatDayOfWeek(windowItem.day_of_week)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                          {windowItem.timezone} · From{" "}
                          <span className="tabular-nums">
                            {windowItem.effective_from}
                          </span>
                        </p>
                      </div>
                      <span className="font-mono text-xs font-medium tabular-nums text-[var(--text-primary)]">
                        {formatTimeShort(windowItem.start_time)} –{" "}
                        {formatTimeShort(windowItem.end_time)}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>

          {/* Recent Evaluated Outcomes */}
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <div className="mb-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <History
                  className="h-4 w-4 text-[var(--accent-primary)]"
                  aria-hidden="true"
                />
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Recent Submitted Evaluations
                </h2>
              </div>
              <Link
                href="/interviewer/history"
                className="whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
              >
                All History
              </Link>
            </div>

            {evaluatedInterviews.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                No completed evaluations recorded yet.
              </p>
            ) : (
              <div className="divide-y divide-[var(--border-hairline)]">
                {evaluatedInterviews.slice(0, 4).map((item) => {
                  const res = normalizeInterviewResult(item.interview_results);
                  const outcomeMeta = res ? getOutcomeMeta(res.outcome) : null;
                  return (
                    <div
                      key={item.id}
                      className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          {item.badges?.name ?? "Badge Interview"}
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
                          Submitted{" "}
                          {res ? formatTimestamp(res.submitted_at) : "Recorded"} ·{" "}
                          <span className="font-mono">
                            {item.booking_reference}
                          </span>
                        </p>
                      </div>
                      <div className="flex items-center gap-3">
                        {outcomeMeta ? (
                          <StatusText
                            label={outcomeMeta.label}
                            tone={outcomeMeta.tone}
                          />
                        ) : null}
                        <Link
                          href={`/interviewer/interviews/${item.id}`}
                          className="whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                        >
                          View
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
