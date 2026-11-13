"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Award, Calendar, ShieldAlert } from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import {
  GritProgressionTrack,
  type ProgressionStageKey,
} from "@frontend/components/GritProgressionTrack";
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
  getBookingStatusMeta,
  getCertificationStatusMeta,
  getMalpracticeStatusMeta,
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
import { fetchStudentOverview } from "@frontend/services/hubApi";
import type {
  BadgeSummary,
  EligibilityDecision,
  InterviewRecord,
  StudentMalpracticeStatusRow,
  StudentOverviewResponse,
} from "@frontend/types/api";

interface BadgeDashboardRow {
  badge: BadgeSummary;
  eligibility: EligibilityDecision | null;
  requiredCount: number;
  verifiedCount: number;
}

function buildBadgeRows(overview: StudentOverviewResponse): BadgeDashboardRow[] {
  const progressMap = new Map(
    overview.skillProgress.map((p) => [p.skill_id, p])
  );
  const now = new Date();
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
        requiredCount: reqs.length,
        verifiedCount,
      };
    });
}

export function StudentDashboardView() {
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

  const loadData = useCallback(
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
    void loadData(false);
  }, [loadData]);

  const interviews: InterviewRecord[] = overview?.interviews ?? [];
  const malpracticeRows: StudentMalpracticeStatusRow[] =
    overview?.malpracticeStatus.records ?? [];
  const badgeRows = useMemo(
    () => (overview ? buildBadgeRows(overview) : []),
    [overview]
  );

  const upcomingInterview = useMemo(
    () => interviews.find((item) => isInterviewUpcoming(item)) ?? null,
    [interviews]
  );

  const latestEvaluated = useMemo(
    () =>
      interviews.find(
        (item) => normalizeInterviewResult(item.interview_results) !== null
      ) ?? null,
    [interviews]
  );

  const awardRows = useMemo(
    () =>
      malpracticeRows.filter(
        (
          r
        ): r is Extract<
          StudentMalpracticeStatusRow,
          { recordType: "badge_award" }
        > => r.recordType === "badge_award"
      ),
    [malpracticeRows]
  );

  const activeMalpracticeAlerts = useMemo(
    () =>
      malpracticeRows.filter(
        (
          r
        ): r is Extract<
          StudentMalpracticeStatusRow,
          { recordType: "malpractice_report" }
        > =>
          r.recordType === "malpractice_report" &&
          r.reportStatus !== "DISMISSED" &&
          r.reportStatus !== "REINSTATED"
      ),
    [malpracticeRows]
  );

  const eligibleUnbooked = useMemo(() => {
    return badgeRows.filter((row) => {
      if (!row.eligibility?.eligible) return false;
      const hasActiveBooking = interviews.some(
        (i) =>
          i.badge_id === row.badge.id &&
          [
            "BOOKED",
            "RESCHEDULE_PENDING",
            "IN_PROGRESS",
            "AWAITING_OUTCOME",
          ].includes(i.status)
      );
      const hasAward = awardRows.some(
        (a) =>
          a.badgeId === row.badge.id &&
          (a.awardStatus === "AWARDED" ||
            a.awardStatus === "CERTIFICATION_PENDING" ||
            a.awardStatus === "REINSTATED")
      );
      return !hasActiveBooking && !hasAward;
    });
  }, [badgeRows, interviews, awardRows]);

  const eligibleBadgeCount = badgeRows.filter(
    (b) => b.eligibility?.eligible
  ).length;
  const awardedBadgeCount = awardRows.filter(
    (a) => a.awardStatus === "AWARDED" || a.awardStatus === "REINSTATED"
  ).length;
  const pendingCertCount = awardRows.filter(
    (a) => a.awardStatus === "CERTIFICATION_PENDING"
  ).length;

  const activeProgressionStage: ProgressionStageKey = useMemo(() => {
    if (awardedBadgeCount > 0 || pendingCertCount > 0) return "certification";
    if (
      interviews.some(
        (i) => i.status === "AWAITING_OUTCOME" || i.status === "EVALUATED"
      )
    ) {
      return "evaluation";
    }
    if (upcomingInterview || eligibleBadgeCount > 0) return "interview";
    return "preparation";
  }, [
    awardedBadgeCount,
    eligibleBadgeCount,
    interviews,
    pendingCertCount,
    upcomingInterview,
  ]);

  const studentMeta = overview?.student ?? null;

  return (
    <AppShell allowedRoles={["STUDENT"]} sectionLabel="Student Portal">
      <PageHeader
        breadcrumbs={[{ label: "Student Portal" }]}
        title={`Welcome back${profile ? `, ${profile.full_name}` : ""}`}
        description={
          studentMeta
            ? `Student ID ${studentMeta.external_student_id}${studentMeta.campus_ref ? ` · ${studentMeta.campus_ref} Campus` : ""}`
            : "Review your skill clearances, badge interview eligibility, scheduled interviews, and certification progress."
        }
        actions={
          <Link
            href="/student/interviews/book"
            className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
          >
            <span>Book Interview</span>
            <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
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
          {/* GRIT Progression Rail */}
          <GritProgressionTrack
            title="Your GRIT Assessment Journey"
            activeStage={activeProgressionStage}
            compact
          />

          {/* Next Action Banner */}
          <section
            aria-label="Next recommended action"
            className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
          >
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--accent-text)]">
                  Recommended Next Step
                </p>
                {upcomingInterview ? (
                  <>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                      Upcoming interview:{" "}
                      {upcomingInterview.badges?.name ?? "Badge Interview"}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Scheduled for{" "}
                      <span className="font-medium tabular-nums text-[var(--text-primary)]">
                        {formatTimestamp(
                          upcomingInterview.starts_at,
                          upcomingInterview.timezone
                        )}
                      </span>{" "}
                      ({upcomingInterview.timezone}) · Reference{" "}
                      <span className="font-mono text-xs text-[var(--text-primary)]">
                        {upcomingInterview.booking_reference}
                      </span>
                    </p>
                  </>
                ) : eligibleUnbooked.length > 0 ? (
                  <>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                      You are eligible to book:{" "}
                      {eligibleUnbooked[0].badge.name}
                    </h2>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      All required skill clearances are verified. Schedule your
                      level-clearance interview to proceed toward certification.
                    </p>
                  </>
                ) : (
                  <>
                    <h2 className="mt-1 text-lg font-semibold text-[var(--text-primary)]">
                      Review your badge requirements and skill progress
                    </h2>
                    <p className="mt-1 text-sm text-[var(--text-secondary)]">
                      Complete and verify all required skills for a badge to
                      unlock interview booking.
                    </p>
                  </>
                )}
              </div>

              <div className="shrink-0">
                {upcomingInterview ? (
                  <Link
                    href={`/student/interviews/${upcomingInterview.id}`}
                    className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <span>View Interview Details</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : eligibleUnbooked.length > 0 ? (
                  <Link
                    href={`/student/interviews/book?badgeId=${eligibleUnbooked[0].badge.id}`}
                    className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                  >
                    <span>Schedule Slot</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <Link
                    href="/student/badges"
                    className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <span>Inspect Badges</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </div>
          </section>

          {/* Metrics strip */}
          <section
            aria-label="Progress summary"
            className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
          >
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Eligible Badges
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {eligibleBadgeCount}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                of {badgeRows.length} active catalog badges
              </p>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Upcoming Interviews
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {interviews.filter((i) => isInterviewUpcoming(i)).length}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {interviews.length} total attempts recorded
              </p>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Awarded Badges
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {awardedBadgeCount}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                {pendingCertCount} pending admin approval
              </p>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <p className="text-xs font-medium text-[var(--text-secondary)]">
                Integrity Cases
              </p>
              <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
                {activeMalpracticeAlerts.length}
              </p>
              <p className="mt-1 text-xs text-[var(--text-muted)]">
                Active reviews requiring attention
              </p>
            </div>
          </section>

          {/* Malpractice Notice if relevant */}
          {activeMalpracticeAlerts.length > 0 ? (
            <section className="rounded-lg border border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)] p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <ShieldAlert
                    className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-warning)]"
                    aria-hidden="true"
                  />
                  <div>
                    <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                      Certification Integrity Notice
                    </h2>
                    <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                      You have {activeMalpracticeAlerts.length} active
                      malpractice review record(s) associated with your account.
                      Review the current status details for next steps.
                    </p>
                  </div>
                </div>
                <Link
                  href="/student/malpractice"
                  className="inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  <span>View Status</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Badge Progress & Eligibility */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Award
                    className="h-4 w-4 text-[var(--accent-primary)]"
                    aria-hidden="true"
                  />
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Badge Progress &amp; Eligibility
                  </h2>
                </div>
                <Link
                  href="/student/badges"
                  className="whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  All Badges
                </Link>
              </div>

              {badgeRows.length === 0 ? (
                <EmptyState
                  title="No active badges available"
                  description="No active badges were returned from the catalog."
                />
              ) : (
                <div className="divide-y divide-[var(--border-hairline)]">
                  {badgeRows.map((row) => {
                    const award = awardRows.find(
                      (a) => a.badgeId === row.badge.id
                    );
                    const certMeta = award?.awardStatus
                      ? getCertificationStatusMeta(award.awardStatus)
                      : null;

                    return (
                      <div
                        key={row.badge.id}
                        className="flex flex-col gap-2 py-3.5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            {row.badge.name}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
                            {row.badge.level} · {row.verifiedCount} of{" "}
                            {row.requiredCount} required skills verified
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-3">
                          {certMeta ? (
                            <StatusText
                              label={certMeta.label}
                              tone={certMeta.tone}
                            />
                          ) : row.eligibility?.eligible ? (
                            <StatusText label="Eligible" tone="success" />
                          ) : (
                            <StatusText label="Not eligible" tone="neutral" />
                          )}

                          {row.eligibility?.eligible && !certMeta ? (
                            <Link
                              href={`/student/interviews/book?badgeId=${row.badge.id}`}
                              className="whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                            >
                              Book
                            </Link>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Recent Outcome & Certification */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Calendar
                    className="h-4 w-4 text-[var(--accent-primary)]"
                    aria-hidden="true"
                  />
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Recent Interview &amp; Outcome
                  </h2>
                </div>
                <Link
                  href="/student/interviews"
                  className="whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  Interview History
                </Link>
              </div>

              {latestEvaluated ? (
                (() => {
                  const res = normalizeInterviewResult(
                    latestEvaluated.interview_results
                  );
                  const statusMeta = getBookingStatusMeta(latestEvaluated.status);
                  const outcomeMeta = res ? getOutcomeMeta(res.outcome) : null;
                  const award = awardRows.find(
                    (a) => a.badgeId === latestEvaluated.badge_id
                  );
                  const certMeta = award?.awardStatus
                    ? getCertificationStatusMeta(award.awardStatus)
                    : null;

                  return (
                    <div className="space-y-4">
                      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-hairline)] pb-3">
                        <div>
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {latestEvaluated.badges?.name ?? "Badge Interview"}
                          </p>
                          <p className="mt-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
                            {formatTimestamp(
                              latestEvaluated.starts_at,
                              latestEvaluated.timezone
                            )}
                          </p>
                        </div>
                        {outcomeMeta ? (
                          <StatusText
                            label={outcomeMeta.label}
                            tone={outcomeMeta.tone}
                          />
                        ) : (
                          <StatusText
                            label={statusMeta.label}
                            tone={statusMeta.tone}
                          />
                        )}
                      </div>

                      {res?.feedback ? (
                        <div>
                          <p className="text-xs font-medium text-[var(--text-secondary)]">
                            Evaluator Feedback
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">
                            {res.feedback}
                          </p>
                        </div>
                      ) : null}

                      {res?.retake_after ? (
                        <p className="text-xs text-[var(--status-warning)]">
                          Earliest eligible retake:{" "}
                          <span className="font-medium tabular-nums">
                            {formatTimestamp(res.retake_after)}
                          </span>
                        </p>
                      ) : null}

                      {certMeta ? (
                        <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-3">
                          <div className="flex items-center justify-between gap-2">
                            <span className="text-xs font-medium text-[var(--text-secondary)]">
                              Certification Status
                            </span>
                            <StatusText
                              label={certMeta.label}
                              tone={certMeta.tone}
                            />
                          </div>
                          <p className="mt-1 text-xs text-[var(--text-secondary)]">
                            {certMeta.description}
                          </p>
                        </div>
                      ) : null}

                      <Link
                        href={`/student/interviews/${latestEvaluated.id}`}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                      >
                        <span>Inspect Full Details</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    </div>
                  );
                })()
              ) : interviews.length > 0 ? (
                <div className="space-y-3">
                  <p className="text-sm text-[var(--text-secondary)]">
                    You have {interviews.length} scheduled interview(s) awaiting
                    evaluation.
                  </p>
                  <Link
                    href={`/student/interviews/${interviews[0].id}`}
                    className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                  >
                    <span>View Latest Interview</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                </div>
              ) : (
                <EmptyState
                  title="No interviews yet"
                  description="Once you are eligible for a badge, schedule your first live interview."
                  action={
                    <Link
                      href="/student/interviews/book"
                      className="inline-flex items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent-primary-hover)]"
                    >
                      Book Interview
                    </Link>
                  }
                />
              )}
            </section>
          </div>

          {/* Sanitized Award & Malpractice Summary */}
          {malpracticeRows.length > 0 ? (
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Certification &amp; Integrity Timeline
                </h2>
                <Link
                  href="/student/malpractice"
                  className="whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                >
                  View Full Status
                </Link>
              </div>
              <div className="divide-y divide-[var(--border-hairline)]">
                {malpracticeRows.slice(0, 5).map((row, idx) => {
                  if (row.recordType === "badge_award") {
                    const meta = row.awardStatus
                      ? getCertificationStatusMeta(row.awardStatus)
                      : null;
                    return (
                      <div
                        key={row.awardId ?? `award-${idx}`}
                        className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                      >
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">
                            Badge Certification Record
                          </p>
                          <p className="font-mono text-xs text-[var(--text-secondary)]">
                            Badge {row.badgeId ?? "Unknown"}
                          </p>
                        </div>
                        <div className="flex items-center gap-4">
                          {meta ? (
                            <StatusText label={meta.label} tone={meta.tone} />
                          ) : null}
                          <span className="text-xs tabular-nums text-[var(--text-muted)]">
                            {formatTimestamp(
                              row.reinstatedAt ?? row.nullifiedAt ?? row.awardedAt
                            )}
                          </span>
                        </div>
                      </div>
                    );
                  }
                  const repMeta = row.reportStatus
                    ? getMalpracticeStatusMeta(row.reportStatus)
                    : null;
                  return (
                    <div
                      key={row.reportId ?? `rep-${idx}`}
                      className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div>
                        <p className="text-sm font-medium text-[var(--text-primary)]">
                          Integrity Review Case
                        </p>
                        <p className="font-mono text-xs text-[var(--text-secondary)]">
                          Badge {row.badgeId ?? "Unknown"}
                        </p>
                      </div>
                      <div className="flex items-center gap-4">
                        {repMeta ? (
                          <StatusText
                            label={repMeta.label}
                            tone={repMeta.tone}
                          />
                        ) : null}
                        <span className="text-xs tabular-nums text-[var(--text-muted)]">
                          {formatTimestamp(row.reportCreatedAt)}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          ) : null}
        </div>
      )}
    </AppShell>
  );
}
