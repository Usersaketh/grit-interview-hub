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
  getCertificationStatusMeta,
  hasAllowedRole,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
} from "@frontend/services/dataCache";
import { fetchStudentOverview } from "@frontend/services/hubApi";
import type {
  BadgeSummary,
  EligibilityDecision,
  StudentMalpracticeStatusRow,
  StudentOverviewResponse,
} from "@frontend/types/api";

interface EnrichedBadgeCard {
  badge: BadgeSummary;
  eligibility: EligibilityDecision | null;
  award: Extract<
    StudentMalpracticeStatusRow,
    { recordType: "badge_award" }
  > | null;
  requiredCount: number;
  verifiedCount: number;
}

function buildBadgeCards(overview: StudentOverviewResponse): EnrichedBadgeCard[] {
  const progressMap = new Map(
    overview.skillProgress.map((p) => [p.skill_id, p])
  );
  const now = new Date();
  const awards = overview.malpracticeStatus.records.filter(
    (
      r
    ): r is Extract<
      StudentMalpracticeStatusRow,
      { recordType: "badge_award" }
    > => r.recordType === "badge_award"
  );

  return overview.badges
    .filter((b) => b.is_active)
    .map((badge) => {
      const reqs = overview.requiredSkills.filter(
        (r) => r.badge_id === badge.id
      );
      const verifiedCount = reqs.filter((r) => {
        const p = progressMap.get(r.skill_id);
        return (
          Boolean(p?.verified_at) &&
          new Date(p!.verified_at!) <= now &&
          p!.achieved_level >= r.required_level
        );
      }).length;

      return {
        badge,
        eligibility: overview.eligibilities[badge.id] ?? null,
        award: awards.find((a) => a.badgeId === badge.id) ?? null,
        requiredCount: reqs.length,
        verifiedCount,
      };
    });
}

export function StudentBadgesView() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const isStudent = Boolean(
    profile && hasAllowedRole(profile.roles, ["STUDENT"])
  );

  const [overview, setOverview] = useState<StudentOverviewResponse | null>(() =>
    userId
      ? (getCachedData<StudentOverviewResponse>(userId, "student:overview")
          ?.data ?? null)
      : null
  );
  const [loading, setLoading] = useState<boolean>(() =>
    userId
      ? !getCachedData<StudentOverviewResponse>(userId, "student:overview")
      : true
  );
  const [error, setError] = useState<string | null>(null);

  const loadBadges = useCallback(
    async (force = false) => {
      if (!userId || !isStudent) return;

      const cached = getCachedData<StudentOverviewResponse>(
        userId,
        "student:overview"
      );
      if (cached && !force) {
        setOverview(cached.data);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const data = await fetchWithUserCache(
          userId,
          "student:overview",
          fetchStudentOverview,
          { force }
        );
        setOverview(data);
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
    void loadBadges(false);
  }, [loadBadges]);

  const cards = useMemo(
    () => (overview ? buildBadgeCards(overview) : []),
    [overview]
  );

  return (
    <AppShell allowedRoles={["STUDENT"]} sectionLabel="Student Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Student Portal", href: "/student" },
          { label: "My Badges" },
        ]}
        title="My Badges &amp; Certifications"
        description="A passing interview creates a pending certification record until an administrator approves the official badge award."
      />

      {loading ? (
        <SectionSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadBadges(true)} />
      ) : cards.length === 0 ? (
        <EmptyState
          title="No badges found"
          description="No active badges were returned from the GRIT catalog."
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          {cards.map((item) => {
            const certMeta = item.award?.awardStatus
              ? getCertificationStatusMeta(item.award.awardStatus)
              : null;
            const pct =
              item.requiredCount > 0
                ? Math.round((item.verifiedCount / item.requiredCount) * 100)
                : 0;

            return (
              <article
                key={item.badge.id}
                className="flex flex-col justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 transition-colors hover:border-[var(--border-strong)]"
              >
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-[var(--text-primary)]">
                        {item.badge.name}
                      </h2>
                      <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                        {item.badge.level}
                        {item.badge.external_id
                          ? ` · ${item.badge.external_id}`
                          : ""}
                      </p>
                    </div>

                    {certMeta ? (
                      <StatusText label={certMeta.label} tone={certMeta.tone} />
                    ) : item.eligibility?.eligible ? (
                      <StatusText label="Eligible" tone="success" />
                    ) : (
                      <StatusText label="Locked" tone="neutral" />
                    )}
                  </div>

                  <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">
                    <div className="flex items-center justify-between text-xs tabular-nums text-[var(--text-secondary)]">
                      <span>
                        Verified skills: {item.verifiedCount} /{" "}
                        {item.requiredCount}
                      </span>
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        {pct}%
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-[var(--bg-elevated)]">
                      <div
                        className="h-full bg-[var(--accent-primary)] transition-all"
                        style={{ width: `${pct}%` }}
                      />
                    </div>

                    {certMeta ? (
                      <p className="mt-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                        {certMeta.description}
                      </p>
                    ) : item.eligibility ? (
                      <p className="mt-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                        {item.eligibility.reason}
                      </p>
                    ) : null}

                    {item.award?.awardedAt ? (
                      <p className="mt-2 text-xs tabular-nums text-[var(--text-muted)]">
                        Awarded: {formatTimestamp(item.award.awardedAt)}
                      </p>
                    ) : null}
                    {item.award?.nullifiedAt ? (
                      <p className="mt-1 text-xs tabular-nums text-[var(--status-error)]">
                        Nullified: {formatTimestamp(item.award.nullifiedAt)}
                      </p>
                    ) : null}
                    {item.award?.reinstatedAt ? (
                      <p className="mt-1 text-xs tabular-nums text-[var(--status-success)]">
                        Reinstated: {formatTimestamp(item.award.reinstatedAt)}
                      </p>
                    ) : null}
                  </div>
                </div>

                <div className="mt-4 border-t border-[var(--border-hairline)] pt-3">
                  {item.eligibility?.eligible && !certMeta ? (
                    <Link
                      href={`/student/interviews/book?badgeId=${item.badge.id}`}
                      className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                    >
                      <span>Book Certification Interview</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  ) : (
                    <span className="font-mono text-[11px] text-[var(--text-muted)]">
                      ID: {item.badge.id}
                    </span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
