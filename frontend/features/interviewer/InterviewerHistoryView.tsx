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
  fetchOwnInterviewerRow,
  fetchScopedInterviews,
} from "@frontend/services/hubApi";
import type { EvaluationOutcome, InterviewRecord } from "@frontend/types/api";

const CACHE_KEY = "interviewer:interviews";

export function InterviewerHistoryView() {
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
  const [outcomeFilter, setOutcomeFilter] = useState<
    "ALL" | EvaluationOutcome
  >("ALL");
  const [query, setQuery] = useState("");

  const loadHistory = useCallback(
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
    void loadHistory(false);
  }, [loadHistory]);

  const pastRecords = useMemo(() => {
    const q = query.trim().toLowerCase();
    return interviews.filter((item) => {
      const result = normalizeInterviewResult(item.interview_results);
      const isPastStatus =
        item.status === "EVALUATED" ||
        item.status === "NO_SHOW" ||
        item.status === "CANCELLED" ||
        item.status === "INTERVIEWER_CANCELLED" ||
        result !== null;
      if (!isPastStatus) return false;

      if (outcomeFilter !== "ALL") {
        if (!result || result.outcome !== outcomeFilter) return false;
      }
      if (!q) return true;
      return (
        item.booking_reference.toLowerCase().includes(q) ||
        (item.badges?.name ?? "").toLowerCase().includes(q) ||
        item.student_id.toLowerCase().includes(q)
      );
    });
  }, [interviews, outcomeFilter, query]);

  return (
    <AppShell allowedRoles={["INTERVIEWER"]} sectionLabel="Interviewer Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Interviewer Portal", href: "/interviewer" },
          { label: "Evaluation History" },
        ]}
        title="Evaluation History"
        description="Audit past interviews and review immutable outcomes you have recorded."
      />

      <div className="mb-5 flex flex-col gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap items-center gap-2">
          {(["ALL", "PASS", "FAIL", "RETAKE_LATER"] as const).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setOutcomeFilter(tab)}
              className={`min-h-9 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                outcomeFilter === tab
                  ? "bg-[var(--accent-primary)] text-white"
                  : "border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
              }`}
            >
              {tab === "ALL" ? "All History" : tab.replace("_", " ")}
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
            placeholder="Search reference or badge..."
            aria-label="Search evaluation history"
            className="min-h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none sm:w-56"
          />
        </div>
      </div>

      {loading ? (
        <SectionSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadHistory(true)} />
      ) : pastRecords.length === 0 ? (
        <EmptyState
          title="No historical records found"
          description="Completed evaluations and closed interview records will appear here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)]">
                  <th className="px-4 py-3">Badge &amp; Reference</th>
                  <th className="px-4 py-3">Interview Time</th>
                  <th className="px-4 py-3">Booking Status</th>
                  <th className="px-4 py-3">Outcome</th>
                  <th className="px-4 py-3">Submitted At</th>
                  <th className="px-4 py-3 text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-hairline)]">
                {pastRecords.map((item) => {
                  const statusMeta = getBookingStatusMeta(item.status);
                  const res = normalizeInterviewResult(item.interview_results);
                  const outcomeMeta = res ? getOutcomeMeta(res.outcome) : null;
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
                          {item.booking_reference}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs tabular-nums text-[var(--text-secondary)]">
                        {formatTimestamp(item.starts_at, item.timezone)}
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
                            No outcome
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5 align-top text-xs tabular-nums text-[var(--text-secondary)]">
                        {res ? formatTimestamp(res.submitted_at) : "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right align-top">
                        <Link
                          href={`/interviewer/interviews/${item.id}`}
                          className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                        >
                          <span>Inspect</span>
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
