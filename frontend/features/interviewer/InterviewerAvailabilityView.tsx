"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
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
  DAY_OF_WEEK_LABELS,
  formatDayOfWeek,
  formatTimeShort,
  hasAllowedRole,
  isInterviewUpcoming,
  validateAvailabilityForm,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
  invalidateUserCache,
} from "@frontend/services/dataCache";
import {
  createInterviewerAvailability,
  deleteInterviewerAvailability,
  fetchInterviewerAvailability,
  fetchOwnInterviewerRow,
  fetchScopedInterviews,
  updateInterviewerAvailability,
} from "@frontend/services/hubApi";
import type {
  InterviewRecord,
  InterviewerAvailabilityRecord,
} from "@frontend/types/api";

interface AvailabilityCache {
  windows: InterviewerAvailabilityRecord[];
  interviews: InterviewRecord[];
  defaultTimezone: string | null;
}

const CACHE_KEY = "interviewer:availability";

function getTodayDateString(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function InterviewerAvailabilityView() {
  const { profile } = useAuth();
  const { pushToast } = useToast();
  const userId = profile?.id ?? null;
  const isInterviewer = Boolean(
    profile && hasAllowedRole(profile.roles, ["INTERVIEWER"])
  );

  const initialCached = userId
    ? getCachedData<AvailabilityCache>(userId, CACHE_KEY)?.data ?? null
    : null;

  const [windows, setWindows] = useState<InterviewerAvailabilityRecord[]>(
    () => initialCached?.windows ?? []
  );
  const [interviews, setInterviews] = useState<InterviewRecord[]>(
    () => initialCached?.interviews ?? []
  );
  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const editingIdRef = useRef<string | null>(null);
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [startTime, setStartTime] = useState<string>("09:00");
  const [endTime, setEndTime] = useState<string>("12:00");
  const [timezone, setTimezone] = useState<string>(
    () => initialCached?.defaultTimezone ?? "Asia/Kolkata"
  );
  const [effectiveFrom, setEffectiveFrom] = useState<string>(() =>
    getTodayDateString()
  );
  const [effectiveUntil, setEffectiveUntil] = useState<string>("");
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [deleteTarget, setDeleteTarget] =
    useState<InterviewerAvailabilityRecord | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    editingIdRef.current = editingId;
  }, [editingId]);

  const applyPayload = useCallback((payload: AvailabilityCache) => {
    setWindows(payload.windows);
    setInterviews(payload.interviews);
    if (payload.defaultTimezone && !editingIdRef.current) {
      setTimezone(payload.defaultTimezone);
    }
  }, []);

  const loadData = useCallback(
    async (force = false) => {
      if (!userId || !isInterviewer) return;

      const cached = getCachedData<AvailabilityCache>(userId, CACHE_KEY);
      if (cached && !force) {
        applyPayload(cached.data);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const result = await fetchWithUserCache<AvailabilityCache>(
          userId,
          CACHE_KEY,
          async () => {
            const [ownInterviewer, availRows, allInterviews] = await Promise.all([
              fetchOwnInterviewerRow(userId).catch(() => null),
              fetchInterviewerAvailability(),
              fetchScopedInterviews().catch(() => [] as InterviewRecord[]),
            ]);
            return {
              windows: availRows,
              interviews: ownInterviewer
                ? allInterviews.filter((i) => i.interviewer_id === ownInterviewer.id)
                : allInterviews,
              defaultTimezone: ownInterviewer?.default_timezone ?? null,
            };
          },
          { force }
        );
        applyPayload(result);
      } catch (err) {
        if (!cached) {
          setError(formatApiErrorMessage(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [applyPayload, isInterviewer, userId]
  );

  useEffect(() => {
    void loadData(false);
  }, [loadData]);

  const upcomingCountByWeekday = useMemo(() => {
    const counts = new Map<number, number>();
    for (const item of interviews) {
      if (!isInterviewUpcoming(item)) continue;
      const day = new Date(item.starts_at).getDay();
      counts.set(day, (counts.get(day) ?? 0) + 1);
    }
    return counts;
  }, [interviews]);

  const resetForm = () => {
    setEditingId(null);
    editingIdRef.current = null;
    setDayOfWeek(1);
    setStartTime("09:00");
    setEndTime("12:00");
    setEffectiveFrom(getTodayDateString());
    setEffectiveUntil("");
    setFieldErrors({});
    setSubmitError(null);
  };

  const handleStartEdit = (record: InterviewerAvailabilityRecord) => {
    setEditingId(record.id);
    editingIdRef.current = record.id;
    setDayOfWeek(record.day_of_week);
    setStartTime(formatTimeShort(record.start_time));
    setEndTime(formatTimeShort(record.end_time));
    setTimezone(record.timezone);
    setEffectiveFrom(record.effective_from);
    setEffectiveUntil(record.effective_until ?? "");
    setFieldErrors({});
    setSubmitError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitError(null);

    const validationErrors = validateAvailabilityForm({
      dayOfWeek,
      startTime,
      endTime,
      timezone,
      effectiveFrom,
      effectiveUntil: effectiveUntil.trim() || undefined,
    });
    setFieldErrors(validationErrors);
    if (Object.keys(validationErrors).length > 0) return;

    setSaving(true);
    try {
      const payload = {
        dayOfWeek,
        startTime,
        endTime,
        timezone: timezone.trim(),
        effectiveFrom,
        ...(effectiveUntil.trim() ? { effectiveUntil: effectiveUntil.trim() } : {}),
      };

      if (editingId) {
        await updateInterviewerAvailability(editingId, payload);
        pushToast({
          tone: "success",
          title: "Availability window updated",
          description: `${formatDayOfWeek(dayOfWeek)} ${startTime}–${endTime} (${timezone.trim()})`,
        });
      } else {
        await createInterviewerAvailability(payload);
        pushToast({
          tone: "success",
          title: "Availability window created",
          description: `${formatDayOfWeek(dayOfWeek)} ${startTime}–${endTime} (${timezone.trim()})`,
        });
      }

      if (userId) {
        invalidateUserCache(userId, "interviewer:");
      }
      resetForm();
      await loadData(true);
    } catch (err) {
      setSubmitError(formatApiErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteInterviewerAvailability(deleteTarget.id);
      pushToast({
        tone: "success",
        title: "Availability window deleted",
        description: `${formatDayOfWeek(deleteTarget.day_of_week)} ${formatTimeShort(deleteTarget.start_time)}–${formatTimeShort(deleteTarget.end_time)} removed.`,
      });
      if (editingId === deleteTarget.id) {
        resetForm();
      }
      setDeleteTarget(null);
      if (userId) {
        invalidateUserCache(userId, "interviewer:");
      }
      await loadData(true);
    } catch (err) {
      pushToast({
        tone: "error",
        title: "Failed to delete window",
        description: formatApiErrorMessage(err),
      });
    } finally {
      setDeleting(false);
    }
  };

  const sortedWindows = useMemo(
    () =>
      [...windows].sort((a, b) => {
        if (a.day_of_week !== b.day_of_week) return a.day_of_week - b.day_of_week;
        return a.start_time.localeCompare(b.start_time);
      }),
    [windows]
  );

  return (
    <AppShell allowedRoles={["INTERVIEWER"]} sectionLabel="Interviewer Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Interviewer Portal", href: "/interviewer" },
          { label: "Availability" },
        ]}
        title="Recurring Availability Windows"
        description="Publish weekly time blocks when you are available to conduct live badge interviews. Overlapping windows are rejected automatically."
      />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Form Panel */}
        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 lg:col-span-5">
          <div className="mb-4 flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
            <h2 className="text-base font-semibold text-[var(--text-primary)]">
              {editingId ? "Edit Availability Window" : "Add Availability Window"}
            </h2>
            {editingId ? (
              <button
                type="button"
                onClick={resetForm}
                className="whitespace-nowrap text-xs font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:underline"
              >
                Cancel Edit
              </button>
            ) : null}
          </div>

          <form onSubmit={handleSubmit} noValidate className="space-y-4">
            {submitError ? (
              <div
                role="alert"
                className="rounded-md bg-[var(--status-error-bg)] px-3.5 py-2.5 text-xs text-[var(--status-error)]"
              >
                {submitError}
              </div>
            ) : null}

            <div>
              <label
                htmlFor="avail-day"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                Day of Week
              </label>
              <select
                id="avail-day"
                value={dayOfWeek}
                onChange={(e) => setDayOfWeek(Number(e.target.value))}
                className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              >
                {DAY_OF_WEEK_LABELS.map((label, idx) => (
                  <option key={label} value={idx}>
                    {label}
                  </option>
                ))}
              </select>
              {fieldErrors.dayOfWeek ? (
                <p className="mt-1 text-xs text-[var(--status-error)]">
                  {fieldErrors.dayOfWeek}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="avail-start"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Start Time (24h)
                </label>
                <input
                  id="avail-start"
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm tabular-nums text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
                {fieldErrors.startTime ? (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {fieldErrors.startTime}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="avail-end"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  End Time (24h)
                </label>
                <input
                  id="avail-end"
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm tabular-nums text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
                {fieldErrors.endTime ? (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {fieldErrors.endTime}
                  </p>
                ) : null}
              </div>
            </div>

            <div>
              <label
                htmlFor="avail-tz"
                className="block text-xs font-medium text-[var(--text-secondary)]"
              >
                IANA Timezone
              </label>
              <input
                id="avail-tz"
                type="text"
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                placeholder="Asia/Kolkata"
                className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
              {fieldErrors.timezone ? (
                <p className="mt-1 text-xs text-[var(--status-error)]">
                  {fieldErrors.timezone}
                </p>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label
                  htmlFor="avail-from"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Effective From
                </label>
                <input
                  id="avail-from"
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm tabular-nums text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
                {fieldErrors.effectiveFrom ? (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {fieldErrors.effectiveFrom}
                  </p>
                ) : null}
              </div>

              <div>
                <label
                  htmlFor="avail-until"
                  className="block text-xs font-medium text-[var(--text-secondary)]"
                >
                  Effective Until (Optional)
                </label>
                <input
                  id="avail-until"
                  type="date"
                  value={effectiveUntil}
                  onChange={(e) => setEffectiveUntil(e.target.value)}
                  className="mt-1.5 min-h-10 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-2 text-sm tabular-nums text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
                />
                {fieldErrors.effectiveUntil ? (
                  <p className="mt-1 text-xs text-[var(--status-error)]">
                    {fieldErrors.effectiveUntil}
                  </p>
                ) : null}
              </div>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="inline-flex min-h-10 w-full items-center justify-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
            >
              <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>
                {saving
                  ? "Saving..."
                  : editingId
                    ? "Save Availability Changes"
                    : "Publish Availability Window"}
              </span>
            </button>
          </form>
        </section>

        {/* Existing Windows List */}
        <section className="lg:col-span-7">
          {loading ? (
            <SectionSkeleton rows={5} />
          ) : error ? (
            <ErrorBanner message={error} onRetry={() => void loadData(true)} />
          ) : sortedWindows.length === 0 ? (
            <EmptyState
              title="No availability windows configured"
              description="Use the form on the left to add recurring weekly hours when students can book interviews."
            />
          ) : (
            <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
              <div className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-5 py-3">
                <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                  Configured Weekly Windows ({sortedWindows.length})
                </h2>
              </div>
              <div className="divide-y divide-[var(--border-hairline)]">
                {sortedWindows.map((win) => {
                  const weekdayBookings =
                    upcomingCountByWeekday.get(win.day_of_week) ?? 0;
                  const isEditingThis = editingId === win.id;
                  return (
                    <div
                      key={win.id}
                      className={`flex flex-col gap-3 px-5 py-4 transition-colors sm:flex-row sm:items-center sm:justify-between ${
                        isEditingThis ? "bg-[var(--accent-soft)]" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-3">
                          <p className="text-sm font-semibold text-[var(--text-primary)]">
                            {formatDayOfWeek(win.day_of_week)}
                          </p>
                          <span className="font-mono text-xs font-medium tabular-nums text-[var(--text-primary)]">
                            {formatTimeShort(win.start_time)} –{" "}
                            {formatTimeShort(win.end_time)}
                          </span>
                          <StatusText
                            label={win.is_active ? "Active" : "Inactive"}
                            tone={win.is_active ? "success" : "neutral"}
                          />
                        </div>
                        <p className="mt-1 text-xs text-[var(--text-secondary)]">
                          {win.timezone} · Effective{" "}
                          <span className="tabular-nums">
                            {win.effective_from}
                          </span>
                          {win.effective_until ? (
                            <span className="tabular-nums">
                              {" "}
                              through {win.effective_until}
                            </span>
                          ) : (
                            " onward"
                          )}
                          {weekdayBookings > 0 ? (
                            <span className="text-[var(--accent-text)]">
                              {" "}
                              · {weekdayBookings} upcoming weekday booking
                              {weekdayBookings === 1 ? "" : "s"}
                            </span>
                          ) : null}
                        </p>
                      </div>

                      <div className="flex shrink-0 items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleStartEdit(win)}
                          className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
                        >
                          <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Edit</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setDeleteTarget(win)}
                          className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-bg)] px-3 py-1.5 text-xs font-medium text-[var(--status-error)] transition-opacity hover:opacity-90"
                        >
                          <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Availability Window"
        description={
          deleteTarget
            ? `Remove your ${formatDayOfWeek(deleteTarget.day_of_week)} (${formatTimeShort(deleteTarget.start_time)}–${formatTimeShort(deleteTarget.end_time)}) availability window? Existing booked interviews remain unaffected.`
            : ""
        }
        confirmLabel="Delete Window"
        destructive
        busy={deleting}
        onCancel={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        onConfirm={() => void handleConfirmDelete()}
      />
    </AppShell>
  );
}
