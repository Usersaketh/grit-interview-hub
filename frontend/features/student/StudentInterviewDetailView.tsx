"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { CalendarClock, History, MailCheck, RefreshCw, XCircle } from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import { ConfirmDialog } from "@frontend/components/ConfirmDialog";
import {
  GritProgressionTrack,
  type ProgressionStageKey,
} from "@frontend/components/GritProgressionTrack";
import { PageHeader } from "@frontend/components/PageHeader";
import { StatusText } from "@frontend/components/StatusText";
import {
  EmptyState,
  ErrorBanner,
  SectionSkeleton,
} from "@frontend/components/SurfaceStates";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import {
  canStudentModifyBooking,
  formatTimestamp,
  generateUuid,
  getAttendanceStatusMeta,
  getBookingStatusMeta,
  getCertificationStatusMeta,
  getOutcomeMeta,
  groupBookableSlotsByDate,
  hasAllowedRole,
  validateBookingReasonForm,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
  invalidateUserCache,
} from "@frontend/services/dataCache";
import {
  cancelStudentBooking,
  fetchBookableSlots,
  fetchStudentInterviewDetail,
  fetchStudentMalpracticeStatus,
  rescheduleStudentBooking,
} from "@frontend/services/hubApi";
import type {
  BookableSlot,
  InterviewWorkspaceDetail,
  StudentMalpracticeStatusResponse,
  StudentMalpracticeStatusRow,
} from "@frontend/types/api";

interface DetailBundle {
  workspaceDetail: InterviewWorkspaceDetail;
  malpracticeStatus: StudentMalpracticeStatusResponse;
}

export function StudentInterviewDetailView({
  interviewId,
}: {
  interviewId: string;
}) {
  const { profile } = useAuth();
  const { pushToast } = useToast();
  const userId = profile?.id ?? null;
  const isStudent = Boolean(
    profile && hasAllowedRole(profile.roles, ["STUDENT"])
  );

  const cacheKey = `student:interview-detail:${interviewId}`;
  const cachedBundle = userId
    ? (getCachedData<DetailBundle>(userId, cacheKey)?.data ?? null)
    : null;

  const [detail, setDetail] = useState<InterviewWorkspaceDetail | null>(
    cachedBundle?.workspaceDetail ?? null
  );
  const [awardRow, setAwardRow] = useState<Extract<
    StudentMalpracticeStatusRow,
    { recordType: "badge_award" }
  > | null>(() =>
    cachedBundle
      ? (cachedBundle.malpracticeStatus.records.find(
          (
            r
          ): r is Extract<
            StudentMalpracticeStatusRow,
            { recordType: "badge_award" }
          > =>
            r.recordType === "badge_award" &&
            r.badgeId === cachedBundle.workspaceDetail.interview.badge_id
        ) ?? null)
      : null
  );
  const [loading, setLoading] = useState<boolean>(!cachedBundle);
  const [error, setError] = useState<string | null>(null);

  // Cancellation state
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [cancelIdemKey, setCancelIdemKey] = useState(() => generateUuid());

  // Rescheduling state
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [availableSlots, setAvailableSlots] = useState<BookableSlot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedNewSlot, setSelectedNewSlot] = useState<BookableSlot | null>(
    null
  );
  const [rescheduleReason, setRescheduleReason] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduling, setRescheduling] = useState(false);
  const [rescheduleIdemKey, setRescheduleIdemKey] = useState(() =>
    generateUuid()
  );

  const applyBundle = useCallback((bundle: DetailBundle) => {
    setDetail(bundle.workspaceDetail);
    const award =
      bundle.malpracticeStatus.records.find(
        (
          r
        ): r is Extract<
          StudentMalpracticeStatusRow,
          { recordType: "badge_award" }
        > =>
          r.recordType === "badge_award" &&
          r.badgeId === bundle.workspaceDetail.interview.badge_id
      ) ?? null;
    setAwardRow(award);
  }, []);

  const loadDetail = useCallback(
    async (force = false) => {
      if (!userId || !isStudent) return;

      const cached = getCachedData<DetailBundle>(userId, cacheKey);
      if (cached && !force) {
        applyBundle(cached.data);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const bundle = await fetchWithUserCache(
          userId,
          cacheKey,
          async () => {
            const [workspaceDetail, malpracticeStatus] = await Promise.all([
              fetchStudentInterviewDetail(interviewId),
              fetchStudentMalpracticeStatus(),
            ]);
            return { workspaceDetail, malpracticeStatus };
          },
          { force }
        );
        applyBundle(bundle);
      } catch (err) {
        if (!cached) {
          setError(formatApiErrorMessage(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [applyBundle, cacheKey, interviewId, isStudent, userId]
  );

  useEffect(() => {
    void loadDetail(false);
  }, [loadDetail]);

  const loadRescheduleSlots = useCallback(async () => {
    if (!detail) return;
    setLoadingSlots(true);
    setRescheduleError(null);
    try {
      const from = new Date();
      const to = new Date(from.getTime() + 14 * 24 * 60 * 60 * 1000);
      const res = await fetchBookableSlots({
        badgeId: detail.interview.badge_id,
        from: from.toISOString(),
        to: to.toISOString(),
        excludeInterviewId: detail.interview.id,
        durationMinutes: Math.max(
          30,
          Math.round(
            (Date.parse(detail.interview.ends_at) -
              Date.parse(detail.interview.starts_at)) /
              60_000
          )
        ),
      });
      setAvailableSlots(res.slots);
    } catch (err) {
      setRescheduleError(formatApiErrorMessage(err));
    } finally {
      setLoadingSlots(false);
    }
  }, [detail]);

  const openReschedulePanel = () => {
    setRescheduleOpen(true);
    setSelectedNewSlot(null);
    setRescheduleError(null);
    setRescheduleIdemKey(generateUuid());
    void loadRescheduleSlots();
  };

  const handleConfirmCancel = async () => {
    const errors = validateBookingReasonForm({ reason: cancelReason });
    if (errors.reason) {
      setCancelError(errors.reason);
      return;
    }
    setCancelling(true);
    setCancelError(null);
    try {
      await cancelStudentBooking(interviewId, {
        reason: cancelReason.trim(),
        idempotencyKey: cancelIdemKey,
      });
      if (userId) invalidateUserCache(userId, "student:");
      setCancelModalOpen(false);
      setCancelReason("");
      setCancelIdemKey(generateUuid());
      pushToast({
        title: "Interview cancelled",
        description: "Your booking has been cancelled and the slot released.",
        tone: "info",
      });
      await loadDetail(true);
    } catch (err) {
      setCancelError(formatApiErrorMessage(err));
    } finally {
      setCancelling(false);
    }
  };

  const handleConfirmReschedule = async () => {
    if (!detail || !selectedNewSlot) {
      setRescheduleError("Select a new open slot first.");
      return;
    }
    const errors = validateBookingReasonForm({ reason: rescheduleReason });
    if (errors.reason) {
      setRescheduleError(errors.reason);
      return;
    }
    setRescheduling(true);
    setRescheduleError(null);
    try {
      await rescheduleStudentBooking(interviewId, {
        newInterviewerId: selectedNewSlot.interviewerId,
        newStartsAt: selectedNewSlot.startsAt,
        newEndsAt: selectedNewSlot.endsAt,
        timezone: detail.interview.timezone,
        reason: rescheduleReason.trim(),
        idempotencyKey: rescheduleIdemKey,
      });
      if (userId) invalidateUserCache(userId, "student:");
      setRescheduleOpen(false);
      setRescheduleReason("");
      setSelectedNewSlot(null);
      setRescheduleIdemKey(generateUuid());
      pushToast({
        title: "Interview rescheduled",
        description: `Updated appointment to ${formatTimestamp(selectedNewSlot.startsAt, detail.interview.timezone)}.`,
        tone: "success",
      });
      await loadDetail(true);
    } catch (err) {
      setRescheduleError(formatApiErrorMessage(err));
    } finally {
      setRescheduling(false);
    }
  };

  const groupedRescheduleSlots = useMemo(
    () =>
      groupBookableSlotsByDate(
        availableSlots,
        detail?.interview.timezone ?? "UTC"
      ),
    [availableSlots, detail?.interview.timezone]
  );

  return (
    <AppShell allowedRoles={["STUDENT"]} sectionLabel="Student Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Student Portal", href: "/student" },
          { label: "My Interviews", href: "/student/interviews" },
          { label: detail?.interview.booking_reference ?? "Interview Details" },
        ]}
        title={detail?.badge?.name ?? "Interview Details"}
        description={
          detail
            ? `Booking reference ${detail.interview.booking_reference} · Attempt #${detail.interview.attempt_number}`
            : "Scheduled interview details and published outcome."
        }
        actions={
          <Link
            href="/student/messages"
            className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
          >
            <MailCheck className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Student Messages</span>
          </Link>
        }
      />

      {loading ? (
        <SectionSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadDetail(true)} />
      ) : !detail ? (
        <EmptyState
          title="Interview not found"
          description="We could not locate an interview matching this identifier under your student profile."
          action={
            <Link
              href="/student/interviews"
              className="inline-flex items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-primary-hover)]"
            >
              Return to My Interviews
            </Link>
          }
        />
      ) : (
        (() => {
          const {
            interview,
            interviewer,
            attendance,
            result,
            reschedule_history,
          } = detail;
          const statusMeta = getBookingStatusMeta(interview.status);
          const outcomeMeta = result ? getOutcomeMeta(result.outcome) : null;
          const certMeta = awardRow?.awardStatus
            ? getCertificationStatusMeta(awardRow.awardStatus)
            : null;
          const modifyEligibility = canStudentModifyBooking(interview);

          let stage: ProgressionStageKey = "interview";
          if (awardRow?.awardStatus === "AWARDED" || awardRow?.awardStatus === "REINSTATED" || awardRow?.awardStatus === "CERTIFICATION_PENDING") {
            stage = "certification";
          } else if (
            interview.status === "AWAITING_OUTCOME" ||
            interview.status === "EVALUATED" ||
            result
          ) {
            stage = "evaluation";
          }

          return (
            <div className="space-y-6">
              <GritProgressionTrack
                title="Interview Lifecycle"
                activeStage={stage}
                compact
              />

              <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
                <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 lg:col-span-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-4">
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">
                      Appointment Schedule
                    </h2>
                    <StatusText
                      label={statusMeta.label}
                      tone={statusMeta.tone}
                    />
                  </div>

                  <dl className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <dt className="text-xs text-[var(--text-secondary)]">
                        Start Time
                      </dt>
                      <dd className="mt-1 text-sm font-medium tabular-nums text-[var(--text-primary)]">
                        {formatTimestamp(interview.starts_at, interview.timezone)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-secondary)]">
                        End Time
                      </dt>
                      <dd className="mt-1 text-sm font-medium tabular-nums text-[var(--text-primary)]">
                        {formatTimestamp(interview.ends_at, interview.timezone)}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-secondary)]">
                        Timezone
                      </dt>
                      <dd className="mt-1 text-sm text-[var(--text-primary)]">
                        {interview.timezone}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-secondary)]">
                        Assigned Assessor
                      </dt>
                      <dd className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                        {interviewer.display_name ?? "Assigned Interviewer"}
                      </dd>
                      {interviewer.title ? (
                        <dd className="text-xs text-[var(--text-secondary)]">
                          {interviewer.title}
                        </dd>
                      ) : null}
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-secondary)]">
                        Attendance Record
                      </dt>
                      <dd className="mt-1">
                        {attendance ? (
                          <StatusText
                            label={
                              getAttendanceStatusMeta(
                                attendance.student_attendance
                              ).label
                            }
                            tone={
                              getAttendanceStatusMeta(
                                attendance.student_attendance
                              ).tone
                            }
                          />
                        ) : (
                          <span className="text-xs text-[var(--text-muted)]">
                            Not recorded yet
                          </span>
                        )}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-xs text-[var(--text-secondary)]">
                        Booked At
                      </dt>
                      <dd className="mt-1 text-xs tabular-nums text-[var(--text-secondary)]">
                        {formatTimestamp(interview.created_at)}
                      </dd>
                    </div>
                  </dl>

                  {interview.cancellation_reason ? (
                    <div className="mt-4 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-3 text-xs">
                      <p className="font-semibold text-[var(--text-primary)]">
                        Cancellation Reason
                      </p>
                      <p className="mt-0.5 text-[var(--text-secondary)]">
                        {interview.cancellation_reason}
                      </p>
                    </div>
                  ) : null}

                  {/* Booking Management Actions */}
                  <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--border-hairline)] pt-4">
                    <div className="text-xs text-[var(--text-secondary)]">
                      {modifyEligibility.allowed
                        ? "You can reschedule or cancel up to 2 hours before start."
                        : modifyEligibility.reason}
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                      <button
                        type="button"
                        disabled={!modifyEligibility.allowed}
                        onClick={openReschedulePanel}
                        className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <CalendarClock
                          className="h-3.5 w-3.5"
                          aria-hidden="true"
                        />
                        <span>Reschedule</span>
                      </button>
                      <button
                        type="button"
                        disabled={!modifyEligibility.allowed}
                        onClick={() => {
                          setCancelError(null);
                          setCancelIdemKey(generateUuid());
                          setCancelModalOpen(true);
                        }}
                        className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-bg)] px-3.5 py-1.5 text-xs font-medium text-[var(--status-error)] hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        <XCircle className="h-3.5 w-3.5" aria-hidden="true" />
                        <span>Cancel Booking</span>
                      </button>
                    </div>
                  </div>
                </section>

                <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                  <h2 className="border-b border-[var(--border-hairline)] pb-4 text-base font-semibold text-[var(--text-primary)]">
                    Evaluation &amp; Certification
                  </h2>

                  {result && outcomeMeta ? (
                    <div className="mt-4 space-y-4">
                      <div>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Evaluation Outcome
                        </p>
                        <div className="mt-1">
                          <StatusText
                            label={outcomeMeta.label}
                            tone={outcomeMeta.tone}
                          />
                        </div>
                      </div>

                      <div>
                        <p className="text-xs text-[var(--text-secondary)]">
                          Submitted At
                        </p>
                        <p className="mt-0.5 text-xs tabular-nums text-[var(--text-primary)]">
                          {formatTimestamp(result.submitted_at)}
                        </p>
                      </div>

                      {result.feedback ? (
                        <div>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Feedback
                          </p>
                          <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">
                            {result.feedback}
                          </p>
                        </div>
                      ) : null}

                      {result.retake_after ? (
                        <div>
                          <p className="text-xs text-[var(--text-secondary)]">
                            Retake Eligible After
                          </p>
                          <p className="mt-0.5 text-sm font-medium tabular-nums text-[var(--status-warning)]">
                            {formatTimestamp(result.retake_after)}
                          </p>
                        </div>
                      ) : null}

                      {certMeta ? (
                        <div className="border-t border-[var(--border-hairline)] pt-4">
                          <p className="text-xs text-[var(--text-secondary)]">
                            Certification Progress
                          </p>
                          <div className="mt-1">
                            <StatusText
                              label={certMeta.label}
                              tone={certMeta.tone}
                            />
                          </div>
                          <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                            {certMeta.description}
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : (
                    <p className="mt-4 text-sm text-[var(--text-secondary)]">
                      No evaluation result has been submitted yet.
                    </p>
                  )}
                </section>
              </div>

              {/* Reschedule Panel */}
              {rescheduleOpen ? (
                <section className="rounded-lg border border-[var(--accent-primary)] bg-[var(--bg-surface)] p-6">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-4">
                    <div>
                      <h2 className="text-base font-semibold text-[var(--text-primary)]">
                        Reschedule Interview Slot
                      </h2>
                      <p className="text-xs text-[var(--text-secondary)]">
                        Choose a new open slot and provide your reason. Atomic
                        rescheduling preserves your attempt record.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => void loadRescheduleSlots()}
                      className="inline-flex items-center gap-1 whitespace-nowrap rounded-md border border-[var(--border-hairline)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                    >
                      <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>Refresh Slots</span>
                    </button>
                  </div>

                  {rescheduleError ? (
                    <div className="mt-4">
                      <ErrorBanner message={rescheduleError} />
                    </div>
                  ) : null}

                  <div className="mt-4 space-y-5">
                    {loadingSlots ? (
                      <SectionSkeleton rows={3} />
                    ) : groupedRescheduleSlots.length === 0 ? (
                      <EmptyState
                        title="No alternative slots available"
                        description="No open slots were found in the next 14 days."
                      />
                    ) : (
                      <div className="space-y-4">
                        {groupedRescheduleSlots.map((group) => (
                          <div key={group.dateKey}>
                            <p className="mb-2 text-xs font-semibold text-[var(--text-primary)]">
                              {group.dateLabel}
                            </p>
                            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                              {group.slots.map((slot) => {
                                const selected =
                                  selectedNewSlot?.startsAt === slot.startsAt &&
                                  selectedNewSlot?.interviewerId ===
                                    slot.interviewerId;
                                return (
                                  <button
                                    key={`${slot.interviewerId}:${slot.startsAt}`}
                                    type="button"
                                    onClick={() => setSelectedNewSlot(slot)}
                                    className={`rounded-md border p-2.5 text-left text-xs ${
                                      selected
                                        ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                                        : "border-[var(--border-hairline)] hover:bg-[var(--bg-elevated)]"
                                    }`}
                                  >
                                    <p className="font-semibold tabular-nums text-[var(--text-primary)]">
                                      {formatTimestamp(
                                        slot.startsAt,
                                        interview.timezone
                                      )}
                                    </p>
                                    <p className="mt-0.5 truncate text-[var(--text-secondary)]">
                                      {slot.interviewerName}
                                    </p>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}

                    <div>
                      <label
                        htmlFor="reschedule-reason"
                        className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                      >
                        Reason for rescheduling (Required)
                      </label>
                      <textarea
                        id="reschedule-reason"
                        rows={2}
                        value={rescheduleReason}
                        onChange={(e) => setRescheduleReason(e.target.value)}
                        placeholder="Briefly describe why you need to move this interview..."
                        className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-canvas)] p-2.5 text-sm text-[var(--text-primary)]"
                      />
                    </div>

                    <div className="flex flex-wrap justify-end gap-3">
                      <button
                        type="button"
                        onClick={() => setRescheduleOpen(false)}
                        className="min-h-9 whitespace-nowrap rounded-md border border-[var(--border-hairline)] px-4 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                      >
                        Close
                      </button>
                      <button
                        type="button"
                        disabled={rescheduling || !selectedNewSlot}
                        onClick={() => void handleConfirmReschedule()}
                        className="min-h-9 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-1.5 text-xs font-medium text-white hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
                      >
                        {rescheduling
                          ? "Rescheduling..."
                          : "Confirm Rescheduled Slot"}
                      </button>
                    </div>
                  </div>
                </section>
              ) : null}

              {/* Reschedule History */}
              {reschedule_history.length > 0 ? (
                <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                  <div className="mb-4 flex items-center gap-2">
                    <History
                      className="h-4 w-4 text-[var(--accent-primary)]"
                      aria-hidden="true"
                    />
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">
                      Reschedule History
                    </h2>
                  </div>
                  <div className="divide-y divide-[var(--border-hairline)] text-xs">
                    {reschedule_history.map((entry) => (
                      <div key={entry.id} className="py-3 first:pt-0 last:pb-0">
                        <p className="font-medium text-[var(--text-primary)]">
                          Moved from{" "}
                          <span className="tabular-nums">
                            {formatTimestamp(
                              entry.old_starts_at,
                              interview.timezone
                            )}
                          </span>{" "}
                          to{" "}
                          <span className="tabular-nums">
                            {formatTimestamp(
                              entry.new_starts_at,
                              interview.timezone
                            )}
                          </span>
                        </p>
                        {entry.reason ? (
                          <p className="mt-1 text-[var(--text-secondary)]">
                            Reason: {entry.reason}
                          </p>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </section>
              ) : null}

              <ConfirmDialog
                open={cancelModalOpen}
                title="Cancel Interview Booking"
                description="Cancelling releases this slot immediately so another student can book it. Provide a brief reason below."
                confirmLabel="Confirm Cancellation"
                cancelLabel="Keep Booking"
                destructive
                busy={cancelling}
                onConfirm={() => void handleConfirmCancel()}
                onCancel={() => {
                  if (!cancelling) setCancelModalOpen(false);
                }}
              >
                <div className="space-y-3">
                  {cancelError ? (
                    <p className="rounded bg-[var(--status-error-bg)] p-2.5 text-xs text-[var(--status-error)]">
                      {cancelError}
                    </p>
                  ) : null}
                  <div>
                    <label
                      htmlFor="cancel-reason-input"
                      className="mb-1.5 block text-xs font-medium text-[var(--text-primary)]"
                    >
                      Cancellation reason (Required)
                    </label>
                    <textarea
                      id="cancel-reason-input"
                      rows={3}
                      value={cancelReason}
                      onChange={(e) => setCancelReason(e.target.value)}
                      placeholder="Explain why you need to cancel..."
                      className="w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-canvas)] p-2.5 text-sm text-[var(--text-primary)]"
                    />
                  </div>
                </div>
              </ConfirmDialog>
            </div>
          );
        })()
      )}
    </AppShell>
  );
}
