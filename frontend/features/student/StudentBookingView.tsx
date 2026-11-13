"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  Globe,
  RefreshCw,
  UserCheck,
} from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import { ConfirmDialog } from "@frontend/components/ConfirmDialog";
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
  formatDayOfWeek,
  formatTimestamp,
  generateUuid,
  groupBookableSlotsByDate,
  hasAllowedRole,
  isValidUuid,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  bookStudentInterview,
  fetchBadgeEligibility,
  fetchBadgesCatalog,
  fetchBookableInterviewers,
  fetchBookableSlots,
} from "@frontend/services/hubApi";
import type {
  BadgeSummary,
  BookableInterviewerSummary,
  BookableSlot,
  EligibilityDecision,
  InterviewRecord,
  SlotsDiscoveryResponse,
} from "@frontend/types/api";

const COMMON_TIMEZONES = [
  "Asia/Kolkata",
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Asia/Singapore",
];

function formatSlotTimeLabel(iso: string, timezone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || undefined,
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return new Date(iso).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
  }
}

export function StudentBookingView() {
  const searchParams = useSearchParams();
  const { profile } = useAuth();
  const { pushToast } = useToast();

  const initialBadgeId = searchParams.get("badgeId") ?? "";

  const [badges, setBadges] = useState<BadgeSummary[]>([]);
  const [loadingBadges, setLoadingBadges] = useState(true);
  const [badgeId, setBadgeId] = useState(initialBadgeId);

  const [eligibility, setEligibility] = useState<EligibilityDecision | null>(null);
  const [checkingEligibility, setCheckingEligibility] = useState(false);
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);

  const [interviewers, setInterviewers] = useState<BookableInterviewerSummary[]>([]);
  const [loadingInterviewers, setLoadingInterviewers] = useState(false);
  const [selectedInterviewerId, setSelectedInterviewerId] = useState<string>("ALL");

  const [durationMinutes, setDurationMinutes] = useState(45);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [rangeDays, setRangeDays] = useState(14);

  const [slotsResponse, setSlotsResponse] = useState<SlotsDiscoveryResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookableSlot | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookedInterview, setBookedInterview] = useState<InterviewRecord | null>(null);

  const [idempotencyState, setIdempotencyState] = useState<{
    signature: string;
    key: string;
  }>({ signature: "", key: "" });

  const isAuthorized = Boolean(
    profile && hasAllowedRole(profile.roles, ["STUDENT"])
  );

  useEffect(() => {
    if (!isAuthorized) return;
    let active = true;
    setLoadingBadges(true);
    fetchBadgesCatalog()
      .then((list) => {
        if (!active) return;
        const activeList = list.filter((b) => b.is_active);
        setBadges(activeList);
        if (!initialBadgeId && activeList.length > 0) {
          setBadgeId(activeList[0].id);
        }
      })
      .catch(() => {
        // Fallback handled if empty
      })
      .finally(() => {
        if (active) setLoadingBadges(false);
      });
    return () => {
      active = false;
    };
  }, [initialBadgeId, isAuthorized]);

  const loadEligibilityAndDirectory = useCallback(async (targetBadgeId: string) => {
    if (!isAuthorized || !isValidUuid(targetBadgeId)) {
      setEligibility(null);
      setInterviewers([]);
      return;
    }
    setCheckingEligibility(true);
    setLoadingInterviewers(true);
    setEligibilityError(null);
    try {
      const [elig, dir] = await Promise.all([
        fetchBadgeEligibility(targetBadgeId),
        fetchBookableInterviewers(targetBadgeId),
      ]);
      setEligibility(elig);
      setInterviewers(dir);
    } catch (err) {
      setEligibility(null);
      setEligibilityError(formatApiErrorMessage(err));
    } finally {
      setCheckingEligibility(false);
      setLoadingInterviewers(false);
    }
  }, [isAuthorized]);

  useEffect(() => {
    setSelectedInterviewerId("ALL");
    setSelectedSlot(null);
    void loadEligibilityAndDirectory(badgeId);
  }, [badgeId, loadEligibilityAndDirectory]);

  const loadSlots = useCallback(async () => {
    if (!isAuthorized || !isValidUuid(badgeId)) {
      setSlotsResponse(null);
      return;
    }
    setLoadingSlots(true);
    setSlotsError(null);
    try {
      const from = new Date();
      const to = new Date(from.getTime() + rangeDays * 24 * 60 * 60 * 1000);
      const res = await fetchBookableSlots({
        badgeId,
        interviewerId:
          selectedInterviewerId !== "ALL" ? selectedInterviewerId : undefined,
        from: from.toISOString(),
        to: to.toISOString(),
        durationMinutes,
      });
      setSlotsResponse(res);
      setSelectedSlot((prev) =>
        prev &&
        res.slots.some(
          (s) =>
            s.interviewerId === prev.interviewerId && s.startsAt === prev.startsAt
        )
          ? prev
          : null
      );
    } catch (err) {
      setSlotsError(formatApiErrorMessage(err));
    } finally {
      setLoadingSlots(false);
    }
  }, [badgeId, durationMinutes, isAuthorized, rangeDays, selectedInterviewerId]);

  useEffect(() => {
    void loadSlots();
  }, [loadSlots]);

  const groupedSlots = useMemo(
    () => groupBookableSlotsByDate(slotsResponse?.slots ?? [], timezone),
    [slotsResponse?.slots, timezone]
  );

  const selectedBadge = badges.find((b) => b.id === badgeId) ?? null;

  const getIdempotencyKeyForPayload = (signature: string): string => {
    if (idempotencyState.signature === signature && idempotencyState.key) {
      return idempotencyState.key;
    }
    const newKey = generateUuid();
    setIdempotencyState({ signature, key: newKey });
    return newKey;
  };

  const canBook =
    Boolean(selectedSlot) &&
    Boolean(eligibility?.eligible) &&
    !slotsResponse?.studentState.hasActiveBooking;

  const handleConfirmBooking = async () => {
    if (!selectedSlot || !isValidUuid(badgeId)) return;

    const signature = JSON.stringify({
      badgeId,
      interviewerId: selectedSlot.interviewerId,
      startsAt: selectedSlot.startsAt,
      endsAt: selectedSlot.endsAt,
      timezone,
    });
    const key = getIdempotencyKeyForPayload(signature);

    setSubmitting(true);
    setSubmitError(null);
    try {
      const created = await bookStudentInterview({
        badgeId,
        interviewerId: selectedSlot.interviewerId,
        startsAt: selectedSlot.startsAt,
        endsAt: selectedSlot.endsAt,
        timezone,
        idempotencyKey: key,
      });
      setBookedInterview(created);
      setConfirmOpen(false);
      pushToast({
        title: "Interview confirmed",
        description: `Booking reference ${created.booking_reference}`,
        tone: "success",
      });
    } catch (err) {
      setConfirmOpen(false);
      const message = formatApiErrorMessage(err);
      setSubmitError(message);
      pushToast({
        title: "Booking failed",
        description: message,
        tone: "error",
      });
      void loadSlots();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AppShell allowedRoles={["STUDENT"]} sectionLabel="Student Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Student Portal", href: "/student" },
          { label: "Book Interview" },
        ]}
        title="Book Badge Interview"
        description="Verify your badge eligibility, choose an approved assessor, and select an open slot."
      />

      {bookedInterview ? (
        <section
          aria-label="Booking confirmation"
          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-success)]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Your interview is confirmed
              </h2>
              <p className="mt-1 text-sm text-[var(--text-secondary)]">
                Booking Reference:{" "}
                <span className="font-mono font-medium text-[var(--text-primary)]">
                  {bookedInterview.booking_reference}
                </span>
              </p>

              <dl className="mt-4 grid grid-cols-1 gap-4 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-3">
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Scheduled Start
                  </dt>
                  <dd className="mt-1 text-sm font-medium tabular-nums text-[var(--text-primary)]">
                    {formatTimestamp(
                      bookedInterview.starts_at,
                      bookedInterview.timezone
                    )}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Assessor
                  </dt>
                  <dd className="mt-1 text-sm font-medium text-[var(--text-primary)]">
                    {selectedSlot?.interviewerName ?? "Assigned Interviewer"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Attempt
                  </dt>
                  <dd className="mt-1 text-sm font-medium tabular-nums text-[var(--text-primary)]">
                    Attempt #{bookedInterview.attempt_number}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  href={`/student/interviews/${bookedInterview.id}`}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)]"
                >
                  <span>View Interview Details</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/student/interviews"
                  className="inline-flex min-h-10 items-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                >
                  My Interviews
                </Link>
              </div>
            </div>
          </div>
        </section>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left 8 Columns: Guided Step-by-Step Booking */}
          <div className="space-y-6 lg:col-span-8">
            {submitError ? (
              <ErrorBanner title="Booking rejected" message={submitError} />
            ) : null}

            {/* Step 1: Badge Selection */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
              <div className="flex items-center gap-2">
                <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-text)]">
                  1
                </span>
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Select Target Badge
                </h2>
              </div>

              {loadingBadges ? (
                <div className="mt-4">
                  <SectionSkeleton rows={2} />
                </div>
              ) : badges.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No active badges available"
                    description="No active badges are currently published for interview scheduling."
                  />
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {badges.map((b) => {
                    const active = b.id === badgeId;
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setBadgeId(b.id)}
                        className={`rounded-md border p-4 text-left transition-colors ${
                          active
                            ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                            : "border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]"
                        }`}
                      >
                        <p className="text-sm font-semibold text-[var(--text-primary)]">
                          {b.name}
                        </p>
                        <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                          {b.level} {b.external_id ? `· ${b.external_id}` : ""}
                        </p>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Step 2: Interviewer Directory */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-text)]">
                    2
                  </span>
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Choose an Interviewer
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setSelectedInterviewerId("ALL");
                    setSelectedSlot(null);
                  }}
                  className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedInterviewerId === "ALL"
                      ? "bg-[var(--accent-primary)] text-white"
                      : "border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  Any Available Interviewer
                </button>
              </div>

              {loadingInterviewers ? (
                <div className="mt-4">
                  <SectionSkeleton rows={3} />
                </div>
              ) : interviewers.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No active interviewers available"
                    description="No active interviewers are currently configured for this badge."
                  />
                </div>
              ) : (
                <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                  {interviewers.map((inv) => {
                    const selected = selectedInterviewerId === inv.interviewer_id;
                    return (
                      <button
                        key={inv.interviewer_id}
                        type="button"
                        onClick={() => {
                          setSelectedInterviewerId(inv.interviewer_id);
                          setSelectedSlot(null);
                        }}
                        className={`flex flex-col justify-between rounded-md border p-4 text-left transition-colors ${
                          selected
                            ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                            : "border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]"
                        }`}
                      >
                        <div>
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <p className="text-sm font-semibold text-[var(--text-primary)]">
                                {inv.display_name}
                              </p>
                              <p className="text-xs text-[var(--text-secondary)]">
                                {inv.title}
                              </p>
                            </div>
                            <UserCheck
                              className={`h-4 w-4 shrink-0 ${
                                selected
                                  ? "text-[var(--accent-primary)]"
                                  : "text-[var(--text-muted)]"
                              }`}
                              aria-hidden="true"
                            />
                          </div>

                          {inv.bio ? (
                            <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                              {inv.bio}
                            </p>
                          ) : null}

                          {inv.expertise_tags.length > 0 ? (
                            <p className="mt-2 text-xs font-medium text-[var(--text-muted)]">
                              {inv.expertise_tags.join(" · ")}
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-2.5 text-xs text-[var(--text-secondary)]">
                          <span>{inv.default_timezone}</span>
                          <span>
                            {inv.availability_summary.length > 0
                              ? inv.availability_summary
                                  .slice(0, 2)
                                  .map(
                                    (w) =>
                                      `${formatDayOfWeek(w.day_of_week).slice(0, 3)} ${w.start_time}–${w.end_time}`
                                  )
                                  .join(", ")
                              : `${inv.weekly_windows_count} weekly windows`}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              )}
            </section>

            {/* Step 3: Available Time Slots */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-2">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-soft)] text-xs font-semibold text-[var(--accent-text)]">
                    3
                  </span>
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Pick an Available Time Slot
                  </h2>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Session duration"
                    value={durationMinutes}
                    onChange={(e) => {
                      setDurationMinutes(Number(e.target.value));
                      setSelectedSlot(null);
                    }}
                    className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                  </select>

                  <select
                    aria-label="Booking lookahead window"
                    value={rangeDays}
                    onChange={(e) => setRangeDays(Number(e.target.value))}
                    className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value={7}>Next 7 days</option>
                    <option value={14}>Next 14 days</option>
                    <option value={21}>Next 21 days</option>
                  </select>

                  <select
                    aria-label="Display timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => void loadSlots()}
                    aria-label="Refresh available slots"
                    className="inline-flex min-h-9 items-center gap-1 rounded-md border border-[var(--border-hairline)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                  >
                    <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Refresh</span>
                  </button>
                </div>
              </div>

              {slotsResponse?.studentState.hasActiveBooking ? (
                <div
                  role="alert"
                  className="mt-4 rounded-md border border-[var(--border-hairline)] bg-[var(--status-warning-bg)] p-4 text-xs text-[var(--text-primary)]"
                >
                  You already have an active interview booking for this badge.{" "}
                  {slotsResponse.studentState.activeBookingId ? (
                    <Link
                      href={`/student/interviews/${slotsResponse.studentState.activeBookingId}`}
                      className="font-semibold text-[var(--accent-text)] underline"
                    >
                      Manage or reschedule existing booking
                    </Link>
                  ) : null}
                </div>
              ) : null}

              {slotsResponse?.studentState.retakeAfter &&
              new Date(slotsResponse.studentState.retakeAfter) > new Date() ? (
                <div className="mt-4 rounded-md border border-[var(--border-hairline)] bg-[var(--status-warning-bg)] p-3 text-xs text-[var(--text-primary)]">
                  Retake cooldown active: available slots are filtered after{" "}
                  <span className="font-medium tabular-nums">
                    {formatTimestamp(slotsResponse.studentState.retakeAfter, timezone)}
                  </span>
                  .
                </div>
              ) : null}

              {loadingSlots ? (
                <div className="mt-4">
                  <SectionSkeleton rows={4} />
                </div>
              ) : slotsError ? (
                <div className="mt-4">
                  <ErrorBanner message={slotsError} onRetry={loadSlots} />
                </div>
              ) : groupedSlots.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No open slots in this window"
                    description="Try expanding the lookahead window to 21 days or choosing 'Any Available Interviewer'."
                  />
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  {groupedSlots.map((group) => (
                    <div key={group.dateKey}>
                      <div className="mb-2.5 flex items-center gap-2 border-b border-[var(--border-hairline)] pb-1.5">
                        <CalendarClock
                          className="h-3.5 w-3.5 text-[var(--accent-primary)]"
                          aria-hidden="true"
                        />
                        <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                          {group.dateLabel}
                        </h3>
                        <span className="text-xs text-[var(--text-muted)]">
                          ({group.slots.length} open)
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                        {group.slots.map((slot) => {
                          const isSelected =
                            selectedSlot?.interviewerId === slot.interviewerId &&
                            selectedSlot?.startsAt === slot.startsAt;
                          return (
                            <button
                              key={`${slot.interviewerId}:${slot.startsAt}`}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={`rounded-md border p-3 text-left transition-colors ${
                                isSelected
                                  ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                                  : "border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-elevated)]"
                              }`}
                            >
                              <p className="text-xs font-semibold tabular-nums text-[var(--text-primary)]">
                                {formatSlotTimeLabel(slot.startsAt, timezone)} –{" "}
                                {formatSlotTimeLabel(slot.endsAt, timezone)}
                              </p>
                              <p className="mt-1 truncate text-xs text-[var(--text-secondary)]">
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
            </section>
          </div>

          {/* Right 4 Columns: Live Eligibility & Booking Summary */}
          <aside className="space-y-4 lg:col-span-4">
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Eligibility Verification
              </h2>
              <div className="mt-3">
                {checkingEligibility ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Checking required skill clearances...
                  </p>
                ) : eligibilityError ? (
                  <p className="text-xs text-[var(--status-error)]">
                    {eligibilityError}
                  </p>
                ) : eligibility ? (
                  <div className="space-y-2">
                    <StatusText
                      label={
                        eligibility.eligible ? "Eligible to book" : "Not eligible"
                      }
                      tone={eligibility.eligible ? "success" : "error"}
                    />
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      {eligibility.reason}
                    </p>
                    {eligibility.unmetSkillIds.length > 0 ? (
                      <p className="font-mono text-xs text-[var(--text-muted)]">
                        Unmet skills: {eligibility.unmetSkillIds.join(", ")}
                      </p>
                    ) : null}
                  </div>
                ) : (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Select a badge to verify skill eligibility.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Booking Summary
              </h2>
              <dl className="mt-3 space-y-3 text-xs">
                <div>
                  <dt className="text-[var(--text-secondary)]">Badge</dt>
                  <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                    {selectedBadge
                      ? `${selectedBadge.name} (${selectedBadge.level})`
                      : "Not selected"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[var(--text-secondary)]">Assessor</dt>
                  <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                    {selectedSlot
                      ? `${selectedSlot.interviewerName} · ${selectedSlot.interviewerTitle}`
                      : "Select a slot to assign interviewer"}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-[var(--text-secondary)]">
                    <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Selected Time ({timezone})</span>
                  </dt>
                  <dd className="mt-0.5 font-medium tabular-nums text-[var(--text-primary)]">
                    {selectedSlot
                      ? `${formatTimestamp(selectedSlot.startsAt, timezone)} (${selectedSlot.durationMinutes} min)`
                      : "No slot selected"}
                  </dd>
                </div>
                <div>
                  <dt className="flex items-center gap-1 text-[var(--text-secondary)]">
                    <Globe className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Booking Timezone</span>
                  </dt>
                  <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                    {timezone}
                  </dd>
                </div>
              </dl>

              <div className="mt-5 border-t border-[var(--border-hairline)] pt-4">
                <button
                  type="button"
                  disabled={!canBook}
                  onClick={() => setConfirmOpen(true)}
                  className="inline-flex min-h-10 w-full items-center justify-center rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Review & Confirm Booking
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Confirm Interview Booking"
        description={
          selectedSlot
            ? `Confirm ${selectedBadge?.name ?? "badge"} interview with ${selectedSlot.interviewerName} on ${formatTimestamp(selectedSlot.startsAt, timezone)} (${timezone})?`
            : ""
        }
        confirmLabel="Confirm Booking"
        busy={submitting}
        onConfirm={() => void handleConfirmBooking()}
        onCancel={() => {
          if (!submitting) setConfirmOpen(false);
        }}
      />
    </AppShell>
  );
}
