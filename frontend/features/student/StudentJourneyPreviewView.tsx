"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  Award,
  Calendar,
  Eye,
  MailCheck,
  ShieldAlert,
} from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import {
  GritProgressionTrack,
  type ProgressionStageKey,
} from "@frontend/components/GritProgressionTrack";
import { PageHeader } from "@frontend/components/PageHeader";
import { StatusText } from "@frontend/components/StatusText";
import {
  formatTimestamp,
  getBookingStatusMeta,
  getCertificationStatusMeta,
  getOutcomeMeta,
} from "@frontend/lib/domain";
import {
  buildBookingConfirmationMessage,
  buildCertificationAwardedMessage,
  buildInterviewResultMessage,
  type FormattedStudentMessage,
} from "@frontend/lib/studentMessages";
import type {
  BookingStatus,
  CertificationStatus,
  EvaluationOutcome,
} from "@frontend/types/api";

type JourneyPreviewStateKey =
  | "before_result"
  | "pass"
  | "fail"
  | "retake"
  | "nullified";

type PassMilestoneKey = "pending" | "awarded";

interface JourneyScenario {
  key: JourneyPreviewStateKey;
  tabLabel: string;
  headline: string;
  summary: string;
  stage: ProgressionStageKey;
  metrics: {
    eligible: number;
    upcoming: number;
    awarded: number;
    integrityCases: number;
  };
  nextActionTitle: string;
  nextActionDescription: string;
  interview: {
    reference: string;
    attemptNumber: number;
    startsAt: string;
    timezone: string;
    interviewerName: string;
    bookingStatus: BookingStatus;
    outcome: EvaluationOutcome | null;
    feedback: string | null;
    retakeAfter: string | null;
  };
  badge: {
    name: string;
    trackName: string;
    level: string;
    externalId: string;
    certificationStatus: CertificationStatus | null;
    awardedAt: string | null;
    nullifiedAt: string | null;
    auditNote: string;
  };
  messages: FormattedStudentMessage[];
}

const DEMO_STUDENT_NAME = "Aarav Sharma (Preview)";
const DEMO_BADGE_NAME = "Prompt Engineering & Structured Outputs";
const DEMO_TRACK_NAME = "AI & Generative Intelligence";
const DEMO_INTERVIEWER_NAME = "Ananya Rao";
const DEMO_STARTS_AT = "2026-12-08T10:30:00.000Z";
const DEMO_TIMEZONE = "Asia/Kolkata";
const DEMO_RETAKE_AFTER = "2026-12-15T10:30:00.000Z";

function buildScenario(
  key: JourneyPreviewStateKey,
  passMilestone: PassMilestoneKey
): JourneyScenario {
  const bookingMessage = buildBookingConfirmationMessage({
    studentName: DEMO_STUDENT_NAME,
    badgeName: DEMO_BADGE_NAME,
    trackName: DEMO_TRACK_NAME,
    startsAtIso: DEMO_STARTS_AT,
    timezone: DEMO_TIMEZONE,
    interviewerName: DEMO_INTERVIEWER_NAME,
  });

  if (key === "before_result") {
    return {
      key,
      tabLabel: "1. Before Interview Result",
      headline: "Booked interview awaiting live assessment",
      summary:
        "All required skill clearances are verified, the slot is locked transactionally, and Booking Confirmation has been dispatched.",
      stage: "interview",
      metrics: {
        eligible: 2,
        upcoming: 1,
        awarded: 0,
        integrityCases: 0,
      },
      nextActionTitle: `Upcoming interview: ${DEMO_BADGE_NAME}`,
      nextActionDescription:
        "Join your scheduled assessment session on time. Result and certification status update after interviewer evaluation.",
      interview: {
        reference: "GRIT-DEMO-2041",
        attemptNumber: 1,
        startsAt: DEMO_STARTS_AT,
        timezone: DEMO_TIMEZONE,
        interviewerName: DEMO_INTERVIEWER_NAME,
        bookingStatus: "BOOKED",
        outcome: null,
        feedback: null,
        retakeAfter: null,
      },
      badge: {
        name: DEMO_BADGE_NAME,
        trackName: DEMO_TRACK_NAME,
        level: "Level 1",
        externalId: "BADGE-AI-L1",
        certificationStatus: "ELIGIBLE_FOR_INTERVIEW",
        awardedAt: null,
        nullifiedAt: null,
        auditNote:
          "Required skills verified (Prompt Design & Schemas L1/L1, LLM API Integration L1/L1).",
      },
      messages: [bookingMessage],
    };
  }

  if (key === "pass") {
    const passResultMessage = buildInterviewResultMessage({
      studentName: DEMO_STUDENT_NAME,
      badgeName: DEMO_BADGE_NAME,
      trackName: DEMO_TRACK_NAME,
      outcome: "PASS",
    });

    if (passMilestone === "pending") {
      return {
        key,
        tabLabel: "2. PASS",
        headline: "PASS submitted — Certification Pending admin approval",
        summary:
          "Interviewer submitted PASS. Badge enters CERTIFICATION_PENDING; the congratulatory award message is strictly withheld until Operations/Admin approval.",
        stage: "certification",
        metrics: {
          eligible: 2,
          upcoming: 0,
          awarded: 0,
          integrityCases: 0,
        },
        nextActionTitle: "Certification pending Operations/Admin review",
        nextActionDescription:
          "Your interview passed. An administrator reviews and approves the official certification record.",
        interview: {
          reference: "GRIT-DEMO-2041",
          attemptNumber: 1,
          startsAt: DEMO_STARTS_AT,
          timezone: DEMO_TIMEZONE,
          interviewerName: DEMO_INTERVIEWER_NAME,
          bookingStatus: "EVALUATED",
          outcome: "PASS",
          feedback:
            "Strong schema validation discipline, explicit JSON fallback handling, and clear prompt regression criteria.",
          retakeAfter: null,
        },
        badge: {
          name: DEMO_BADGE_NAME,
          trackName: DEMO_TRACK_NAME,
          level: "Level 1",
          externalId: "BADGE-AI-L1",
          certificationStatus: "CERTIFICATION_PENDING",
          awardedAt: null,
          nullifiedAt: null,
          auditNote:
            "PASS evaluation recorded; awaiting Admin approval before issuing AWARDED status and badge award message.",
        },
        messages: [passResultMessage, bookingMessage],
      };
    }

    const awardMessage = buildCertificationAwardedMessage({
      studentName: DEMO_STUDENT_NAME,
      badgeName: DEMO_BADGE_NAME,
      trackName: DEMO_TRACK_NAME,
    });

    return {
      key,
      tabLabel: "2. PASS",
      headline: "Admin approved — Badge officially AWARDED",
      summary:
        "Administrator approved the pending certification. Status transitions to AWARDED and Message 3 is dispatched.",
      stage: "certification",
      metrics: {
        eligible: 2,
        upcoming: 0,
        awarded: 1,
        integrityCases: 0,
      },
      nextActionTitle: `Badge awarded: ${DEMO_BADGE_NAME}`,
      nextActionDescription:
        "Official certification is active on your profile and recorded in the append-only audit log.",
      interview: {
        reference: "GRIT-DEMO-2041",
        attemptNumber: 1,
        startsAt: DEMO_STARTS_AT,
        timezone: DEMO_TIMEZONE,
        interviewerName: DEMO_INTERVIEWER_NAME,
        bookingStatus: "EVALUATED",
        outcome: "PASS",
        feedback:
          "Strong schema validation discipline, explicit JSON fallback handling, and clear prompt regression criteria.",
        retakeAfter: null,
      },
      badge: {
        name: DEMO_BADGE_NAME,
        trackName: DEMO_TRACK_NAME,
        level: "Level 1",
        externalId: "BADGE-AI-L1",
        certificationStatus: "AWARDED",
        awardedAt: "2026-12-08T14:15:00.000Z",
        nullifiedAt: null,
        auditNote:
          "Certification approved by Admin; official badge award issued.",
      },
      messages: [awardMessage, passResultMessage, bookingMessage],
    };
  }

  if (key === "fail") {
    const failMessage = buildInterviewResultMessage({
      studentName: DEMO_STUDENT_NAME,
      badgeName: DEMO_BADGE_NAME,
      trackName: DEMO_TRACK_NAME,
      outcome: "FAIL",
      feedback:
        "Structured output schema missed strict enum constraints under adversarial inputs; review schema validation and error handling.",
    });

    return {
      key,
      tabLabel: "3. FAIL",
      headline: "Interview evaluated as NOT PASSED",
      summary:
        "Interviewer submitted FAIL. No pending certification record is created and evaluator feedback is surfaced cleanly.",
      stage: "evaluation",
      metrics: {
        eligible: 2,
        upcoming: 0,
        awarded: 0,
        integrityCases: 0,
      },
      nextActionTitle: "Review evaluator feedback",
      nextActionDescription:
        "Address the highlighted gaps in structured output validation before planning your next attempt.",
      interview: {
        reference: "GRIT-DEMO-2041",
        attemptNumber: 1,
        startsAt: DEMO_STARTS_AT,
        timezone: DEMO_TIMEZONE,
        interviewerName: DEMO_INTERVIEWER_NAME,
        bookingStatus: "EVALUATED",
        outcome: "FAIL",
        feedback:
          "Structured output schema missed strict enum constraints under adversarial inputs; review schema validation and error handling.",
        retakeAfter: null,
      },
      badge: {
        name: DEMO_BADGE_NAME,
        trackName: DEMO_TRACK_NAME,
        level: "Level 1",
        externalId: "BADGE-AI-L1",
        certificationStatus: "ELIGIBLE_FOR_INTERVIEW",
        awardedAt: null,
        nullifiedAt: null,
        auditNote: "No certification issued for this attempt.",
      },
      messages: [failMessage, bookingMessage],
    };
  }

  if (key === "retake") {
    const retakeMessage = buildInterviewResultMessage({
      studentName: DEMO_STUDENT_NAME,
      badgeName: DEMO_BADGE_NAME,
      trackName: DEMO_TRACK_NAME,
      outcome: "RETAKE_LATER",
      feedback:
        "Good grasp of baseline prompting; practice multi-field schema retries and deterministic temperature configuration before retaking.",
    });

    return {
      key,
      tabLabel: "4. RETAKE",
      headline: "RETAKE REQUIRED with database-enforced cooldown",
      summary:
        "Interviewer submitted RETAKE_LATER with a cooldown window. Slots earlier than retake_after are automatically blocked until cooldown expires.",
      stage: "evaluation",
      metrics: {
        eligible: 2,
        upcoming: 0,
        awarded: 0,
        integrityCases: 0,
      },
      nextActionTitle: "Prepare for retake after cooldown window",
      nextActionDescription:
        "Practice schema retry logic and book a new interview slot once the retake cooldown window opens.",
      interview: {
        reference: "GRIT-DEMO-2041",
        attemptNumber: 1,
        startsAt: DEMO_STARTS_AT,
        timezone: DEMO_TIMEZONE,
        interviewerName: DEMO_INTERVIEWER_NAME,
        bookingStatus: "EVALUATED",
        outcome: "RETAKE_LATER",
        feedback:
          "Good grasp of baseline prompting; practice multi-field schema retries and deterministic temperature configuration before retaking.",
        retakeAfter: DEMO_RETAKE_AFTER,
      },
      badge: {
        name: DEMO_BADGE_NAME,
        trackName: DEMO_TRACK_NAME,
        level: "Level 1",
        externalId: "BADGE-AI-L1",
        certificationStatus: "ELIGIBLE_FOR_INTERVIEW",
        awardedAt: null,
        nullifiedAt: null,
        auditNote:
          "Retake allowed after cooldown timestamp; attempt history preserved.",
      },
      messages: [retakeMessage, bookingMessage],
    };
  }

  // key === "nullified"
  const awardMessage = buildCertificationAwardedMessage({
    studentName: DEMO_STUDENT_NAME,
    badgeName: DEMO_BADGE_NAME,
    trackName: DEMO_TRACK_NAME,
  });

  return {
    key,
    tabLabel: "5. Badge Nullified",
    headline: "Confirmed malpractice led to badge nullification",
    summary:
      "After an integrity report transitioned UNDER_REVIEW → CONFIRMED, an admin executed nullification. The badge displays NULLIFIED with full audit trail.",
    stage: "certification",
    metrics: {
      eligible: 2,
      upcoming: 0,
      awarded: 0,
      integrityCases: 1,
    },
    nextActionTitle: "Integrity case decision recorded",
    nextActionDescription:
      "Review Malpractice Status for appeal eligibility and decision timestamps. Original evaluation records remain immutable.",
    interview: {
      reference: "GRIT-DEMO-2041",
      attemptNumber: 1,
      startsAt: DEMO_STARTS_AT,
      timezone: DEMO_TIMEZONE,
      interviewerName: DEMO_INTERVIEWER_NAME,
      bookingStatus: "EVALUATED",
      outcome: "PASS",
      feedback:
        "Strong schema validation discipline, explicit JSON fallback handling, and clear prompt regression criteria.",
      retakeAfter: null,
    },
    badge: {
      name: DEMO_BADGE_NAME,
      trackName: DEMO_TRACK_NAME,
      level: "Level 1",
      externalId: "BADGE-AI-L1",
      certificationStatus: "NULLIFIED",
      awardedAt: "2026-12-08T14:15:00.000Z",
      nullifiedAt: "2026-12-10T09:00:00.000Z",
      auditNote:
        "Badge nullified following CONFIRMED integrity case #MAL-DEMO-109. Prior approval event remains preserved in append-only audit_logs.",
    },
    messages: [awardMessage, bookingMessage],
  };
}

const PREVIEW_TABS: Array<{ key: JourneyPreviewStateKey; label: string }> = [
  { key: "before_result", label: "Before Interview Result" },
  { key: "pass", label: "PASS" },
  { key: "fail", label: "FAIL" },
  { key: "retake", label: "RETAKE" },
  { key: "nullified", label: "Badge Nullified" },
];

export function StudentJourneyPreviewView() {
  const [activeKey, setActiveKey] =
    useState<JourneyPreviewStateKey>("before_result");
  const [passMilestone, setPassMilestone] =
    useState<PassMilestoneKey>("pending");

  const scenario = buildScenario(activeKey, passMilestone);
  const bookingMeta = getBookingStatusMeta(scenario.interview.bookingStatus);
  const outcomeMeta = scenario.interview.outcome
    ? getOutcomeMeta(scenario.interview.outcome)
    : null;
  const certMeta = scenario.badge.certificationStatus
    ? getCertificationStatusMeta(scenario.badge.certificationStatus)
    : null;

  return (
    <AppShell allowedRoles={["STUDENT"]} sectionLabel="Student Portal">
      <PageHeader
        breadcrumbs={[
          { label: "Student Portal", href: "/student" },
          { label: "Journey Preview (Demo)" },
        ]}
        title="Student Journey Preview"
        description="Inspect synchronized before-and-after Student Portal screens across booking, interview outcomes, pending approval, badge award, and nullification."
        actions={
          <Link
            href="/student"
            className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-3.5 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]"
          >
            <span>Return to Live Dashboard</span>
            <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
          </Link>
        }
      />

      {/* Explicit DEMO PREVIEW Safeguard Banner */}
      <section
        aria-label="Demo preview disclaimer"
        className="mb-6 flex flex-col gap-3 rounded-lg border border-[var(--status-warning)]/40 bg-[var(--status-warning-bg)] p-4 sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-start gap-3">
          <Eye
            className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-warning)]"
            aria-hidden="true"
          />
          <div>
            <p className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--status-warning)]">
              DEMO PREVIEW — READ-ONLY SIMULATION
            </p>
            <p className="mt-1 text-xs leading-relaxed text-[var(--text-primary)]">
              All data displayed on this screen is a client-side simulation. It
              creates zero database records and never modifies any real student
              progress, interview outcomes, or badge awards.
            </p>
          </div>
        </div>
      </section>

      {/* State Switcher */}
      <section className="mb-6 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div
            role="tablist"
            aria-label="Simulated student lifecycle states"
            className="flex flex-wrap gap-1.5"
          >
            {PREVIEW_TABS.map((tab) => {
              const active = activeKey === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setActiveKey(tab.key)}
                  className={`min-h-9 whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-medium transition-colors ${
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

          {activeKey === "pass" ? (
            <div className="flex items-center gap-2 border-t border-[var(--border-hairline)] pt-2.5 lg:border-t-0 lg:pt-0">
              <span className="font-mono text-[11px] text-[var(--text-muted)]">
                Approval Step:
              </span>
              <button
                type="button"
                onClick={() => setPassMilestone("pending")}
                className={`min-h-8 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  passMilestone === "pending"
                    ? "bg-[var(--accent-soft)] text-[var(--accent-text)] border border-[var(--accent-primary)]"
                    : "border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                CERTIFICATION PENDING
              </button>
              <button
                type="button"
                onClick={() => setPassMilestone("awarded")}
                className={`min-h-8 whitespace-nowrap rounded px-2.5 py-1 text-xs font-medium transition-colors ${
                  passMilestone === "awarded"
                    ? "bg-[var(--accent-soft)] text-[var(--accent-text)] border border-[var(--accent-primary)]"
                    : "border border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                }`}
              >
                AWARDED (Admin Approved)
              </button>
            </div>
          ) : null}
        </div>

        <div className="mt-3 border-t border-[var(--border-hairline)] pt-3">
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {scenario.headline}
          </p>
          <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
            {scenario.summary}
          </p>
        </div>
      </section>

      <div className="space-y-6">
        <GritProgressionTrack
          title="Simulated GRIT Assessment Journey (Demo Preview)"
          activeStage={scenario.stage}
          compact
        />

        {/* Simulated Dashboard Metrics */}
        <section
          aria-label="Simulated dashboard summary"
          className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
        >
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              Eligible Badges (Demo)
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
              {scenario.metrics.eligible}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              Upcoming Interviews (Demo)
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
              {scenario.metrics.upcoming}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              Awarded Badges (Demo)
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
              {scenario.metrics.awarded}
            </p>
          </div>
          <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <p className="text-xs font-medium text-[var(--text-secondary)]">
              Integrity Cases (Demo)
            </p>
            <p className="mt-2 text-3xl font-semibold tabular-nums text-[var(--text-primary)]">
              {scenario.metrics.integrityCases}
            </p>
          </div>
        </section>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* Simulated My Interviews Screen */}
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
              <div className="flex items-center gap-2">
                <Calendar
                  className="h-4 w-4 text-[var(--accent-primary)]"
                  aria-hidden="true"
                />
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  My Interviews View (Demo)
                </h2>
              </div>
              <StatusText label={bookingMeta.label} tone={bookingMeta.tone} />
            </div>

            <div className="space-y-3 text-xs">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold text-[var(--text-primary)]">
                    {scenario.badge.name}
                  </p>
                  <p className="mt-0.5 tabular-nums text-[var(--text-secondary)]">
                    {formatTimestamp(
                      scenario.interview.startsAt,
                      scenario.interview.timezone
                    )}{" "}
                    · {scenario.interview.interviewerName}
                  </p>
                  <p className="mt-0.5 font-mono text-[11px] text-[var(--text-muted)]">
                    Ref {scenario.interview.reference} · Attempt #
                    {scenario.interview.attemptNumber}
                  </p>
                </div>
                {outcomeMeta ? (
                  <StatusText
                    label={outcomeMeta.label}
                    tone={outcomeMeta.tone}
                  />
                ) : (
                  <StatusText label="Awaiting Session" tone="info" />
                )}
              </div>

              {scenario.interview.feedback ? (
                <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-3">
                  <p className="font-medium text-[var(--text-secondary)]">
                    Published Evaluator Feedback
                  </p>
                  <p className="mt-1 text-sm leading-relaxed text-[var(--text-primary)]">
                    {scenario.interview.feedback}
                  </p>
                </div>
              ) : (
                <p className="text-[var(--text-secondary)]">
                  No evaluation outcome published yet.
                </p>
              )}

              {scenario.interview.retakeAfter ? (
                <p className="text-xs font-medium text-[var(--status-warning)]">
                  Retake Eligible After:{" "}
                  <span className="tabular-nums">
                    {formatTimestamp(
                      scenario.interview.retakeAfter,
                      scenario.interview.timezone
                    )}
                  </span>
                </p>
              ) : null}
            </div>
          </section>

          {/* Simulated My Badges Screen */}
          <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
            <div className="mb-4 flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
              <div className="flex items-center gap-2">
                <Award
                  className="h-4 w-4 text-[var(--accent-primary)]"
                  aria-hidden="true"
                />
                <h2 className="text-base font-semibold text-[var(--text-primary)]">
                  My Badges View (Demo)
                </h2>
              </div>
              {certMeta ? (
                <StatusText label={certMeta.label} tone={certMeta.tone} />
              ) : null}
            </div>

            <div className="space-y-3">
              <div>
                <p className="font-mono text-[10px] uppercase tracking-wider text-[var(--accent-text)]">
                  {scenario.badge.trackName}
                </p>
                <p className="mt-0.5 text-sm font-semibold text-[var(--text-primary)]">
                  {scenario.badge.name}
                </p>
                <p className="mt-0.5 text-xs text-[var(--text-secondary)]">
                  {scenario.badge.level} · {scenario.badge.externalId}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between text-xs tabular-nums text-[var(--text-secondary)]">
                  <span>Verified skills: 2 / 2</span>
                  <span className="font-mono text-[11px] text-[var(--text-muted)]">
                    100%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-sm bg-[var(--bg-elevated)]">
                  <div className="h-full w-full bg-[var(--accent-primary)]" />
                </div>
              </div>

              {certMeta ? (
                <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                  {certMeta.description}
                </p>
              ) : null}

              {scenario.badge.awardedAt ? (
                <p className="text-xs tabular-nums text-[var(--text-muted)]">
                  Awarded: {formatTimestamp(scenario.badge.awardedAt)}
                </p>
              ) : null}

              {scenario.badge.nullifiedAt ? (
                <div className="flex items-start gap-2 rounded-md border border-[var(--status-error)]/30 bg-[var(--status-error-bg)] p-3 text-xs text-[var(--status-error)]">
                  <ShieldAlert
                    className="mt-0.5 h-4 w-4 shrink-0"
                    aria-hidden="true"
                  />
                  <div>
                    <p className="font-semibold">
                      Nullified: {formatTimestamp(scenario.badge.nullifiedAt)}
                    </p>
                    <p className="mt-0.5 text-[var(--text-primary)]">
                      {scenario.badge.auditNote}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-xs text-[var(--text-muted)]">
                  {scenario.badge.auditNote}
                </p>
              )}
            </div>
          </section>
        </div>

        {/* Exact Student Messages Generated for This State */}
        <section className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-3">
            <div className="flex items-center gap-2">
              <MailCheck
                className="h-4 w-4 text-[var(--accent-primary)]"
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold text-[var(--text-primary)]">
                Student Messages Sent in This State (Demo)
              </h2>
            </div>
            {activeKey === "pass" && passMilestone === "pending" ? (
              <span className="inline-flex items-center gap-1.5 text-xs text-[var(--status-warning)]">
                <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                <span>
                  Badge Awarded message withheld until Admin approval
                </span>
              </span>
            ) : null}
          </div>

          <div className="space-y-4">
            {scenario.messages.map((msg, idx) => (
              <article
                key={`${msg.kind}-${idx}`}
                className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--border-hairline)] pb-2.5">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Subject: {msg.subject}
                  </h3>
                  <StatusText label="Demo Preview" tone="warning" />
                </div>
                <pre className="mt-3 whitespace-pre-wrap font-sans text-sm leading-relaxed text-[var(--text-primary)]">
                  {msg.body}
                </pre>
              </article>
            ))}
          </div>
        </section>
      </div>
    </AppShell>
  );
}
