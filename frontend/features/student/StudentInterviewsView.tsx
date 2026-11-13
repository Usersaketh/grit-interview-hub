"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
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
  isInterviewUpcoming,
  normalizeInterviewResult,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
} from "@frontend/services/dataCache";
import { fetchStudentInterviews } from "@frontend/services/hubApi";
import type { InterviewRecord } from "@frontend/types/api";

type FilterTab = "all" | "upcoming" | "past";

export function StudentInterviewsView() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const isStudent = Boolean(
    profile && hasAllowedRole(profile.roles, ["STUDENT"])
  );

  const [interviews, setInterviews] = useState<InterviewRecord[]>(() =>
    userId
      ? (getCachedData<InterviewRecord[]>(userId, "student:interviews")?.data ??
          [])
      : []
  );
  const [loading, setLoading] = useState<boolean>(() =>
    userId
      ? !getCachedData<InterviewRecord[]>(userId, "student:interviews")
      : true
  );
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<FilterTab>("all");

  const loadInterviews = useCallback(
    async (force = false) => {
      if (!userId || !isStudent) return;

      const cached = getCachedData<InterviewRecord[]>(
        userId,
        "student:interviews"
      );
      if (cached && !force) {
        setInterviews(cached.data);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const data = await fetchWithUserCache(
          userId,
          "student:interviews",
          fetchStudentInterviews,
          { force }
        );
        setInterviews(data);
      } catch (err) {
        if (!cached) {
          setError(formatApiErrorMessage(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [isStudent, userId]
  );

  useEffect(() => {
    void loadInterviews(false);
  }, [loadInterviews]);

  const filtered = useMemo(() => {
    if (tab === "upcoming") {
      return interviews.filter((i) => isInterviewUpcoming(i));
    }
    if (tab === "past") {
      return interviews.filter((i) => !isInterviewUpcoming(i));
    }
    return interviews;
  }, [interviews, tab]);

  return (
    <AppShell allowedRoles={["STUDENT"]} sectionLabel="Student Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Student Portal", href: "/student" },
          { label: "My Interviews" },
        ]}
        title="My Interviews"
        description="Track upcoming appointments, past attempts, attendance statuses, and published evaluation outcomes."
        actions={
          <Link
            href="/student/interviews/book"
            className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)]"
          >
            <span>Book Interview</span>
          </Link>
        }
      />

      <div className="mb-5 flex w-fit items-center gap-1 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-1">
        {(
          [
            { id: "all", label: `All (${interviews.length})` },
            {
              id: "upcoming",
              label: `Upcoming (${interviews.filter((i) => isInterviewUpcoming(i)).length})`,
            },
            {
              id: "past",
              label: `Past (${interviews.filter((i) => !isInterviewUpcoming(i)).length})`,
            },
          ] as const
        ).map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={`whitespace-nowrap rounded px-3 py-1.5 text-xs font-medium tabular-nums transition-colors ${
              tab === item.id
                ? "bg-[var(--bg-surface)] text-[var(--text-primary)] shadow-xs"
                : "text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
            }`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {loading ? (
        <SectionSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner
          message={error}
          onRetry={() => void loadInterviews(true)}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No interviews in this view"
          description={
            tab === "upcoming"
              ? "You do not have any upcoming interview appointments."
              : "No interview attempts have been recorded yet."
          }
          action={
            <Link
              href="/student/interviews/book"
              className="inline-flex items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-primary-hover)]"
            >
              Book Interview
            </Link>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)]">
                  <th className="px-4 py-3">Badge</th>
                  <th className="px-4 py-3">Reference</th>
                  <th className="px-4 py-3">Scheduled Time</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filtered.map((interview) => {
                  const statusMeta = getBookingStatusMeta(interview.status);
                  const result = normalizeInterviewResult(
                    interview.interview_results
                  );
                  const outcomeMeta = result
                    ? getOutcomeMeta(result.outcome)
                    : null;

                  return (
                    <tr
                      key={interview.id}
                      className="transition-colors hover:bg-[var(--bg-elevated)]/60"
                    >
                      <td className="px-4 py-3.5">
                        <p className="font-medium text-[var(--text-primary)]">
                          {interview.badges?.name ?? "Badge Interview"}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {interview.badges?.level ?? ""} · Attempt #
                          <span className="tabular-nums">
                            {interview.attempt_number}
                          </span>
                        </p>
                      </td>
                      <td className="px-4 py-3.5 font-mono text-xs text-[var(--text-secondary)]">
                        {interview.booking_reference}
                      </td>
                      <td className="px-4 py-3.5 tabular-nums text-[var(--text-primary)]">
                        <p>
                          {formatTimestamp(
                            interview.starts_at,
                            interview.timezone
                          )}
                        </p>
                        <p className="text-xs text-[var(--text-secondary)]">
                          {interview.timezone}
                        </p>
                      </td>
                      <td className="px-4 py-3.5">
                        <StatusText
                          label={statusMeta.label}
                          tone={statusMeta.tone}
                        />
                      </td>
                      <td className="px-4 py-3.5">
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
                      <td className="px-4 py-3.5 text-right">
                        <Link
                          href={`/student/interviews/${interview.id}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                        >
                          <span>View</span>
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
