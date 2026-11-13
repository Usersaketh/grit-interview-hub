"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Search } from "lucide-react";
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
  DAY_OF_WEEK_LABELS,
  formatTimestamp,
  getBookingStatusMeta,
  getOutcomeMeta,
  hasAllowedRole,
  isInterviewUpcoming,
  normalizeInterviewResult,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
} from "@frontend/services/dataCache";
import {
  fetchOwnInterviewerRow,
  fetchScopedInterviews,
} from "@frontend/services/hubApi";
import type { InterviewRecord } from "@frontend/types/api";

type ScheduleFilter = "UPCOMING" | "NEEDS_EVAL" | "ALL" | "EVALUATED";

const CACHE_KEY = "interviewer:interviews";

export function InterviewerScheduleView() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const isInterviewer = Boolean(
    profile && hasAllowedRole(profile.roles, ["INTERVIEWER"])
  );

  const [interviews, setInterviews] = useState<InterviewRecord[]>(() =>
    userId ? (getCachedData<InterviewRecord[]>(userId, CACHE_KEY)?.data ?? []) : []
  );
  const [loading, setLoading] = useState<boolean>(() =>
    userId ? !getCachedData<InterviewRecord[]>(userId, CACHE_KEY) : true
  );
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<ScheduleFilter>("ALL");
  const [dayFilter, setDayFilter] = useState<string>("ALL");
  const [searchQuery, setSearchQuery] = useState("");

  const loadSchedule = useCallback(
    async (force = false) => {
      if (!userId || !isInterviewer) return;

      const cached = getCachedData<InterviewRecord[]>(userId, CACHE_KEY);
      if (cached && !force) {
        setInterviews(cached.data);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const scoped = await fetchWithUserCache<InterviewRecord[]>(
          userId,
          CACHE_KEY,
          async () => {
            const [ownInterviewer, allInterviews] = await Promise.all([
              fetchOwnInterviewerRow(userId).catch(() => null),
              fetchScopedInterviews(),
            ]);
            return ownInterviewer
              ? allInterviews.filter((i) => i.interviewer_id === ownInterviewer.id)
              : allInterviews;
          },
          { force }
        );
        setInterviews(scoped);
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
    void loadSchedule(false);
  }, [loadSchedule]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return interviews
      .filter((item) => {
        if (filter === "UPCOMING" && !isInterviewUpcoming(item)) return false;
        if (
          filter === "NEEDS_EVAL" &&
          !(
            (item.status === "IN_PROGRESS" ||
              item.status === "AWAITING_OUTCOME") &&
            normalizeInterviewResult(item.interview_results) === null
          )
        ) {
          return false;
        }
        if (
          filter === "EVALUATED" &&
          normalizeInterviewResult(item.interview_results) === null
        ) {
          return false;
        }

        if (dayFilter !== "ALL") {
          const day = new Date(item.starts_at).getDay();
          if (String(day) !== dayFilter) return false;
        }

        if (!q) return true;
        return (
          item.booking_reference.toLowerCase().includes(q) ||
          (item.badges?.name ?? "").toLowerCase().includes(q) ||
          item.student_id.toLowerCase().includes(q)
        );
      })
      .sort(
        (a, b) =>
          new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
      );
  }, [interviews, filter, dayFilter, searchQuery]);

  return (
    <AppShell allowedRoles={["INTERVIEWER"]} sectionLabel="Interviewer Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Interviewer Portal", href: "/interviewer" },
          { label: "Schedule" },
        ]}
        title="Interview Schedule"
        description="Inspect assigned live interviews by day, readiness status, and booking reference."
        actions={
          <Link
            href="/interviewer/availability"
            className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
          >
            Manage Availability
          </Link>
        }
      />

      {/* Filter Toolbar */}
      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "ALL", label: "All Assigned" },
              { id: "UPCOMING", label: "Upcoming" },
              { id: "NEEDS_EVAL", label: "Awaiting Evaluation" },
              { id: "EVALUATED", label: "Evaluated" },
            ] as const
          ).map((tab) => {
            const active = filter === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilter(tab.id)}
                className={`min-h-9 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  active
                    ? "bg-[var(--accent-primary)] text-white"
                    : "border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label className="sr-only" htmlFor="schedule-weekday-filter">
            Filter by day of week
          </label>
          <select
            id="schedule-weekday-filter"
            value={dayFilter}
            onChange={(e) => setDayFilter(e.target.value)}
            className="min-h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
          >
            <option value="ALL">All Weekdays</option>
            {DAY_OF_WEEK_LABELS.map((label, index) => (
              <option key={label} value={String(index)}>
                {label}
              </option>
            ))}
          </select>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
              aria-hidden="true"
            />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search badge or reference..."
              aria-label="Search scheduled interviews"
              className="min-h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none sm:w-56"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <SectionSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadSchedule(true)} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No matching interviews"
          description="No assigned interviews matched the selected status, weekday, or search query."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)]">
                  <th className="px-4 py-3">Badge &amp; Reference</th>
                  <th className="px-4 py-3">Scheduled Window</th>
                  <th className="px-4 py-3">Student ID</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filtered.map((item) => {
                  const statusMeta = getBookingStatusMeta(item.status);
                  const res = normalizeInterviewResult(item.interview_results);
                  const outcomeMeta = res ? getOutcomeMeta(res.outcome) : null;
                  const readyForEval =
                    (item.status === "IN_PROGRESS" ||
                      item.status === "AWAITING_OUTCOME") &&
                    !res;

                  return (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-[var(--bg-elevated)]"
                    >
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-medium text-[var(--text-primary)]">
                          {item.badges?.name ?? "Badge Interview"}
                        </p>
                        <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                          {item.booking_reference} · Attempt #{item.attempt_number}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top tabular-nums">
                        <p className="text-[var(--text-primary)]">
                          {formatTimestamp(item.starts_at, item.timezone)}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                          Ends {formatTimestamp(item.ends_at, item.timezone)} (
                          {item.timezone})
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top font-mono text-xs text-[var(--text-secondary)]">
                        {item.student_id.slice(0, 8)}…
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
                      <td className="px-4 py-3.5 text-right align-top">
                        <Link
                          href={`/interviewer/interviews/${item.id}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                        >
                          <span>
                            {readyForEval
                              ? "Evaluate"
                              : item.status === "BOOKED"
                                ? "Start / Manage"
                                : "Inspect"}
                          </span>
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
    </AppShell>
  );
}
