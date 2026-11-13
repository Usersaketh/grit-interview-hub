"use client";

import { useCallback, useEffect, useState } from "react";
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
  getCertificationStatusMeta,
  getMalpracticeStatusMeta,
  hasAllowedRole,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
} from "@frontend/services/dataCache";
import { fetchStudentMalpracticeStatus } from "@frontend/services/hubApi";
import type { StudentMalpracticeStatusResponse } from "@frontend/types/api";

export function StudentMalpracticeView() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const isStudent = Boolean(
    profile && hasAllowedRole(profile.roles, ["STUDENT"])
  );

  const [data, setData] = useState<StudentMalpracticeStatusResponse | null>(() =>
    userId
      ? (getCachedData<StudentMalpracticeStatusResponse>(
          userId,
          "student:malpractice"
        )?.data ?? null)
      : null
  );
  const [loading, setLoading] = useState<boolean>(() =>
    userId
      ? !getCachedData<StudentMalpracticeStatusResponse>(
          userId,
          "student:malpractice"
        )
      : true
  );
  const [error, setError] = useState<string | null>(null);

  const loadStatus = useCallback(
    async (force = false) => {
      if (!userId || !isStudent) return;

      const cached = getCachedData<StudentMalpracticeStatusResponse>(
        userId,
        "student:malpractice"
      );
      if (cached && !force) {
        setData(cached.data);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const response = await fetchWithUserCache(
          userId,
          "student:malpractice",
          fetchStudentMalpracticeStatus,
          { force }
        );
        setData(response);
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
    void loadStatus(false);
  }, [loadStatus]);

  const badgeAwards =
    data?.records.filter(
      (r): r is Extract<typeof r, { recordType: "badge_award" }> =>
        r.recordType === "badge_award"
    ) ?? [];

  const reports =
    data?.records.filter(
      (r): r is Extract<typeof r, { recordType: "malpractice_report" }> =>
        r.recordType === "malpractice_report"
    ) ?? [];

  return (
    <AppShell allowedRoles={["STUDENT"]} sectionLabel="Student Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Student Portal", href: "/student" },
          { label: "Malpractice & Award Status" },
        ]}
        title="Certification &amp; Integrity Status"
        description="Sanitized view of your badge award standing and any integrity review cases."
      />

      {loading ? (
        <SectionSkeleton rows={4} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadStatus(true)} />
      ) : !data || data.records.length === 0 ? (
        <EmptyState
          title="No integrity or award records"
          description="You have no badge award records or malpractice review cases on file."
        />
      ) : (
        <div className="space-y-6">
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
              Badge Award Standing
            </h2>
            {badgeAwards.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                No badge awards recorded yet.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-hairline)] text-xs font-medium text-[var(--text-secondary)]">
                      <th className="py-2.5 pr-4">Badge ID</th>
                      <th className="py-2.5 pr-4">Status</th>
                      <th className="py-2.5 pr-4">Awarded</th>
                      <th className="py-2.5 pr-4">Nullified</th>
                      <th className="py-2.5">Reinstated</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {badgeAwards.map((award, idx) => {
                      const meta = award.awardStatus
                        ? getCertificationStatusMeta(award.awardStatus)
                        : null;
                      return (
                        <tr key={award.awardId ?? idx}>
                          <td className="py-3 pr-4 font-mono text-xs text-[var(--text-primary)]">
                            {award.badgeId ?? "Unknown"}
                          </td>
                          <td className="py-3 pr-4">
                            {meta ? (
                              <StatusText label={meta.label} tone={meta.tone} />
                            ) : (
                              "Unknown"
                            )}
                          </td>
                          <td className="py-3 pr-4 text-xs tabular-nums text-[var(--text-secondary)]">
                            {formatTimestamp(award.awardedAt)}
                          </td>
                          <td className="py-3 pr-4 text-xs tabular-nums text-[var(--text-secondary)]">
                            {formatTimestamp(award.nullifiedAt)}
                          </td>
                          <td className="py-3 text-xs tabular-nums text-[var(--text-secondary)]">
                            {formatTimestamp(award.reinstatedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <h2 className="mb-4 text-base font-semibold text-[var(--text-primary)]">
              Malpractice Review Cases
            </h2>
            {reports.length === 0 ? (
              <p className="text-sm text-[var(--text-secondary)]">
                No malpractice cases recorded for your account.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-hairline)] text-xs font-medium text-[var(--text-secondary)]">
                      <th className="py-2.5 pr-4">Case ID</th>
                      <th className="py-2.5 pr-4">Badge ID</th>
                      <th className="py-2.5 pr-4">Review Status</th>
                      <th className="py-2.5">Reported At</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-hairline)]">
                    {reports.map((report, idx) => {
                      const meta = report.reportStatus
                        ? getMalpracticeStatusMeta(report.reportStatus)
                        : null;
                      return (
                        <tr key={report.reportId ?? idx}>
                          <td className="py-3 pr-4 font-mono text-xs text-[var(--text-primary)]">
                            {report.reportId ?? "Unknown"}
                          </td>
                          <td className="py-3 pr-4 font-mono text-xs text-[var(--text-secondary)]">
                            {report.badgeId ?? "Unknown"}
                          </td>
                          <td className="py-3 pr-4">
                            {meta ? (
                              <StatusText label={meta.label} tone={meta.tone} />
                            ) : (
                              "Unknown"
                            )}
                          </td>
                          <td className="py-3 text-xs tabular-nums text-[var(--text-secondary)]">
                            {formatTimestamp(report.reportCreatedAt)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </AppShell>
  );
}
