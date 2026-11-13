"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  CheckCircle2,
  ClipboardCheck,
  Lock,
  Play,
  UserX,
} from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import { ConfirmDialog } from "@frontend/components/ConfirmDialog";
import {
  GritProgressionTrack,
  type ProgressionStageKey,
  type ProgressionStageState,
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
  formatTimestamp,
  generateUuid,
  getAttendanceStatusMeta,
  getBookingStatusMeta,
  getInterviewerLifecycleActions,
  getOutcomeMeta,
  hasAllowedRole,
  validateEvaluationForm,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
  invalidateUserCache,
} from "@frontend/services/dataCache";
import {
  completeInterviewSession,
  fetchInterviewerInterviewDetail,
  recordInterviewAttendance,
  startInterviewSession,
  submitInterviewEvaluation,
} from "@frontend/services/hubApi";
import type {
  AttendanceStatus,
  EvaluationOutcome,
  InterviewWorkspaceDetail,
} from "@frontend/types/api";

export function InterviewerEvaluationView({
  interviewId,
}: {
  interviewId: string;
}) {
  const { profile } = useAuth();
  const { pushToast } = useToast();
  const userId = profile?.id ?? null;
  const isInterviewer = Boolean(
    profile && hasAllowedRole(profile.roles, ["INTERVIEWER"])
  );
  const cacheKey = `interviewer:interview:${interviewId}`;

  const initialCached = userId
    ? getCachedData<InterviewWorkspaceDetail>(userId, cacheKey)?.data ?? null
    : null;

  const [detail, setDetail] = useState<InterviewWorkspaceDetail | null>(
    () => initialCached
  );
  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState<string | null>(null);

  // Lifecycle & attendance controls
  const [studentAttendance, setStudentAttendance] = useState<AttendanceStatus>(
    () => initialCached?.attendance?.student_attendance ?? "ATTENDED"
  );
  const [interviewerAttendance, setInterviewerAttendance] =
    useState<AttendanceStatus>(
      () => initialCached?.attendance?.interviewer_attendance ?? "ATTENDED"
    );
  const [attendanceNotes, setAttendanceNotes] = useState(
    () => initialCached?.attendance?.notes ?? ""
  );
  const [lifecycleBusy, setLifecycleBusy] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [noShowConfirmOpen, setNoShowConfirmOpen] = useState(false);

  // Evaluation form
  const [outcome, setOutcome] = useState<EvaluationOutcome | "">("");
  const [feedback, setFeedback] = useState("");
  const [retakeAfterLocal, setRetakeAfterLocal] = useState("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [idempotencyKey, setIdempotencyKey] = useState<string>(() =>
    generateUuid()
  );
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const applyWorkspace = useCallback((workspace: InterviewWorkspaceDetail) => {
    setDetail(workspace);
    if (workspace.attendance) {
      setStudentAttendance(workspace.attendance.student_attendance);
      setInterviewerAttendance(workspace.attendance.interviewer_attendance);
      setAttendanceNotes(workspace.attendance.notes ?? "");
    }
  }, []);

  const loadInterview = useCallback(
    async (force = false) => {
      if (!userId || !isInterviewer) return;

      const cached = getCachedData<InterviewWorkspaceDetail>(userId, cacheKey);
      if (cached && !force) {
        applyWorkspace(cached.data);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const workspace = await fetchWithUserCache(
          userId,
          cacheKey,
          () => fetchInterviewerInterviewDetail(interviewId),
          { force }
        );
        applyWorkspace(workspace);
      } catch (err) {
        if (!cached) {
          setError(formatApiErrorMessage(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [applyWorkspace, cacheKey, interviewId, isInterviewer, userId]
  );

  useEffect(() => {
    void loadInterview(false);
  }, [loadInterview]);

  const interview = detail?.interview ?? null;
  const existingResult = detail?.result ?? null;
  const lifecycle = interview
    ? getInterviewerLifecycleActions(interview.status)
    : {
        canStart: false,
        canMarkAwaitingOutcome: false,
        canRecordAttendance: false,
        canSubmitEvaluation: false,
      };

  const progressionStages = useMemo<
    Partial<Record<ProgressionStageKey, { state: ProgressionStageState; detail?: string }>>
  >(() => {
    if (!interview) return {};
    const doneOrCancelled =
      interview.status === "CANCELLED" ||
      interview.status === "INTERVIEWER_CANCELLED" ||
      interview.status === "NO_SHOW";

    const interviewState: ProgressionStageState =
      interview.status === "BOOKED" ||
      interview.status === "RESCHEDULE_PENDING" ||
      interview.status === "IN_PROGRESS"
        ? "active"
        : doneOrCancelled
          ? "attention"
          : "completed";

    const evalState: ProgressionStageState = existingResult
      ? "completed"
      : interview.status === "AWAITING_OUTCOME" || interview.status === "IN_PROGRESS"
        ? "active"
        : "upcoming";

    const certState: ProgressionStageState =
      existingResult?.outcome === "PASS" ? "active" : "upcoming";

    return {
      preparation: {
        state: "completed",
        detail: "Candidate eligibility verified prior to booking",
      },
      interview: {
        state: interviewState,
        detail: `Status: ${getBookingStatusMeta(interview.status).label}`,
      },
      evaluation: {
        state: evalState,
        detail: existingResult
          ? `Recorded: ${getOutcomeMeta(existingResult.outcome).label}`
          : "Submit PASS, FAIL, or RETAKE_LATER",
      },
      certification: {
        state: certState,
        detail:
          existingResult?.outcome === "PASS"
            ? "Queued for Operations approval"
            : "Pending passing evaluation",
      },
    };
  }, [existingResult, interview]);

  const handleStartSession = async () => {
    if (!interview) return;
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      await startInterviewSession(interview.id, {
        studentAttendance,
        interviewerAttendance,
        ...(attendanceNotes.trim() ? { notes: attendanceNotes.trim() } : {}),
        idempotencyKey: generateUuid(),
      });
      pushToast({
        tone: "success",
        title: "Interview started",
        description: `Session ${interview.booking_reference} moved to IN_PROGRESS.`,
      });
      if (userId) invalidateUserCache(userId, "interviewer:");
      await loadInterview(true);
    } catch (err) {
      setLifecycleError(formatApiErrorMessage(err));
    } finally {
      setLifecycleBusy(false);
    }
  };

  const handleMarkAwaitingOutcome = async () => {
    if (!interview) return;
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      await completeInterviewSession(interview.id, {
        studentAttendance,
        interviewerAttendance,
        ...(attendanceNotes.trim() ? { notes: attendanceNotes.trim() } : {}),
        idempotencyKey: generateUuid(),
      });
      pushToast({
        tone: "info",
        title: "Session ended",
        description: "Interview is now AWAITING_OUTCOME.",
      });
      if (userId) invalidateUserCache(userId, "interviewer:");
      await loadInterview(true);
    } catch (err) {
      setLifecycleError(formatApiErrorMessage(err));
    } finally {
      setLifecycleBusy(false);
    }
  };

  const handleSaveAttendance = async (markNoShow = false) => {
    if (!interview) return;
    setLifecycleBusy(true);
    setLifecycleError(null);
    try {
      await recordInterviewAttendance(interview.id, {
        studentAttendance: markNoShow ? "NO_SHOW" : studentAttendance,
        interviewerAttendance,
        ...(attendanceNotes.trim() ? { notes: attendanceNotes.trim() } : {}),
        markNoShow,
        idempotencyKey: generateUuid(),
      });
      setNoShowConfirmOpen(false);
      pushToast({
        tone: markNoShow ? "warning" : "success",
        title: markNoShow ? "Marked as NO_SHOW" : "Attendance updated",
        description: markNoShow
          ? `Session ${interview.booking_reference} closed as NO_SHOW.`
          : "Session attendance has been recorded.",
      });
      if (userId) invalidateUserCache(userId, "interviewer:");
      await loadInterview(true);
    } catch (err) {
      setNoShowConfirmOpen(false);
      setLifecycleError(formatApiErrorMessage(err));
    } finally {
      setLifecycleBusy(false);
    }
  };

  const retakeAfterIso =
    outcome === "RETAKE_LATER" && retakeAfterLocal
      ? new Date(retakeAfterLocal).toISOString()
      : "";

  const handleOpenConfirm = (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    const errors = validateEvaluationForm({
      outcome,
      feedback,
      retakeAfterIso,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) return;

    setConfirmOpen(true);
  };

  const handleConfirmSubmit = async () => {
    if (!interview || !outcome) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await submitInterviewEvaluation(interview.id, {
        outcome,
        ...(feedback.trim() ? { feedback: feedback.trim() } : {}),
        ...(outcome === "RETAKE_LATER" && retakeAfterIso
          ? { retakeAfter: retakeAfterIso }
          : {}),
        idempotencyKey,
      });

      setConfirmOpen(false);
      pushToast({
        tone: "success",
        title: "Evaluation submitted",
        description: `Recorded immutable ${outcome} decision for booking ${interview.booking_reference}.`,
      });
      setIdempotencyKey(generateUuid());
      if (userId) invalidateUserCache(userId, "interviewer:");
      await loadInterview(true);
    } catch (err) {
      setConfirmOpen(false);
      setSubmitError(formatApiErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const statusMeta = interview ? getBookingStatusMeta(interview.status) : null;

  return (
    <AppShell allowedRoles={["INTERVIEWER"]} sectionLabel="Interviewer Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Interviewer Portal", href: "/interviewer" },
          { label: "Schedule", href: "/interviewer/schedule" },
          { label: interview?.booking_reference ?? "Interview Session" },
        ]}
        title={detail?.badge?.name ?? "Interview Workspace"}
        description={
          interview
            ? `Booking reference ${interview.booking_reference} · Attempt #${interview.attempt_number}`
            : "Manage live session lifecycle, attendance, and final badge evaluation."
        }
      />

      {loading ? (
        <SectionSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadInterview(true)} />
      ) : !detail || !interview ? (
        <EmptyState
          title="Interview not found"
          description="This interview record does not exist or is outside your interviewer assignment scope."
          action={
            <Link
              href="/interviewer/schedule"
              className="inline-flex items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
            >
              Return to Schedule
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <GritProgressionTrack
            title="Assessment Lifecycle"
            stages={progressionStages}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            {/* Left 5 Columns: Session Details + Attendance & Lifecycle */}
            <div className="space-y-6 lg:col-span-5">
              <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-4">
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Session Details
                  </h2>
                  {statusMeta ? (
                    <StatusText label={statusMeta.label} tone={statusMeta.tone} />
                  ) : null}
                </div>

                <dl className="mt-4 space-y-3.5 text-sm">
                  <div>
                    <dt className="text-xs text-[var(--text-secondary)]">Badge</dt>
                    <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                      {detail.badge?.name ?? interview.badge_id}
                      {detail.badge?.level ? ` (${detail.badge.level})` : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-secondary)]">
                      Candidate
                    </dt>
                    <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                      {detail.student.full_name ?? "Assigned Student"}
                    </dd>
                    <dd className="font-mono text-xs text-[var(--text-secondary)]">
                      {detail.student.external_student_id ?? interview.student_id}
                      {detail.student.campus_ref
                        ? ` · ${detail.student.campus_ref}`
                        : ""}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-[var(--text-secondary)]">
                      Scheduled Window
                    </dt>
                    <dd className="mt-0.5 tabular-nums text-[var(--text-primary)]">
                      {formatTimestamp(interview.starts_at, interview.timezone)}
                    </dd>
                    <dd className="text-xs tabular-nums text-[var(--text-secondary)]">
                      Until {formatTimestamp(interview.ends_at, interview.timezone)} (
                      {interview.timezone})
                    </dd>
                  </div>
                  {detail.attendance ? (
                    <div>
                      <dt className="text-xs text-[var(--text-secondary)]">
                        Recorded Attendance
                      </dt>
                      <dd className="mt-1 flex items-center gap-2">
                        <StatusText
                          label={`Student: ${getAttendanceStatusMeta(detail.attendance.student_attendance).label}`}
                          tone={
                            getAttendanceStatusMeta(detail.attendance.student_attendance)
                              .tone
                          }
                        />
                      </dd>
                    </div>
                  ) : null}
                </dl>
              </section>

              {/* Lifecycle & Attendance Controls */}
              {!existingResult ? (
                <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                  <div className="mb-4 flex items-center gap-2 border-b border-[var(--border-hairline)] pb-3">
                    <ClipboardCheck
                      className="h-4 w-4 text-[var(--accent-primary)]"
                      aria-hidden="true"
                    />
                    <h2 className="text-base font-semibold text-[var(--text-primary)]">
                      Session Lifecycle &amp; Attendance
                    </h2>
                  </div>

                  {lifecycleError ? (
                    <div className="mb-4 rounded-md bg-[var(--status-error-bg)] p-3 text-xs text-[var(--status-error)]">
                      {lifecycleError}
                    </div>
                  ) : null}

                  {lifecycle.canRecordAttendance ? (
                    <div className="space-y-4">
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        <div>
                          <label
                            htmlFor="student-attendance-select"
                            className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                          >
                            Student Attendance
                          </label>
                          <select
                            id="student-attendance-select"
                            value={studentAttendance}
                            onChange={(e) =>
                              setStudentAttendance(e.target.value as AttendanceStatus)
                            }
                            className="min-h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                          >
                            <option value="ATTENDED">Attended</option>
                            <option value="LATE">Late</option>
                            <option value="NO_SHOW">No Show</option>
                          </select>
                        </div>
                        <div>
                          <label
                            htmlFor="interviewer-attendance-select"
                            className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                          >
                            Interviewer Attendance
                          </label>
                          <select
                            id="interviewer-attendance-select"
                            value={interviewerAttendance}
                            onChange={(e) =>
                              setInterviewerAttendance(
                                e.target.value as AttendanceStatus
                              )
                            }
                            className="min-h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                          >
                            <option value="ATTENDED">Attended</option>
                            <option value="LATE">Late</option>
                            <option value="NO_SHOW">No Show</option>
                          </select>
                        </div>
                      </div>

                      <div>
                        <label
                          htmlFor="attendance-notes"
                          className="mb-1 block text-xs font-medium text-[var(--text-secondary)]"
                        >
                          Session Notes (Optional)
                        </label>
                        <input
                          id="attendance-notes"
                          type="text"
                          value={attendanceNotes}
                          onChange={(e) => setAttendanceNotes(e.target.value)}
                          placeholder="Joined on time, audio/video verified..."
                          className="min-h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
                        />
                      </div>

                      <div className="flex flex-wrap gap-2.5 pt-1">
                        {lifecycle.canStart ? (
                          <button
                            type="button"
                            disabled={lifecycleBusy}
                            onClick={() => void handleStartSession()}
                            className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
                          >
                            <Play className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Start Interview</span>
                          </button>
                        ) : null}

                        {lifecycle.canMarkAwaitingOutcome ? (
                          <button
                            type="button"
                            disabled={lifecycleBusy}
                            onClick={() => void handleMarkAwaitingOutcome()}
                            className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>End Session (Awaiting Outcome)</span>
                          </button>
                        ) : null}

                        <button
                          type="button"
                          disabled={lifecycleBusy}
                          onClick={() => void handleSaveAttendance(false)}
                          className="inline-flex min-h-9 items-center whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-50"
                        >
                          Save Attendance
                        </button>

                        {interview.status === "BOOKED" ||
                        interview.status === "IN_PROGRESS" ? (
                          <button
                            type="button"
                            disabled={lifecycleBusy}
                            onClick={() => setNoShowConfirmOpen(true)}
                            className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-bg)] px-3 py-1.5 text-xs font-medium text-[var(--status-error)] transition-opacity hover:opacity-90 disabled:opacity-50"
                          >
                            <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                            <span>Mark No-Show</span>
                          </button>
                        ) : null}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--text-secondary)]">
                      Session lifecycle controls are locked in status{" "}
                      <strong>{interview.status}</strong>.
                    </p>
                  )}
                </section>
              ) : null}
            </div>

            {/* Right 7 Columns: Evaluation Area */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 lg:col-span-7">
              <h2 className="border-b border-[var(--border-hairline)] pb-4 text-base font-semibold text-[var(--text-primary)]">
                Badge Evaluation Decision
              </h2>

              {existingResult ? (
                <div className="mt-5 space-y-5">
                  <div className="flex items-start gap-3 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4">
                    <Lock
                      className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-secondary)]"
                      aria-hidden="true"
                    />
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        Immutable Evaluation Recorded
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                        Submitted evaluations are append-only audit records and
                        cannot be overwritten once published.
                      </p>
                    </div>
                  </div>

                  <dl className="space-y-4">
                    <div>
                      <dt className="text-xs text-[var(--text-secondary)]">
                        Outcome
                      </dt>
                      <dd className="mt-1">
                        {(() => {
                          const meta = getOutcomeMeta(existingResult.outcome);
                          return (
                            <StatusText label={meta.label} tone={meta.tone} />
                          );
                        })()}
                      </dd>
                    </div>

                    <div>
                      <dt className="text-xs text-[var(--text-secondary)]">
                        Submitted At
                      </dt>
                      <dd className="mt-0.5 text-sm tabular-nums text-[var(--text-primary)]">
                        {formatTimestamp(existingResult.submitted_at)}
                      </dd>
                    </div>

                    {existingResult.retake_after ? (
                      <div>
                        <dt className="text-xs text-[var(--text-secondary)]">
                          Retake Eligible After
                        </dt>
                        <dd className="mt-0.5 text-sm font-medium tabular-nums text-[var(--status-warning)]">
                          {formatTimestamp(existingResult.retake_after)}
                        </dd>
                      </div>
                    ) : null}

                    <div>
                      <dt className="text-xs text-[var(--text-secondary)]">
                        Published Feedback
                      </dt>
                      <dd className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-[var(--text-primary)]">
                        {existingResult.feedback || "No written feedback provided."}
                      </dd>
                    </div>
                  </dl>
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  {!lifecycle.canSubmitEvaluation ? (
                    <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4 text-xs text-[var(--text-secondary)]">
                      <p className="font-semibold text-[var(--text-primary)]">
                        Start the session to unlock evaluation submission
                      </p>
                      <p className="mt-1 leading-relaxed">
                        This interview is currently in{" "}
                        <span className="font-mono">{interview.status}</span> status.
                        {interview.status === "BOOKED"
                          ? " Click 'Start Interview' on the left when the candidate joins."
                          : " Evaluations can only be submitted for IN_PROGRESS or AWAITING_OUTCOME sessions."}
                      </p>
                    </div>
                  ) : null}

                  {submitError ? (
                    <div
                      role="alert"
                      className="rounded-md bg-[var(--status-error-bg)] px-4 py-3 text-sm text-[var(--status-error)]"
                    >
                      {submitError}
                    </div>
                  ) : null}

                  <form onSubmit={handleOpenConfirm} noValidate className="space-y-5">
                    <div>
                      <p className="text-xs font-medium text-[var(--text-secondary)]">
                        Select Outcome
                      </p>
                      <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-3">
                        {(
                          [
                            {
                              value: "PASS",
                              title: "Pass",
                              desc: "Creates CERTIFICATION_PENDING award for admin approval.",
                            },
                            {
                              value: "FAIL",
                              title: "Fail",
                              desc: "Candidate did not meet badge competency criteria.",
                            },
                            {
                              value: "RETAKE_LATER",
                              title: "Retake Later",
                              desc: "Requires retake eligibility timestamp before rebooking.",
                            },
                          ] as const
                        ).map((opt) => {
                          const selected = outcome === opt.value;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              disabled={!lifecycle.canSubmitEvaluation}
                              onClick={() => {
                                setOutcome(opt.value);
                                setIdempotencyKey(generateUuid());
                              }}
                              className={`rounded-md border p-3.5 text-left transition-colors disabled:opacity-50 ${
                                selected
                                  ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                                  : "border-[var(--border-hairline)] bg-[var(--bg-elevated)] hover:bg-[var(--bg-subtle)]"
                              }`}
                            >
                              <p className="text-sm font-semibold text-[var(--text-primary)]">
                                {opt.title}
                              </p>
                              <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                                {opt.desc}
                              </p>
                            </button>
                          );
                        })}
                      </div>
                      {fieldErrors.outcome ? (
                        <p className="mt-1.5 text-xs text-[var(--status-error)]">
                          {fieldErrors.outcome}
                        </p>
                      ) : null}
                    </div>

                    {outcome === "RETAKE_LATER" ? (
                      <div>
                        <label
                          htmlFor="eval-retake-after"
                          className="block text-xs font-medium text-[var(--text-secondary)]"
                        >
                          Retake Eligible After (Required)
                        </label>
                        <input
                          id="eval-retake-after"
                          type="datetime-local"
                          value={retakeAfterLocal}
                          onChange={(e) => {
                            setRetakeAfterLocal(e.target.value);
                            setIdempotencyKey(generateUuid());
                          }}
                          disabled={!lifecycle.canSubmitEvaluation}
                          className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm tabular-nums text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-50"
                        />
                        {fieldErrors.retakeAfter ? (
                          <p className="mt-1 text-xs text-[var(--status-error)]">
                            {fieldErrors.retakeAfter}
                          </p>
                        ) : null}
                      </div>
                    ) : null}

                    <div>
                      <div className="flex items-center justify-between">
                        <label
                          htmlFor="eval-feedback"
                          className="block text-xs font-medium text-[var(--text-secondary)]"
                        >
                          Evaluation Feedback (Optional, max 5000 chars)
                        </label>
                        <span className="text-xs tabular-nums text-[var(--text-muted)]">
                          {feedback.length}/5000
                        </span>
                      </div>
                      <textarea
                        id="eval-feedback"
                        rows={5}
                        value={feedback}
                        onChange={(e) => {
                          setFeedback(e.target.value);
                          setIdempotencyKey(generateUuid());
                        }}
                        disabled={!lifecycle.canSubmitEvaluation}
                        placeholder="Summarize technical strengths, gaps observed, and actionable guidance for the student..."
                        className="mt-1.5 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] p-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none disabled:opacity-50"
                      />
                      {fieldErrors.feedback ? (
                        <p className="mt-1 text-xs text-[var(--status-error)]">
                          {fieldErrors.feedback}
                        </p>
                      ) : null}
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t border-[var(--border-hairline)] pt-4">
                      <Link
                        href="/interviewer/schedule"
                        className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
                      >
                        Back to Schedule
                      </Link>
                      <button
                        type="submit"
                        disabled={!lifecycle.canSubmitEvaluation || submitting}
                        className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-50"
                      >
                        Review &amp; Submit Evaluation
                      </button>
                    </div>
                  </form>
                </div>
              )}
            </section>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Immutable Evaluation Submission"
        description={`You are about to record an official "${outcome}" result for booking ${interview?.booking_reference ?? ""}. Once submitted, evaluation records are append-only and cannot be edited.`}
        confirmLabel="Submit Evaluation"
        busy={submitting}
        onCancel={() => {
          if (!submitting) setConfirmOpen(false);
        }}
        onConfirm={() => void handleConfirmSubmit()}
      />

      <ConfirmDialog
        open={noShowConfirmOpen}
        title="Mark Session as NO_SHOW"
        description={`Mark booking ${interview?.booking_reference ?? ""} as NO_SHOW? This closes the session without an evaluation outcome and records an audit event.`}
        confirmLabel="Mark No-Show"
        busy={lifecycleBusy}
        onCancel={() => {
          if (!lifecycleBusy) setNoShowConfirmOpen(false);
        }}
        onConfirm={() => void handleSaveAttendance(true)}
      />
    </AppShell>
  );
}
