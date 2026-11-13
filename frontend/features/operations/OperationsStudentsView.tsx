"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Search } from "lucide-react";
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
  hasAllowedRole,
  isInterviewUpcoming,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
} from "@frontend/services/dataCache";
import {
  fetchScopedInterviews,
  fetchStaffStudentsRoster,
} from "@frontend/services/hubApi";
import type { InterviewRecord, StudentRosterItem } from "@frontend/types/api";

type BookingFilter = "ALL" | "ACTIVE_BOOKING" | "EVALUATED" | "UNBOOKED";

interface OpsStudentsCache {
  students: StudentRosterItem[];
  interviews: InterviewRecord[];
}

const CACHE_KEY = "ops:students";

export function OperationsStudentsView() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const isStaff = Boolean(
    profile && hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])
  );

  const initialCached = userId
    ? getCachedData<OpsStudentsCache>(userId, CACHE_KEY)?.data ?? null
    : null;

  const [students, setStudents] = useState<StudentRosterItem[]>(
    () => initialCached?.students ?? []
  );
  const [interviews, setInterviews] = useState<InterviewRecord[]>(
    () => initialCached?.interviews ?? []
  );
  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<BookingFilter>("ALL");
  const [query, setQuery] = useState("");

  const loadRoster = useCallback(
    async (force = false) => {
      if (!userId || !isStaff) return;

      const cached = getCachedData<OpsStudentsCache>(userId, CACHE_KEY);
      if (cached && !force) {
        setStudents(cached.data.students);
        setInterviews(cached.data.interviews);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const result = await fetchWithUserCache<OpsStudentsCache>(
          userId,
          CACHE_KEY,
          async () => {
            const [rosterData, interviewsData] = await Promise.all([
              fetchStaffStudentsRoster(),
              fetchScopedInterviews(),
            ]);
            return { students: rosterData, interviews: interviewsData };
          },
          { force }
        );
        setStudents(result.students);
        setInterviews(result.interviews);
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
    void loadRoster(false);
  }, [loadRoster]);

  const interviewsByStudent = useMemo(() => {
    const map = new Map<string, InterviewRecord[]>();
    for (const item of interviews) {
      const arr = map.get(item.student_id) ?? [];
      arr.push(item);
      map.set(item.student_id, arr);
    }
    return map;
  }, [interviews]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return students.filter((student) => {
      const studentInterviews = interviewsByStudent.get(student.id) ?? [];
      const hasActiveBooking = studentInterviews.some((i) =>
        isInterviewUpcoming(i)
      );
      const hasEvaluated = studentInterviews.some(
        (i) => i.status === "EVALUATED"
      );

      if (filter === "ACTIVE_BOOKING" && !hasActiveBooking) return false;
      if (filter === "EVALUATED" && !hasEvaluated) return false;
      if (filter === "UNBOOKED" && studentInterviews.length > 0) return false;

      if (!q) return true;
      return (
        (student.profile?.full_name ?? "").toLowerCase().includes(q) ||
        (student.profile?.email ?? "").toLowerCase().includes(q) ||
        student.external_student_id.toLowerCase().includes(q) ||
        (student.campus_ref ?? "").toLowerCase().includes(q) ||
        student.id.toLowerCase().includes(q)
      );
    });
  }, [students, interviewsByStudent, filter, query]);

  return (
    <AppShell
      allowedRoles={["OPERATIONS", "ADMIN"]}
      sectionLabel="Operations Portal"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Operations Portal", href: "/operations" },
          { label: "Students" },
        ]}
        title="Student Roster"
        description="Review registered students, external campus identifiers, account status, and interview booking progress."
      />

      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              { id: "ALL", label: "All Students" },
              { id: "ACTIVE_BOOKING", label: "Active Booking" },
              { id: "EVALUATED", label: "Has Evaluated" },
              { id: "UNBOOKED", label: "Unbooked" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setFilter(tab.id)}
              className={`min-h-9 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                filter === tab.id
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
            placeholder="Search name, email, campus, ID..."
            aria-label="Search student roster"
            className="min-h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none sm:w-64"
          />
        </div>
      </div>

      {loading ? (
        <SectionSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadRoster(true)} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No students match your filters"
          description="Try clearing the search query or changing the booking status filter."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)]">
                  <th className="px-4 py-3">Student</th>
                  <th className="px-4 py-3">External ID &amp; Campus</th>
                  <th className="px-4 py-3">Account</th>
                  <th className="px-4 py-3">Interviews</th>
                  <th className="px-4 py-3">Latest Interview</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filtered.map((student) => {
                  const list = interviewsByStudent.get(student.id) ?? [];
                  const latest = list[0] ?? null;
                  const latestMeta = latest
                    ? getBookingStatusMeta(latest.status)
                    : null;
                  const isActive = student.profile?.is_active ?? true;

                  return (
                    <tr
                      key={student.id}
                      className="transition-colors hover:bg-[var(--bg-elevated)]"
                    >
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-medium text-[var(--text-primary)]">
                          {student.profile?.full_name ?? "Student Profile"}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                          {student.profile?.email ?? student.user_id}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-mono text-xs font-medium text-[var(--text-primary)]">
                          {student.external_student_id}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                          {student.campus_ref ?? "No campus assigned"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <StatusText
                          label={isActive ? "Active" : "Inactive"}
                          tone={isActive ? "success" : "neutral"}
                        />
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs tabular-nums text-[var(--text-primary)]">
                        {list.length} attempt{list.length === 1 ? "" : "s"}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        {latest && latestMeta ? (
                          <div>
                            <StatusText
                              label={latestMeta.label}
                              tone={latestMeta.tone}
                            />
                            <p className="mt-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
                              {formatTimestamp(latest.starts_at)}
                            </p>
                          </div>
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">
                            No bookings yet
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 text-right align-top">
                        <Link
                          href={`/operations/interviews?studentId=${encodeURIComponent(student.id)}`}
                          className="whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                        >
                          View Interviews
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
