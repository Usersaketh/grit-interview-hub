"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Code2, RefreshCw, Search, X } from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import { PageHeader } from "@frontend/components/PageHeader";
import {
  EmptyState,
  ErrorBanner,
  SectionSkeleton,
} from "@frontend/components/SurfaceStates";
import { useAuth } from "@frontend/hooks/useAuth";
import { formatTimestamp, hasAllowedRole } from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
} from "@frontend/services/dataCache";
import { fetchAuditLogs } from "@frontend/services/hubApi";
import type { AuditLogItem } from "@frontend/types/api";

const PAGE_SIZE = 25;

const ENTITY_TYPES = [
  { value: "", label: "All Entities" },
  { value: "interview", label: "Interview" },
  { value: "interview_result", label: "Interview Result" },
  { value: "badge_award", label: "Badge Award" },
  { value: "malpractice_report", label: "Malpractice Report" },
  { value: "interviewer_invitation", label: "Interviewer Invitation" },
  { value: "profile", label: "Profile / Signup" },
];

interface AuditCache {
  items: AuditLogItem[];
  totalCount: number;
}

export function OperationsAuditView() {
  const { profile } = useAuth();
  const userId = profile?.id ?? null;
  const isStaff = Boolean(
    profile && hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])
  );

  const [entityType, setEntityType] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(0);

  const cacheKey = `ops:audit:${entityType}:${actionFilter.trim().toUpperCase()}:${searchQuery.trim()}:${page}`;
  const initialCached = userId
    ? getCachedData<AuditCache>(userId, cacheKey)?.data ?? null
    : null;

  const [items, setItems] = useState<AuditLogItem[]>(
    () => initialCached?.items ?? []
  );
  const [totalCount, setTotalCount] = useState<number>(
    () => initialCached?.totalCount ?? 0
  );
  const [loading, setLoading] = useState<boolean>(() => !initialCached);
  const [error, setError] = useState<string | null>(null);
  const [selectedDiff, setSelectedDiff] = useState<AuditLogItem | null>(null);

  const loadAudit = useCallback(
    async (force = false) => {
      if (!userId || !isStaff) return;

      const cached = getCachedData<AuditCache>(userId, cacheKey);
      if (cached && !force) {
        setItems(cached.data.items);
        setTotalCount(cached.data.totalCount);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const data = await fetchWithUserCache<AuditCache>(
          userId,
          cacheKey,
          async () => {
            const res = await fetchAuditLogs({
              ...(entityType ? { entityType } : {}),
              ...(actionFilter.trim()
                ? { action: actionFilter.trim().toUpperCase() }
                : {}),
              ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
              limit: PAGE_SIZE,
              offset: page * PAGE_SIZE,
            });
            return { items: res.items, totalCount: res.totalCount };
          },
          { force }
        );
        setItems(data.items);
        setTotalCount(data.totalCount);
      } catch (err) {
        if (!cached) {
          setError(formatApiErrorMessage(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [actionFilter, cacheKey, entityType, isStaff, page, searchQuery, userId]
  );

  useEffect(() => {
    void loadAudit(false);
  }, [loadAudit]);

  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  return (
    <AppShell
      allowedRoles={["OPERATIONS", "ADMIN"]}
      sectionLabel="Operations Portal"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Operations Portal", href: "/operations" },
          { label: "Audit History" },
        ]}
        title="Audit Explorer"
        description="Staff-only immutable audit trail across bookings, evaluations, badge certifications, malpractice governance, and invitations."
      />

      <div className="space-y-5">
        {/* Filter Toolbar */}
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap items-center gap-2.5">
            <select
              aria-label="Filter by entity type"
              value={entityType}
              onChange={(e) => {
                setEntityType(e.target.value);
                setPage(0);
              }}
              className="min-h-9 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] focus:border-[var(--accent-primary)] focus:outline-none"
            >
              {ENTITY_TYPES.map((opt) => (
                <option key={opt.value || "all"} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>

            <input
              type="text"
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(0);
              }}
              placeholder="Action (e.g. BOOKED, AWARDED)..."
              aria-label="Filter by action"
              className="min-h-9 w-48 rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2">
            <div className="relative flex-1 sm:w-64">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-[var(--text-muted)]"
                aria-hidden="true"
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(0);
                }}
                placeholder="Search actor, entity ID, reason..."
                aria-label="Search audit events"
                className="min-h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadAudit(true)}
              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Audit Table */}
        {loading ? (
          <SectionSkeleton rows={6} />
        ) : error ? (
          <ErrorBanner message={error} onRetry={() => void loadAudit(true)} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No audit events matched"
            description="Adjust your entity type, action, or search filters to view recorded audit history."
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)]">
                    <th className="px-4 py-3">Timestamp</th>
                    <th className="px-4 py-3">Actor</th>
                    <th className="px-4 py-3">Action &amp; Entity</th>
                    <th className="px-4 py-3">Reason / Summary</th>
                    <th className="px-4 py-3 text-right">Payload</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {items.map((item) => (
                    <tr
                      key={item.id}
                      className="transition-colors hover:bg-[var(--bg-elevated)]"
                    >
                      <td className="px-4 py-3.5 align-top text-xs tabular-nums text-[var(--text-secondary)]">
                        {formatTimestamp(item.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <p className="text-xs font-medium text-[var(--text-primary)]">
                          {item.actorName ?? "System"}
                        </p>
                        <p className="text-[11px] text-[var(--text-muted)]">
                          {item.actorEmail ?? item.actorId?.slice(0, 8) ?? "system"}
                        </p>
                      </td>
                      <td className="px-4 py-3.5 align-top">
                        <span className="inline-block rounded bg-[var(--bg-elevated)] px-2 py-0.5 font-mono text-[11px] font-semibold text-[var(--text-primary)]">
                          {item.action}
                        </span>
                        <p className="mt-1 font-mono text-[11px] text-[var(--text-secondary)]">
                          {item.entityType} · {item.entityId.slice(0, 8)}…
                        </p>
                      </td>
                      <td className="max-w-xs px-4 py-3.5 align-top text-xs text-[var(--text-secondary)]">
                        {item.reason || "—"}
                      </td>
                      <td className="px-4 py-3.5 text-right align-top">
                        <button
                          type="button"
                          onClick={() => setSelectedDiff(item)}
                          className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-2.5 py-1 text-xs font-medium text-[var(--accent-text)] transition-colors hover:bg-[var(--bg-subtle)]"
                        >
                          <Code2 className="h-3.5 w-3.5" aria-hidden="true" />
                          <span>Diff</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination Footer */}
            <div className="flex items-center justify-between border-t border-[var(--border-hairline)] px-4 py-3 text-xs text-[var(--text-secondary)]">
              <span className="tabular-nums">
                Showing {page * PAGE_SIZE + 1}–
                {Math.min((page + 1) * PAGE_SIZE, totalCount)} of {totalCount} events
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  disabled={page === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-2.5 py-1 font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                >
                  <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                  <span>Previous</span>
                </button>
                <span className="tabular-nums">
                  Page {page + 1} of {totalPages}
                </span>
                <button
                  type="button"
                  disabled={page + 1 >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="inline-flex items-center gap-1 whitespace-nowrap rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-2.5 py-1 font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)] disabled:opacity-40"
                >
                  <span>Next</span>
                  <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* JSON Diff Modal */}
      {selectedDiff ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/65 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="audit-diff-title"
        >
          <div className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)]">
            <div className="flex items-center justify-between border-b border-[var(--border-hairline)] px-5 py-4">
              <div>
                <h2
                  id="audit-diff-title"
                  className="text-base font-semibold text-[var(--text-primary)]"
                >
                  {selectedDiff.entityType} · {selectedDiff.action}
                </h2>
                <p className="font-mono text-xs text-[var(--text-secondary)]">
                  Entity {selectedDiff.entityId} ·{" "}
                  {formatTimestamp(selectedDiff.createdAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedDiff(null)}
                aria-label="Close payload diff"
                className="rounded p-1.5 text-[var(--text-secondary)] transition-colors hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-4 overflow-y-auto p-5 md:grid-cols-2">
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                  Previous Value
                </p>
                <pre className="overflow-x-auto rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-3 font-mono text-[11px] text-[var(--text-primary)]">
                  {selectedDiff.previousValue
                    ? JSON.stringify(selectedDiff.previousValue, null, 2)
                    : "null (Initial creation)"}
                </pre>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-semibold text-[var(--text-secondary)]">
                  New Value
                </p>
                <pre className="overflow-x-auto rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-3 font-mono text-[11px] text-[var(--text-primary)]">
                  {selectedDiff.newValue
                    ? JSON.stringify(selectedDiff.newValue, null, 2)
                    : "null"}
                </pre>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}
