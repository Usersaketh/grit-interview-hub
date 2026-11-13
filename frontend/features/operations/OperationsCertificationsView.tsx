"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, RefreshCw, Search, ShieldCheck } from "lucide-react";
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
  formatTimestamp,
  generateUuid,
  getCertificationStatusMeta,
  hasAllowedRole,
} from "@frontend/lib/domain";
import { formatApiErrorMessage } from "@frontend/services/apiClient";
import {
  fetchWithUserCache,
  getCachedData,
  invalidateUserCache,
} from "@frontend/services/dataCache";
import {
  approveBadgeCertification,
  fetchBadgeCertifications,
} from "@frontend/services/hubApi";
import type {
  BadgeCertificationQueueRow,
  CertificationStatus,
} from "@frontend/types/api";

const FILTER_TABS: Array<{ id: "ALL" | CertificationStatus; label: string }> = [
  { id: "CERTIFICATION_PENDING", label: "Pending Approval" },
  { id: "AWARDED", label: "Awarded" },
  { id: "NULLIFIED", label: "Nullified" },
  { id: "REINSTATED", label: "Reinstated" },
  { id: "ALL", label: "All Records" },
];

export function OperationsCertificationsView() {
  const { profile } = useAuth();
  const { pushToast } = useToast();
  const userId = profile?.id ?? null;
  const isStaff = Boolean(
    profile && hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])
  );

  const [statusFilter, setStatusFilter] = useState<
    "ALL" | CertificationStatus
  >("CERTIFICATION_PENDING");
  const [searchQuery, setSearchQuery] = useState("");
  const cacheKey = `ops:certifications:${statusFilter}:${searchQuery.trim()}`;

  const [rows, setRows] = useState<BadgeCertificationQueueRow[]>(() =>
    userId
      ? (getCachedData<BadgeCertificationQueueRow[]>(userId, cacheKey)?.data ??
        [])
      : []
  );
  const [loading, setLoading] = useState<boolean>(() =>
    userId ? !getCachedData<BadgeCertificationQueueRow[]>(userId, cacheKey) : true
  );
  const [error, setError] = useState<string | null>(null);

  const [approveTarget, setApproveTarget] =
    useState<BadgeCertificationQueueRow | null>(null);
  const [approveIdemKey, setApproveIdemKey] = useState(() => generateUuid());
  const [approving, setApproving] = useState(false);

  const loadQueue = useCallback(
    async (force = false) => {
      if (!userId || !isStaff) return;

      const cached = getCachedData<BadgeCertificationQueueRow[]>(
        userId,
        cacheKey
      );
      if (cached && !force) {
        setRows(cached.data);
        setLoading(false);
        if (!cached.isStale) return;
      } else if (!cached) {
        setLoading(true);
      }

      setError(null);
      try {
        const data = await fetchWithUserCache(
          userId,
          cacheKey,
          () =>
            fetchBadgeCertifications({
              ...(statusFilter !== "ALL" ? { status: statusFilter } : {}),
              ...(searchQuery.trim() ? { search: searchQuery.trim() } : {}),
            }),
          { force }
        );
        setRows(data);
      } catch (err) {
        if (!cached) {
          setError(formatApiErrorMessage(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [cacheKey, isStaff, searchQuery, statusFilter, userId]
  );

  useEffect(() => {
    void loadQueue(false);
  }, [loadQueue]);

  const handleConfirmApprove = async () => {
    if (!approveTarget) return;
    setApproving(true);
    try {
      const award = await approveBadgeCertification(
        approveTarget.id,
        approveIdemKey
      );
      setApproveTarget(null);
      setApproveIdemKey(generateUuid());
      pushToast({
        tone: "success",
        title: "Certification approved",
        description: `${approveTarget.student_name}'s ${approveTarget.badge_name} award transitioned to ${award.status}.`,
      });
      if (userId) invalidateUserCache(userId, "ops:");
      await loadQueue(true);
    } catch (err) {
      setApproveTarget(null);
      pushToast({
        tone: "error",
        title: "Approval failed",
        description: formatApiErrorMessage(err),
      });
    } finally {
      setApproving(false);
    }
  };

  return (
    <AppShell
      allowedRoles={["OPERATIONS", "ADMIN"]}
      sectionLabel="Operations Portal"
    >
      <PageHeader
        breadcrumbs={[
          { label: "Operations Portal", href: "/operations" },
          { label: "Certifications" },
        ]}
        title="Certification Approval Queue"
        description="Inspect passed badge evaluations awaiting administrative sign-off and review issued, nullified, or reinstated awards."
      />

      <div className="space-y-5">
        {/* Toolbar */}
        <div className="flex flex-col gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-wrap gap-2">
            {FILTER_TABS.map((tab) => {
              const active = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setStatusFilter(tab.id)}
                  className={`min-h-9 whitespace-nowrap rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                    active
                      ? "bg-[var(--accent-primary)] text-white"
                      : "border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]"
                  }`}
                >
                  {tab.label}
                </button>
              );
            })}
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
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search student, badge, booking..."
                aria-label="Search certification queue"
                className="min-h-9 w-full rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] py-1.5 pl-8 pr-3 text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--accent-primary)] focus:outline-none"
              />
            </div>

            <button
              type="button"
              onClick={() => void loadQueue(true)}
              className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Queue Table */}
        {loading ? (
          <SectionSkeleton rows={6} />
        ) : error ? (
          <ErrorBanner message={error} onRetry={() => void loadQueue(true)} />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No certifications in this view"
            description={
              statusFilter === "CERTIFICATION_PENDING"
                ? "There are currently no pending badge certifications awaiting approval."
                : "No certification records matched your active filters."
            }
          />
        ) : (
          <div className="overflow-hidden rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-xs font-medium text-[var(--text-secondary)]">
                    <th className="px-4 py-3">Student</th>
                    <th className="px-4 py-3">Badge &amp; Track</th>
                    <th className="px-4 py-3">Evaluation</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-hairline)]">
                  {rows.map((row) => {
                    const meta = getCertificationStatusMeta(row.status);
                    const isPending = row.status === "CERTIFICATION_PENDING";
                    return (
                      <tr
                        key={row.id}
                        className="transition-colors hover:bg-[var(--bg-elevated)]"
                      >
                        <td className="px-4 py-3.5 align-top">
                          <p className="font-medium text-[var(--text-primary)]">
                            {row.student_name}
                          </p>
                          <p className="mt-0.5 font-mono text-xs text-[var(--text-secondary)]">
                            {row.external_student_id}
                            {row.campus_ref ? ` · ${row.campus_ref}` : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <p className="font-medium text-[var(--text-primary)]">
                            {row.badge_name} ({row.badge_level})
                          </p>
                          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                            {row.track_name}
                            {row.booking_reference
                              ? ` · ${row.booking_reference}`
                              : ""}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-top text-xs text-[var(--text-secondary)]">
                          <p>{row.evaluator_name ?? "Assessor"}</p>
                          <p className="mt-0.5 tabular-nums text-[var(--text-muted)]">
                            {formatTimestamp(row.submitted_at ?? row.created_at)}
                          </p>
                        </td>
                        <td className="px-4 py-3.5 align-top">
                          <StatusText label={meta.label} tone={meta.tone} />
                        </td>
                        <td className="px-4 py-3.5 text-right align-top">
                          <div className="inline-flex items-center gap-2">
                            {isPending ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setApproveIdemKey(generateUuid());
                                  setApproveTarget(row);
                                }}
                                className="inline-flex items-center gap-1 whitespace-nowrap rounded bg-[var(--accent-primary)] px-2.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                              >
                                <ShieldCheck
                                  className="h-3.5 w-3.5"
                                  aria-hidden="true"
                                />
                                <span>Approve</span>
                              </button>
                            ) : null}
                            <Link
                              href={`/operations/certifications/${row.id}`}
                              className="inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium text-[var(--accent-text)] hover:underline"
                            >
                              <span>Inspect</span>
                              <ArrowRight
                                className="h-3.5 w-3.5"
                                aria-hidden="true"
                              />
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={approveTarget !== null}
        title="Approve Badge Certification"
        description={
          approveTarget
            ? `Approve ${approveTarget.badge_name} (${approveTarget.badge_level}) for ${approveTarget.student_name}? This transitions the award from CERTIFICATION_PENDING to AWARDED and generates an append-only audit entry.`
            : ""
        }
        confirmLabel="Approve Certification"
        busy={approving}
        onCancel={() => {
          if (!approving) setApproveTarget(null);
        }}
        onConfirm={() => void handleConfirmApprove()}
      />
    </AppShell>
  );
}
