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
  Layers,
  Lock,
  MailCheck,
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
  fetchWithUserCache,
  getCachedData,
  invalidateUserCache,
} from "@frontend/services/dataCache";
import {
  bookStudentInterview,
  fetchBookableInterviewers,
  fetchBookableSlots,
  fetchStudentOverview,
} from "@frontend/services/hubApi";
import type {
  BookableInterviewerSummary,
  BookableSlot,
  InterviewRecord,
  SlotsDiscoveryResponse,
  StudentOverviewResponse,
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

  const userId = profile?.id ?? null;
  const isAuthorized = Boolean(
    profile && hasAllowedRole(profile.roles, ["STUDENT"])
  );

  const initialBadgeId = searchParams.get("badgeId") ?? "";

  const [overview, setOverview] = useState<StudentOverviewResponse | null>(() =>
    userId
      ? (getCachedData<StudentOverviewResponse>(userId, "student:overview")
          ?.data ?? null)
      : null
  );
  const [loadingCatalog, setLoadingCatalog] = useState<boolean>(() =>
    userId
      ? !getCachedData<StudentOverviewResponse>(userId, "student:overview")
      : true
  );
  const [catalogError, setCatalogError] = useState<string | null>(null);

  const [selectedTrackId, setSelectedTrackId] = useState<string>("ALL");
  const [badgeId, setBadgeId] = useState(initialBadgeId);

  const [interviewers, setInterviewers] = useState<
    BookableInterviewerSummary[]
  >([]);
  const [loadingInterviewers, setLoadingInterviewers] = useState(false);
  const [selectedInterviewerId, setSelectedInterviewerId] =
    useState<string>("ALL");

  const [durationMinutes, setDurationMinutes] = useState(45);
  const [timezone, setTimezone] = useState("Asia/Kolkata");
  const [rangeDays, setRangeDays] = useState(14);

  const [slotsResponse, setSlotsResponse] =
    useState<SlotsDiscoveryResponse | null>(null);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [slotsError, setSlotsError] = useState<string | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<BookableSlot | null>(null);

  const [submitError, setSubmitError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [bookedInterview, setBookedInterview] =
    useState<InterviewRecord | null>(null);

  const [idempotencyState, setIdempotencyState] = useState<{
    signature: string;
    key: string;
  }>({ signature: "", key: "" });

  const loadCatalog = useCallback(
    async (force = false) => {
      if (!userId || !isAuthorized) return;

      const cached = getCachedData<StudentOverviewResponse>(
        userId,
        "student:overview"
      );
      if (cached && !force) {
        setOverview(cached.data);
        setLoadingCatalog(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoadingCatalog(true);
      }

      setCatalogError(null);
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
          setCatalogError(formatApiErrorMessage(err));
        }
      } finally {
        setLoadingCatalog(false);
      }
    },
    [isAuthorized, userId]
  );

  useEffect(() => {
    void loadCatalog(false);
  }, [loadCatalog]);

  const tracks = useMemo(() => overview?.tracks ?? [], [overview?.tracks]);
  const badges = useMemo(
    () => (overview?.badges ?? []).filter((b) => b.is_active),
    [overview?.badges]
  );

  // Sync default badge and track selection once overview loads
  useEffect(() => {
    if (badges.length === 0) return;

    if (initialBadgeId) {
      const requested = badges.find((b) => b.id === initialBadgeId);
      if (requested) {
        setBadgeId((prev) => prev || requested.id);
        setSelectedTrackId((prev) =>
          prev === "ALL" ? requested.track_id : prev
        );
        return;
      }
    }

    if (!badgeId) {
      const firstEligible = badges.find(
        (b) => overview?.eligibilities[b.id]?.eligible
      );
      const chosen = firstEligible ?? badges[0];
      setBadgeId(chosen.id);
    }
  }, [badgeId, badges, initialBadgeId, overview?.eligibilities]);

  const visibleBadges = useMemo(() => {
    if (selectedTrackId === "ALL") return badges;
    return badges.filter((b) => b.track_id === selectedTrackId);
  }, [badges, selectedTrackId]);

  const selectedTrack = useMemo(
    () => tracks.find((t) => t.id === selectedTrackId) ?? null,
    [selectedTrackId, tracks]
  );

  const selectedBadge = useMemo(
    () => badges.find((b) => b.id === badgeId) ?? null,
    [badgeId, badges]
  );

  const selectedBadgeTrack = useMemo(
    () =>
      selectedBadge
        ? (tracks.find((t) => t.id === selectedBadge.track_id) ?? null)
        : null,
    [selectedBadge, tracks]
  );

  const eligibility = useMemo(
    () => (badgeId && overview ? (overview.eligibilities[badgeId] ?? null) : null),
    [badgeId, overview]
  );

  const skillRequirementRows = useMemo(() => {
    if (!overview || !badgeId) return [];
    const skillMap = new Map(overview.skills.map((s) => [s.id, s]));
    const progressMap = new Map(
      overview.skillProgress.map((p) => [p.skill_id, p])
    );
    const now = new Date();
    return overview.requiredSkills
      .filter((r) => r.badge_id === badgeId)
      .map((req) => {
        const skill = skillMap.get(req.skill_id);
        const progress = progressMap.get(req.skill_id);
        const verified =
          Boolean(progress?.verified_at) &&
          new Date(progress!.verified_at!) <= now &&
          progress!.achieved_level >= req.required_level;
        return {
          skillId: req.skill_id,
          skillName: skill?.name ?? req.skill_id,
          requiredLevel: req.required_level,
          achievedLevel: progress?.achieved_level ?? 0,
          verified,
        };
      });
  }, [badgeId, overview]);

  const loadDirectory = useCallback(
    async (targetBadgeId: string) => {
      if (!userId || !isAuthorized || !isValidUuid(targetBadgeId)) {
        setInterviewers([]);
        return;
      }

      const cachedDir = getCachedData<BookableInterviewerSummary[]>(
        userId,
        `student:dir:${targetBadgeId}`
      );
      if (cachedDir) {
        setInterviewers(cachedDir.data);
        setLoadingInterviewers(false);
        if (!cachedDir.isStale) return;
      } else {
        setLoadingInterviewers(true);
      }

      try {
        const dir = await fetchWithUserCache(
          userId,
          `student:dir:${targetBadgeId}`,
          () => fetchBookableInterviewers(targetBadgeId)
        );
        setInterviewers(dir);
      } catch {
        if (!cachedDir) setInterviewers([]);
      } finally {
        setLoadingInterviewers(false);
      }
    },
    [isAuthorized, userId]
  );

  useEffect(() => {
    setSelectedInterviewerId("ALL");
    setSelectedSlot(null);
    void loadDirectory(badgeId);
  }, [badgeId, loadDirectory]);

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
            s.interviewerId === prev.interviewerId &&
            s.startsAt === prev.startsAt
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
      if (userId) {
        invalidateUserCache(userId, "student:");
      }
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
        description="Browse certification tracks, inspect required skill eligibility, choose an approved assessor, and select an open slot."
      />

      {bookedInterview ? (
        <section
          aria-label="Booking confirmation"
          className="rounded-lg border border-[var(--status-success)]/30 bg-[var(--bg-surface)] p-6"
        >
          <div className="flex items-start gap-3">
            <CheckCircle2
              className="mt-0.5 h-5 w-5 shrink-0 text-[var(--status-success)]"
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">
                Your GRIT interview is confirmed
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
                  className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)]"
                >
                  <span>View Interview Details</span>
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </Link>
                <Link
                  href="/student/messages"
                  className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
                >
                  <MailCheck className="h-4 w-4" aria-hidden="true" />
                  <span>View Confirmation Message</span>
                </Link>
                <Link
                  href="/student/interviews"
                  className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
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

            {/* Step 1: Track & Badge Selection */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono text-[11px] font-semibold text-[var(--accent-text)]">
                    01
                  </span>
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    Select Track &amp; Target Badge
                  </h2>
                </div>
                <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)]">
                  <Layers className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>
                    {tracks.length} tracks · {badges.length} badges
                  </span>
                </span>
              </div>

              {loadingCatalog ? (
                <div className="mt-4">
                  <SectionSkeleton rows={3} />
                </div>
              ) : catalogError ? (
                <div className="mt-4">
                  <ErrorBanner
                    message={catalogError}
                    onRetry={() => void loadCatalog(true)}
                  />
                </div>
              ) : badges.length === 0 ? (
                <div className="mt-4">
                  <EmptyState
                    title="No active badges available"
                    description="No active badges are currently published for interview scheduling."
                  />
                </div>
              ) : (
                <div className="mt-4 space-y-4">
                  {/* Track Filter Tabs */}
                  {tracks.length > 0 ? (
                    <div>
                      <div
                        role="tablist"
                        aria-label="Filter badges by certification track"
                        className="flex flex-wrap gap-1.5"
                      >
                        <button
                          type="button"
                          role="tab"
                          aria-selected={selectedTrackId === "ALL"}
                          onClick={() => setSelectedTrackId("ALL")}
                          className={`min-h-8 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                            selectedTrackId === "ALL"
                              ? "bg-[var(--accent-primary)] text-white"
                              : "border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                          }`}
                        >
                          All Tracks ({badges.length})
                        </button>
                        {tracks.map((track) => {
                          const count = badges.filter(
                            (b) => b.track_id === track.id
                          ).length;
                          const active = selectedTrackId === track.id;
                          return (
                            <button
                              key={track.id}
                              type="button"
                              role="tab"
                              aria-selected={active}
                              onClick={() => {
                                setSelectedTrackId(track.id);
                                const firstInTrack = badges.find(
                                  (b) => b.track_id === track.id
                                );
                                if (
                                  firstInTrack &&
                                  selectedBadge?.track_id !== track.id
                                ) {
                                  setBadgeId(firstInTrack.id);
                                }
                              }}
                              className={`min-h-8 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                                active
                                  ? "bg-[var(--accent-primary)] text-white"
                                  : "border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                              }`}
                            >
                              {track.name} ({count})
                            </button>
                          );
                        })}
                      </div>

                      {selectedTrack?.description ? (
                        <p className="mt-2.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                          {selectedTrack.description}
                        </p>
                      ) : null}
                    </div>
                  ) : null}

                  {/* Badges Grid */}
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {visibleBadges.map((b) => {
                      const active = b.id === badgeId;
                      const badgeElig = overview?.eligibilities[b.id];
                      const badgeTrack = tracks.find(
                        (t) => t.id === b.track_id
                      );
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setBadgeId(b.id)}
                          className={`flex flex-col justify-between rounded-md border p-4 text-left transition-colors ${
                            active
                              ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                              : "border-[var(--border-hairline)] bg-[var(--bg-canvas)]/40 hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
                          }`}
                        >
                          <div>
                            <div className="flex items-start justify-between gap-2">
                              <p className="text-sm font-semibold text-[var(--text-primary)]">
                                {b.name}
                              </p>
                              {badgeElig?.eligible ? (
                                <StatusText label="Eligible" tone="success" />
                              ) : (
                                <StatusText label="Locked" tone="neutral" />
                              )}
                            </div>
                            <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                              {b.level}
                              {badgeTrack ? ` · ${badgeTrack.name}` : ""}
                            </p>
                            {b.description ? (
                              <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-[var(--text-muted)]">
                                {b.description}
                              </p>
                            ) : null}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </section>

            {/* Step 2: Interviewer Directory */}
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono text-[11px] font-semibold text-[var(--accent-text)]">
                    02
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
                  className={`whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    selectedInterviewerId === "ALL"
                      ? "bg-[var(--accent-primary)] text-white"
                      : "border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  Any Available Interviewer
                </button>
              </div>

              {eligibility && !eligibility.eligible ? (
                <div className="mt-4 flex items-start gap-2.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-3.5 text-xs text-[var(--text-secondary)]">
                  <Lock
                    className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                  <span>
                    Booking for <strong>{selectedBadge?.name}</strong> is locked
                    until required skill clearances are verified. You can preview
                    assessors below or switch to an eligible badge above.
                  </span>
                </div>
              ) : null}

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
                    const selected =
                      selectedInterviewerId === inv.interviewer_id;
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
                            : "border-[var(--border-hairline)] bg-[var(--bg-canvas)]/40 hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
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
                            <p className="mt-2 font-mono text-[11px] text-[var(--text-muted)]">
                              {inv.expertise_tags.join(" · ")}
                            </p>
                          ) : null}
                        </div>

                        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border-hairline)] pt-2.5 text-xs text-[var(--text-secondary)]">
                          <span>{inv.default_timezone}</span>
                          <span className="tabular-nums">
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
                <div className="flex items-center gap-2.5">
                  <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] font-mono text-[11px] font-semibold text-[var(--accent-text)]">
                    03
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
                    className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value={30}>30 min</option>
                    <option value={45}>45 min</option>
                    <option value={60}>60 min</option>
                  </select>

                  <select
                    aria-label="Booking lookahead window"
                    value={rangeDays}
                    onChange={(e) => setRangeDays(Number(e.target.value))}
                    className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    <option value={7}>Next 7 days</option>
                    <option value={14}>Next 14 days</option>
                    <option value={21}>Next 21 days</option>
                  </select>

                  <select
                    aria-label="Display timezone"
                    value={timezone}
                    onChange={(e) => setTimezone(e.target.value)}
                    className="min-h-9 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)] px-2.5 py-1.5 text-xs text-[var(--text-primary)]"
                  >
                    {COMMON_TIMEZONES.map((tz) => (
                      <option key={tz} value={tz}>
                        {tz}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    disabled={loadingSlots}
                    onClick={() => void loadSlots()}
                    aria-label="Refresh available slots"
                    className="inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-60"
                  >
                    <RefreshCw
                      className={`h-3.5 w-3.5 ${loadingSlots ? "animate-spin" : ""}`}
                      aria-hidden="true"
                    />
                    <span>{loadingSlots ? "Refreshing..." : "Refresh"}</span>
                  </button>
                </div>
              </div>

              {slotsResponse?.studentState.hasActiveBooking ? (
                <div
                  role="alert"
                  className="mt-4 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)] p-4 text-xs text-[var(--text-primary)]"
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
                <div className="mt-4 rounded-md border border-[var(--status-warning)]/30 bg-[var(--status-warning-bg)] p-3 text-xs text-[var(--text-primary)]">
                  Retake cooldown active: available slots are filtered after{" "}
                  <span className="font-medium tabular-nums">
                    {formatTimestamp(
                      slotsResponse.studentState.retakeAfter,
                      timezone
                    )}
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
                        <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                          {group.slots.length} open
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
                        {group.slots.map((slot) => {
                          const isSelected =
                            selectedSlot?.interviewerId ===
                              slot.interviewerId &&
                            selectedSlot?.startsAt === slot.startsAt;
                          return (
                            <button
                              key={`${slot.interviewerId}:${slot.startsAt}`}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={`rounded-md border p-3 text-left transition-colors ${
                                isSelected
                                  ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
                                  : "border-[var(--border-hairline)] bg-[var(--bg-canvas)]/40 hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)]"
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
                {loadingCatalog ? (
                  <p className="text-xs text-[var(--text-secondary)]">
                    Checking required skill clearances...
                  </p>
                ) : eligibility ? (
                  <div className="space-y-3">
                    <StatusText
                      label={
                        eligibility.eligible
                          ? "Eligible to book"
                          : "Not eligible"
                      }
                      tone={eligibility.eligible ? "success" : "error"}
                    />
                    <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                      {eligibility.reason}
                    </p>

                    {skillRequirementRows.length > 0 ? (
                      <div className="space-y-1.5 border-t border-[var(--border-hairline)] pt-3">
                        <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--text-muted)]">
                          Required Skill Clearances
                        </p>
                        {skillRequirementRows.map((row) => (
                          <div
                            key={row.skillId}
                            className="flex items-center justify-between gap-2 rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-2.5 py-1.5 text-xs"
                          >
                            <span className="truncate font-medium text-[var(--text-primary)]">
                              {row.skillName}
                            </span>
                            <span
                              className={`shrink-0 font-mono text-[11px] tabular-nums ${
                                row.verified
                                  ? "text-[var(--status-success)]"
                                  : "text-[var(--text-muted)]"
                              }`}
                            >
                              L{row.achievedLevel}/L{row.requiredLevel}
                            </span>
                          </div>
                        ))}
                      </div>
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
                  <dt className="text-[var(--text-secondary)]">Track</dt>
                  <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                    {selectedBadgeTrack?.name ?? "Select a badge"}
                  </dd>
                </div>
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
                  className="inline-flex min-h-10 w-full items-center justify-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {eligibility && !eligibility.eligible
                    ? "Complete Required Skills to Book"
                    : "Review & Confirm Booking"}
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
