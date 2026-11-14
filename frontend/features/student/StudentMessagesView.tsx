"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  Check,
  Loader2,
  MailCheck,
  MailOpen,
  RefreshCw,
} from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import { PageHeader } from "@frontend/components/PageHeader";
import { StatusText } from "@frontend/components/StatusText";
import {
  EmptyState,
  ErrorBanner,
  SectionSkeleton,
} from "@frontend/components/SurfaceStates";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import { formatTimestamp, hasAllowedRole } from "@frontend/lib/domain";
import { formatStoredNotificationMessage } from "@frontend/lib/studentMessages";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
  invalidateUserCache,
} from "@frontend/services/dataCache";
import {
  fetchStudentNotifications,
  markStudentNotificationRead,
} from "@frontend/services/hubApi";
import type { NotificationRecord } from "@frontend/types/api";

const CACHE_KEY = "student:notifications";

export function StudentMessagesView() {
  const { profile } = useAuth();
  const { pushToast } = useToast();
  const userId = profile?.id ?? null;
  const isStudent = Boolean(
    profile && hasAllowedRole(profile.roles, ["STUDENT"])
  );

  const [notifications, setNotifications] = useState<NotificationRecord[]>(() =>
    userId
      ? (getCachedData<NotificationRecord[]>(userId, CACHE_KEY)?.data ?? [])
      : []
  );
  const [loading, setLoading] = useState<boolean>(() =>
    userId ? !getCachedData<NotificationRecord[]>(userId, CACHE_KEY) : true
  );
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);

  const loadNotifications = useCallback(
    async (force = false) => {
      if (!userId || !isStudent) return;

      const cached = getCachedData<NotificationRecord[]>(userId, CACHE_KEY);
      if (cached && !force) {
        setNotifications(cached.data);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      if (force) setRefreshing(true);
      setError(null);
      try {
        const data = await fetchWithUserCache(
          userId,
          CACHE_KEY,
          fetchStudentNotifications,
          { force }
        );
        setNotifications(data);
      } catch (err) {
        if (!cached) {
          setError(formatApiErrorMessage(err));
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [isStudent, userId]
  );

  useEffect(() => {
    void loadNotifications(false);
  }, [loadNotifications]);

  const handleMarkRead = async (notificationId: string) => {
    setMarkingId(notificationId);
    try {
      const updated = await markStudentNotificationRead(notificationId);
      setNotifications((prev) =>
        prev.map((item) => (item.id === notificationId ? updated : item))
      );
      if (userId) invalidateUserCache(userId, "student:");
    } catch (err) {
      pushToast({
        tone: "error",
        title: "Could not mark message as read",
        description: formatApiErrorMessage(err),
      });
    } finally {
      setMarkingId(null);
    }
  };

  const unreadCount = notifications.filter((n) => !n.read_at).length;

  return (
    <AppShell allowedRoles={["STUDENT"]} sectionLabel="Student Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Student Portal", href: "/student" },
          { label: "Messages" },
        ]}
        title="Student Messages"
        description={
          unreadCount > 0
            ? `${unreadCount} unread message(s) across booking confirmations, published interview outcomes, and badge awards.`
            : "Official GRIT notifications for interview bookings, published evaluation results, and approved badge awards."
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={refreshing}
              onClick={() => void loadNotifications(true)}
              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-60"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
                aria-hidden="true"
              />
              <span>{refreshing ? "Refreshing..." : "Refresh"}</span>
            </button>
            <Link
              href="/student/journey-preview"
              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
            >
              <span>Journey Preview (Demo)</span>
            </Link>
          </div>
        }
      />

      {loading ? (
        <SectionSkeleton rows={4} />
      ) : error ? (
        <ErrorBanner
          message={error}
          onRetry={() => void loadNotifications(true)}
        />
      ) : notifications.length === 0 ? (
        <EmptyState
          title="No messages yet"
          description="Your booking confirmations, evaluation outcomes, and badge award notices will appear here automatically."
          action={
            <div className="flex flex-wrap justify-center gap-2.5">
              <Link
                href="/student/interviews/book"
                className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3.5 py-2 text-xs font-medium text-white hover:bg-[var(--accent-primary-hover)]"
              >
                <span>Book Interview</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
              <Link
                href="/student/journey-preview"
                className="inline-flex min-h-9 items-center whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
              >
                Inspect Demo Messages
              </Link>
            </div>
          }
        />
      ) : (
        <div className="space-y-4">
          {notifications.map((item) => {
            const formatted = formatStoredNotificationMessage({
              type: item.type,
              payload: item.payload ?? {},
              fallbackStudentName: profile?.full_name,
            });
            const isUnread = !item.read_at;
            const interviewId =
              typeof item.payload?.interview_id === "string"
                ? item.payload.interview_id
                : null;
            const isAward = item.type === "CERTIFICATION_AWARDED";

            return (
              <article
                key={item.id}
                className={`rounded-lg border p-5 transition-colors ${
                  isUnread
                    ? "border-[var(--accent-primary)]/50 bg-[var(--bg-surface)]"
                    : "border-[var(--border-hairline)] bg-[var(--bg-surface)]"
                }`}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[var(--border-hairline)] pb-3">
                  <div className="flex items-start gap-2.5">
                    {isUnread ? (
                      <MailCheck
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]"
                        aria-hidden="true"
                      />
                    ) : (
                      <MailOpen
                        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--text-muted)]"
                        aria-hidden="true"
                      />
                    )}
                    <div>
                      <h2 className="text-base font-semibold text-[var(--text-primary)]">
                        {formatted.subject}
                      </h2>
                      <p className="mt-0.5 font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                        {formatTimestamp(item.sent_at ?? item.created_at)} ·{" "}
                        {item.delivery_channel}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2.5">
                    <StatusText
                      label={isUnread ? "Unread" : "Read"}
                      tone={isUnread ? "info" : "neutral"}
                    />
                    {isUnread ? (
                      <button
                        type="button"
                        disabled={markingId === item.id}
                        onClick={() => void handleMarkRead(item.id)}
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] disabled:opacity-60"
                      >
                        {markingId === item.id ? (
                          <Loader2
                            className="h-3 w-3 animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <Check className="h-3 w-3" aria-hidden="true" />
                        )}
                        <span>Mark Read</span>
                      </button>
                    ) : null}
                  </div>
                </div>

                <pre className="mt-4 whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text-primary)]">
                  {formatted.body}
                </pre>

                <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-[var(--border-hairline)] pt-3 text-xs">
                  {interviewId ? (
                    <Link
                      href={`/student/interviews/${interviewId}`}
                      className="inline-flex items-center gap-1 font-medium text-[var(--accent-text)] hover:underline"
                    >
                      <span>Open Interview Record</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  ) : null}
                  {isAward ? (
                    <Link
                      href="/student/badges"
                      className="inline-flex items-center gap-1 font-medium text-[var(--accent-text)] hover:underline"
                    >
                      <span>View Awarded Badge</span>
                      <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                    </Link>
                  ) : null}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
