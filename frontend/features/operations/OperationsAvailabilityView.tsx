"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "@frontend/components/AppShell";
import { PageHeader } from "@frontend/components/PageHeader";
import { StatusText } from "@frontend/components/StatusText";
import {
  CapabilityNotice,
  EmptyState,
  ErrorBanner,
  SectionSkeleton,
} from "@frontend/components/SurfaceStates";
import { useAuth } from "@frontend/hooks/useAuth";
import {
  DAY_OF_WEEK_LABELS,
  formatDayOfWeek,
  formatTimeShort,
  hasAllowedRole,
  isInterviewUpcoming,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
} from "@frontend/services/dataCache";
import {
  fetchInterviewerAvailability,
  fetchScopedInterviews,
  fetchStaffInterviewersRoster,
} from "@frontend/services/hubApi";
import type {
  InterviewRecord,
  InterviewerAvailabilityRecord,
  InterviewerRosterItem,
} from "@frontend/types/api";

interface OpsAvailabilityCache {
  windows: InterviewerAvailabilityRecord[];
  interviewers: InterviewerRosterItem[];
  interviews: InterviewRecord[];
}

const CACHE_KEY = "ops:availability";

export function OperationsAvailabilityView() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const isStaff = Boolean(
    profile && hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])
  );

  const initialCached = userId
    ? getCachedData<OpsAvailabilityCache>(userId, CACHE_KEY)?.data ?? null
    : null;

  const [windows, setWindows] = useState<InterviewerAvailabilityRecord[]>(
    () => initialCached?.windows ?? []
  );
  const [interviewers, setInterviewers] = useState<InterviewerRosterItem[]>(
    () => initialCached?.interviewers ?? []
  );
  const [interviews, setInterviews] = useState<InterviewRecord[]>(
    () => initialCached?.interviews ?? []
  );
  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState<string | null>(null);

  const [interviewerFilter, setInterviewerFilter] = useState("ALL");
  const [dayFilter, setDayFilter] = useState("ALL");
  const [activeFilter, setActiveFilter] = useState<"ALL" | "ACTIVE" | "INACTIVE">(
    "ALL"
  );

  const loadData = useCallback(
    async (force = false) => {
      if (!userId || !isStaff) return;

      const cached = getCachedData<OpsAvailabilityCache>(userId, CACHE_KEY);
      if (cached && !force) {
        setWindows(cached.data.windows);
        setInterviewers(cached.data.interviewers);
        setInterviews(cached.data.interviews);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const result = await fetchWithUserCache<OpsAvailabilityCache>(
          userId,
          CACHE_KEY,
          async () => {
            const [availData, rosterData, interviewsData] = await Promise.all([
              fetchInterviewerAvailability(),
              fetchStaffInterviewersRoster().catch(
                () => [] as InterviewerRosterItem[]
              ),
              fetchScopedInterviews().catch(() => [] as InterviewRecord[]),
            ]);
            return {
              windows: availData,
              interviewers: rosterData,
              interviews: interviewsData,
            };
          },
          { force }
        );
        setWindows(result.windows);
        setInterviewers(result.interviewers);
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
    void loadData(false);
  }, [loadData]);

  const interviewerMap = useMemo(
    () => new Map(interviewers.map((i) => [i.id, i])),
    [interviewers]
  );

  const upcomingCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of interviews) {
      if (!isInterviewUpcoming(item)) continue;
      const day = new Date(item.starts_at).getDay();
      const key = `${item.interviewer_id}:${day}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return map;
  }, [interviews]);

  const filtered = useMemo(() => {
    return windows
      .filter((win) => {
        if (
          interviewerFilter !== "ALL" &&
          win.interviewer_id !== interviewerFilter
        ) {
          return false;
        }
        if (dayFilter !== "ALL" && String(win.day_of_week) !== dayFilter) {
          return false;
        }
        if (activeFilter === "ACTIVE" && !win.is_active) return false;
        if (activeFilter === "INACTIVE" && win.is_active) return false;
        return true;
      })
      .sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
        return a.start_time.localeCompare(b.start_time);
      });
  }, [windows, interviewerFilter, dayFilter, activeFilter]);

  return (
    <AppShell
      allowedRoles={["OPERATIONS", "ADMIN"]}
      sectionLabel="Operations Portal"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Operations Portal", href: "/operations" },
          { label: "Availability" },
        ]}
        title="Interviewer Availability"
        description="Inspect recurring weekly interview availability across active interviewers and monitor weekday booking demand."
      />

      <div className="mb-5 space-y-4">
        <CapabilityNotice
          title="Staff Availability Scope"
          description="GET /api/v1/interviewer/availability returns all availability windows for Operations/Admin accounts without a personal interviewer profile. Creating or modifying windows requires an INTERVIEWER role on the interviewer portal."
        />

        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
          <div>
            <label className="sr-only" htmlFor="ops-avail-interviewer">
              Filter by interviewer
            </label>
            <select
              id="ops-avail-interviewer"
              value={interviewerFilter}
              onChange={(e) => setInterviewerFilter(e.target.value)}
              className="min-h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              <option value="ALL">All Interviewers</option>
              {interviewers.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.profile?.full_name ?? item.id}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="sr-only" htmlFor="ops-avail-day">
              Filter by day of week
            </label>
            <select
              id="ops-avail-day"
              value={dayFilter}
              onChange={(e) => setDayFilter(e.target.value)}
              className="min-h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              <option value="ALL">All Weekdays</option>
              {DAY_OF_WEEK_LABELS.map((label, idx) => (
                <option key={label} value={String(idx)}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="sr-only" htmlFor="ops-avail-status">
              Filter by active status
            </label>
            <select
              id="ops-avail-status"
              value={activeFilter}
              onChange={(e) =>
                setActiveFilter(
                  e.target.value as "ALL" | "ACTIVE" | "INACTIVE"
                )
              }
              className="min-h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              <option value="ALL">All Window States</option>
              <option value="ACTIVE">Active Only</option>
              <option value="INACTIVE">Inactive Only</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <SectionSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadData(true)} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No availability windows found"
          description="No interviewer availability windows matched your selected filters."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)]">
                  <th className="px-4 py-3">Interviewer</th>
                  <th className="px-4 py-3">Weekday &amp; Window</th>
                  <th className="px-4 py-3">Timezone</th>
                  <th className="px-4 py-3">Effective Dates</th>
                  <th className="px-4 py-3">Upcoming Bookings</th>
                  <th className="px-4 py-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {filtered.map((win) => {
                  const interviewer = interviewerMap.get(win.interviewer_id);
                  const weekdayBookings =
                    upcomingCountMap.get(
                      `${win.interviewer_id}:${win.day_of_week}`
                    ) ?? 0;

                  return (
                    <tr
                      key={win.id}
                      className="transition-colors hover:bg-[var(--bg-elevated)]"
                    >
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-medium text-[var(--text-primary)]">
                          {interviewer?.profile?.full_name ?? "Interviewer"}
                        </p>
                        <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                          {win.interviewer_id.slice(0, 8)}…
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="font-medium text-[var(--text-primary)]">
                          {formatDayOfWeek(win.day_of_week)}
                        </p>
                        <p className="mt-0.5 font-mono text-xs tabular-nums text-[var(--text-secondary)]">
                          {formatTimeShort(win.start_time)} –{" "}
                          {formatTimeShort(win.end_time)}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs text-[var(--text-secondary)]">
                        {win.timezone}
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs tabular-nums text-[var(--text-secondary)]">
                        {win.effective_from}
                        {win.effective_until
                          ? ` → ${win.effective_until}`
                          : " onward"}
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs tabular-nums text-[var(--text-primary)]">
                        {weekdayBookings} upcoming
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <StatusText
                          label={win.is_active ? "Active" : "Inactive"}
                          tone={win.is_active ? "success" : "neutral"}
                        />
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
