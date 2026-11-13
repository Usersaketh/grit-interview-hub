"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";
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
  fetchBadgeCertificationDetail,
} from "@frontend/services/hubApi";
import type { BadgeCertificationDetail } from "@frontend/types/api";

export function OperationsCertificationDetailView({
  awardId,
}: {
  awardId: string;
}) {
  const { profile } = useAuth();
  const { pushToast } = useToast();
  const userId = profile?.id ?? null;
  const isStaff = Boolean(
    profile && hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])
  );
  const cacheKey = `ops:certification:${awardId}`;

  const [detail, setDetail] = useState<BadgeCertificationDetail | null>(() =>
    userId
      ? (getCachedData<BadgeCertificationDetail>(userId, cacheKey)?.data ?? null)
      : null
  );
  const [loading, setLoading] = useState<boolean>(() =>
    userId ? !getCachedData<BadgeCertificationDetail>(userId, cacheKey) : true
  );
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [approving, setApproving] = useState(false);
  const [idemKey, setIdemKey] = useState(() => generateUuid());

  const loadDetail = useCallback(
    async (force = false) => {
      if (!userId || !isStaff) return;

      const cached = getCachedData<BadgeCertificationDetail>(userId, cacheKey);
      if (cached && !force) {
        setDetail(cached.data);
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
          () => fetchBadgeCertificationDetail(awardId),
          { force }
        );
        setDetail(data);
      } catch (err) {
        if (!cached) {
          setError(formatApiErrorMessage(err));
        }
      } finally {
        setLoading(false);
      }
    },
    [awardId, cacheKey, isStaff, userId]
  );

  useEffect(() => {
    void loadDetail(false);
  }, [loadDetail]);

  const progressionStages = useMemo<
    Partial<
      Record<ProgressionStageKey, { state: ProgressionStageState; detail?: string }>
    >
  >(() => {
    if (!detail) return {};
    const certState: ProgressionStageState =
      detail.status === "CERTIFICATION_PENDING"
        ? "active"
        : detail.status === "NULLIFIED"
          ? "attention"
          : "completed";
    return {
      preparation: {
        state: "completed",
        detail: "Skill clearances satisfied",
      },
      interview: {
        state: "completed",
        detail: detail.booking_reference
          ? `Session ${detail.booking_reference}`
          : "Live interview completed",
      },
      evaluation: {
        state: "completed",
        detail: `Passed · ${detail.evaluator_name ?? "Assessor"}`,
      },
      certification: {
        state: certState,
        detail: getCertificationStatusMeta(detail.status).label,
      },
    };
  }, [detail]);

  const handleApprove = async () => {
    if (!detail) return;
    setApproving(true);
    try {
      const updated = await approveBadgeCertification(detail.id, idemKey);
      setConfirmOpen(false);
      setIdemKey(generateUuid());
      pushToast({
        tone: "success",
        title: "Certification approved",
        description: `Award transitioned to ${updated.status}.`,
      });
      if (userId) invalidateUserCache(userId, "ops:");
      await loadDetail(true);
    } catch (err) {
      setConfirmOpen(false);
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
          { label: "Certifications", href: "/operations/certifications" },
          { label: detail?.external_student_id ?? "Award Detail" },
        ]}
        title={
          detail
            ? `${detail.badge_name} (${detail.badge_level})`
            : "Certification Detail"
        }
        description={
          detail
            ? `${detail.student_name} · ${detail.external_student_id}`
            : "Inspect badge award dossier, evaluation summary, and certification lifecycle."
        }
        actions={
          detail?.status === "CERTIFICATION_PENDING" ? (
            <button
              type="button"
              onClick={() => setConfirmOpen(true)}
              className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
            >
              <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>Approve Certification</span>
            </button>
          ) : null
        }
      />

      {loading ? (
        <SectionSkeleton rows={6} />
      ) : error ? (
        <ErrorBanner message={error} onRetry={() => void loadDetail(true)} />
      ) : !detail ? (
        <EmptyState
          title="Certification record not found"
          description="No badge award matched this identifier."
          action={
            <Link
              href="/operations/certifications"
              className="inline-flex items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
            >
              Back to Certifications
            </Link>
          }
        />
      ) : (
        <div className="space-y-6">
          <GritProgressionTrack
            title="Certification Governance Track"
            stages={progressionStages}
          />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 lg:col-span-7">
              <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-4">
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  Award &amp; Candidate Dossier
                </h2>
                <StatusText
                  label={getCertificationStatusMeta(detail.status).label}
                  tone={getCertificationStatusMeta(detail.status).tone}
                />
              </div>

              <dl className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">Student</dt>
                  <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                    {detail.student_name}
                  </dd>
                  <dd className="font-mono text-xs text-[var(--text-secondary)]">
                    {detail.external_student_id}
                    {detail.campus_ref ? ` · ${detail.campus_ref}` : ""}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Track &amp; Badge
                  </dt>
                  <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                    {detail.badge_name} ({detail.badge_level})
                  </dd>
                  <dd className="text-xs text-[var(--text-secondary)]">
                    {detail.track_name}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Award UUID
                  </dt>
                  <dd className="mt-0.5 break-all font-mono text-xs text-[var(--text-primary)]">
                    {detail.id}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Booking Ref
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs text-[var(--text-primary)]">
                    {detail.booking_reference ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Awarded At
                  </dt>
                  <dd className="mt-0.5 text-xs tabular-nums text-[var(--text-primary)]">
                    {formatTimestamp(detail.awarded_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Nullified / Reinstated
                  </dt>
                  <dd className="mt-0.5 text-xs tabular-nums text-[var(--text-secondary)]">
                    {detail.nullified_at
                      ? `Nullified ${formatTimestamp(detail.nullified_at)}`
                      : "Never nullified"}
                    {detail.reinstated_at
                      ? ` · Reinstated ${formatTimestamp(detail.reinstated_at)}`
                      : ""}
                  </dd>
                </div>
              </dl>
            </section>

            <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 lg:col-span-5">
              <h2 className="border-b border-[var(--border-hairline)] pb-4 text-base font-semibold text-[var(--text-primary)]">
                Evaluation Record
              </h2>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Evaluator
                  </dt>
                  <dd className="mt-0.5 font-medium text-[var(--text-primary)]">
                    {detail.evaluator_name ?? "Assigned Interviewer"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">
                    Submitted At
                  </dt>
                  <dd className="mt-0.5 text-xs tabular-nums text-[var(--text-primary)]">
                    {formatTimestamp(detail.submitted_at)}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-secondary)]">Feedback</dt>
                  <dd className="mt-1 whitespace-pre-wrap text-xs leading-relaxed text-[var(--text-primary)]">
                    {detail.feedback || "No written evaluation feedback."}
                  </dd>
                </div>
              </dl>

              {detail.reinstatements.length > 0 ? (
                <div className="mt-5 border-t border-[var(--border-hairline)] pt-4">
                  <h3 className="text-xs font-semibold text-[var(--text-primary)]">
                    Appeal Reinstatement History
                  </h3>
                  <ul className="mt-2 space-y-2 text-xs text-[var(--text-secondary)]">
                    {detail.reinstatements.map((r) => (
                      <li key={r.id}>
                        <span className="font-medium tabular-nums text-[var(--text-primary)]">
                          {formatTimestamp(r.reinstated_at)}
                        </span>
                        : {r.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </section>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Approve Badge Certification"
        description={
          detail
            ? `Approve ${detail.badge_name} certification for ${detail.student_name}? This cannot be undone outside formal malpractice nullification.`
            : ""
        }
        confirmLabel="Approve Certification"
        busy={approving}
        onCancel={() => {
          if (!approving) setConfirmOpen(false);
        }}
        onConfirm={() => void handleApprove()}
      />
    </AppShell>
  );
}
