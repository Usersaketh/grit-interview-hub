"use client";

import { useCallback, useEffect, useState } from "react";
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
  fetchBadgeEligibility,
  fetchBadgeRequiredSkills,
  fetchBadgesCatalog,
  fetchOwnStudentRow,
  fetchStudentMalpracticeStatus,
  fetchStudentSkillProgress,
} from "@frontend/services/hubApi";
import type {
  BadgeRequiredSkill,
  BadgeSummary,
  EligibilityDecision,
  StudentMalpracticeStatusRow,
  StudentSkillProgress,
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

export function StudentBadgesView() {
  const { profile } = useAuth();
  const [cards, setCards] = useState<EnrichedBadgeCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadBadges = useCallback(async () => {
    if (!profile || !hasAllowedRole(profile.roles, ["STUDENT"])) return;
    setLoading(true);
    setError(null);
    try {
      const [studentRow, badges, requiredSkills, malpracticeStatus] =
        await Promise.all([
          fetchOwnStudentRow(profile.id).catch(() => null),
          fetchBadgesCatalog(),
          fetchBadgeRequiredSkills(),
          fetchStudentMalpracticeStatus(),
        ]);

      let progress: StudentSkillProgress[] = [];
      if (studentRow) {
        progress = await fetchStudentSkillProgress(studentRow.id).catch(
          () => [] as StudentSkillProgress[]
        );
      }

      const progressMap = new Map(progress.map((p) => [p.skill_id, p]));
      const now = new Date();

      const activeBadges = badges.filter((b) => b.is_active);
      const eligibilities = await Promise.all(
        activeBadges.map((b) =>
          fetchBadgeEligibility(b.id).catch(() => null)
        )
      );

      const awards = malpracticeStatus.records.filter(
        (
          r
        ): r is Extract<
          StudentMalpracticeStatusRow,
          { recordType: "badge_award" }
        > => r.recordType === "badge_award"
      );

      const items: EnrichedBadgeCard[] = activeBadges.map((badge, idx) => {
        const reqs = requiredSkills.filter((r) => r.badge_id === badge.id);
        const verifiedCount = reqs.filter((r) => {
          const p = progressMap.get(r.skill_id);
          return (
            Boolean(p?.verified_at) &&
            new Date(p!.verified_at!) <= now &&
            p!.achieved_level >= r.required_level
          );
        }).length;

        const award = awards.find((a) => a.badgeId === badge.id) ?? null;

        return {
          badge,
          eligibility: eligibilities[idx],
          award,
          requiredCount: reqs.length,
          verifiedCount,
        };
      });

      setCards(items);
    } catch (err) {
      setError(formatApiErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    void loadBadges();
  }, [loadBadges]);

  return (
    <AppShell allowedRoles={["STUDENT"]} sectionLabel="Student Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Student Portal", href: "/student" },
          { label: "My Badges" },
        ]}
        title="My Badges & Certifications"
        description="A passing interview creates a pending certification record until an administrator approves the official badge award."
      />

      {loading ? (
        <SectionSkeleton rows={5} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={loadBadges} />
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

            return (
              <article
                key={item.badge.id}
                className="flex flex-col justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
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
                    <p className="text-xs tabular-nums text-[var(--text-secondary)]">
                      Verified skills: {item.verifiedCount} /{" "}
                      {item.requiredCount}
                    </p>
                    {certMeta ? (
                      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                        {certMeta.description}
                      </p>
                    ) : item.eligibility ? (
                      <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
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
                      className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--accent-text)] hover:underline"
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
