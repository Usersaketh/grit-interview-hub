"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowRight,
  Award,
  CalendarCheck2,
  CheckCircle2,
  Clock,
  FileCheck2,
  Loader2,
  Lock,
  LogOut,
  Menu,
  Scale,
  ShieldCheck,
  Terminal,
  UserCheck,
  X,
} from "lucide-react";
import { ThemeSwitch } from "@frontend/components/ThemeSwitch";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import { resolveDefaultPortalPath } from "@frontend/lib/domain";
import type { AppRole } from "@frontend/types/api";

const WORKFLOW_STEPS = [
  {
    step: "01",
    title: "Preparation & Eligibility",
    description:
      "Confirm required skill thresholds against badge prerequisites before scheduling opens.",
  },
  {
    step: "02",
    title: "Discovery & Booking",
    description:
      "Browse open assessor windows in your timezone and reserve a conflict-free interview slot.",
  },
  {
    step: "03",
    title: "Live Interview Session",
    description:
      "Complete your live technical assessment with verified attendance and session tracking.",
  },
  {
    step: "04",
    title: "Evaluation & Feedback",
    description:
      "Receive structured feedback and an official outcome: Pass, Retake Later with cooldown, or Fail.",
  },
  {
    step: "05",
    title: "Certification Review",
    description:
      "Passed evaluations enter formal review before an official badge certification is awarded.",
  },
] as const;

const STUDENT_CAPABILITIES = [
  {
    icon: CheckCircle2,
    title: "Live Eligibility Checks",
    detail:
      "See which badge prerequisites are verified and which skills still need clearance before booking.",
  },
  {
    icon: CalendarCheck2,
    title: "Timezone-Aware Scheduling",
    detail:
      "Discover available assessors, reserve 30-to-60 minute slots, or reschedule and cancel within policy windows.",
  },
  {
    icon: Clock,
    title: "Feedback & Retake Visibility",
    detail:
      "Review past interview evaluations, actionable feedback notes, and exact retake cooldown timestamps.",
  },
  {
    icon: Award,
    title: "Certification Tracking",
    detail:
      "Follow every badge from pending evaluation through official issuance or integrity review.",
  },
] as const;

const INTERVIEWER_CAPABILITIES = [
  {
    icon: UserCheck,
    title: "Invitation-Only Onboarding",
    detail:
      "Assessors join through single-use expiring invitation links bound directly to their verified institutional email.",
  },
  {
    icon: Clock,
    title: "Recurring Availability Windows",
    detail:
      "Configure weekly recurring schedules with effective date ranges and timezone precision.",
  },
  {
    icon: FileCheck2,
    title: "Focused Session Workspace",
    detail:
      "Start scheduled sessions, record student attendance, and submit idempotent rubric outcomes.",
  },
  {
    icon: Scale,
    title: "Complete Evaluation Ledger",
    detail:
      "Inspect your past interview sessions and submitted evaluation history in one place.",
  },
] as const;

const INTEGRITY_PILLARS = [
  {
    icon: Lock,
    title: "Conflict-Protected Booking",
    description:
      "Database exclusion constraints guarantee no double-booked slots or concurrent active bookings per badge.",
  },
  {
    icon: FileCheck2,
    title: "Append-Only Records",
    description:
      "Submitted evaluations, certification approvals, and integrity reviews remain permanently traceable.",
  },
  {
    icon: Scale,
    title: "Structured Appeals",
    description:
      "Flagged integrity reports follow an explicit review lifecycle with formal appeal and reinstatement states.",
  },
  {
    icon: ShieldCheck,
    title: "Isolated Role Access",
    description:
      "Server-verified permissions enforce strict boundaries across student and interviewer workflows.",
  },
] as const;

function getRoleLabel(roles: AppRole[]): string {
  if (roles.includes("ADMIN") || roles.includes("OPERATIONS")) return "Operations";
  if (roles.includes("INTERVIEWER")) return "Interviewer";
  if (roles.includes("STUDENT")) return "Student";
  return "Member";
}

function getWorkspaceButtonLabel(roles: AppRole[]): string {
  if (roles.includes("ADMIN") || roles.includes("OPERATIONS")) {
    return "Staff Workspace";
  }
  if (roles.includes("INTERVIEWER")) return "Interviewer Portal";
  return "Student Portal";
}

export function LandingView() {
  const router = useRouter();
  const { profile, loading, signOut } = useAuth();
  const { pushToast } = useToast();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);

  const handleSignOut = async () => {
    setSigningOut(true);
    try {
      await signOut();
      pushToast({
        title: "Signed out",
        description: "Your session has been cleared.",
        tone: "info",
      });
      router.replace("/");
    } catch (err) {
      pushToast({
        title: "Sign out failed",
        description:
          err instanceof Error ? err.message : "Could not sign out right now.",
        tone: "error",
      });
    } finally {
      setSigningOut(false);
    }
  };

  const defaultPortal = profile ? resolveDefaultPortalPath(profile.roles) : "/login";
  const roleLabel = profile ? getRoleLabel(profile.roles) : "";
  const workspaceLabel = profile ? getWorkspaceButtonLabel(profile.roles) : "";

  return (
    <div className="flex min-h-screen flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-hairline)] bg-[var(--bg-glass)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2.5 whitespace-nowrap text-sm font-semibold tracking-tight text-[var(--text-primary)]"
          >
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="truncate">GRIT Interview Hub</span>
          </Link>

          <nav
            aria-label="Homepage sections"
            className="hidden items-center gap-6 text-xs font-medium text-[var(--text-secondary)] md:flex"
          >
            <a
              href="#how-it-works"
              className="whitespace-nowrap transition-colors hover:text-[var(--text-primary)]"
            >
              How it works
            </a>
            <a
              href="#for-students"
              className="whitespace-nowrap transition-colors hover:text-[var(--text-primary)]"
            >
              For Students
            </a>
            <a
              href="#for-interviewers"
              className="whitespace-nowrap transition-colors hover:text-[var(--text-primary)]"
            >
              For Interviewers
            </a>
            <a
              href="#platform"
              className="whitespace-nowrap transition-colors hover:text-[var(--text-primary)]"
            >
              Platform
            </a>
          </nav>

          <div className="flex shrink-0 items-center gap-2">
            <ThemeSwitch />

            {!loading && profile ? (
              <>
                <span className="hidden items-center gap-1.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs text-[var(--text-secondary)] lg:inline-flex">
                  <span className="font-mono text-[11px] font-medium text-[var(--accent-text)]">
                    {roleLabel}
                  </span>
                  <span aria-hidden="true">·</span>
                  <span className="max-w-[140px] truncate text-[var(--text-primary)]">
                    {profile.full_name}
                  </span>
                </span>
                <Link
                  href={defaultPortal}
                  className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                >
                  <span>{workspaceLabel}</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  disabled={signingOut}
                  aria-label="Sign out"
                  className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-55 sm:px-3"
                >
                  {signingOut ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
                  ) : (
                    <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  )}
                  <span className="hidden sm:inline">
                    {signingOut ? "Signing out..." : "Sign out"}
                  </span>
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex min-h-9 items-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
                >
                  Login
                </Link>
                <Link
                  href="/signup"
                  className="hidden min-h-9 items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] sm:inline-flex"
                >
                  Get Started
                </Link>
              </>
            )}

            <button
              type="button"
              onClick={() => setMobileNavOpen((prev) => !prev)}
              aria-expanded={mobileNavOpen}
              aria-label={mobileNavOpen ? "Close section navigation" : "Open section navigation"}
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] md:hidden"
            >
              {mobileNavOpen ? (
                <X className="h-4 w-4" aria-hidden="true" />
              ) : (
                <Menu className="h-4 w-4" aria-hidden="true" />
              )}
            </button>
          </div>
        </div>

        {mobileNavOpen ? (
          <nav
            aria-label="Mobile section navigation"
            className="border-t border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-3 md:hidden"
          >
            <div className="flex flex-col gap-2 text-sm font-medium text-[var(--text-secondary)]">
              <a
                href="#how-it-works"
                onClick={() => setMobileNavOpen(false)}
                className="rounded px-2 py-1.5 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                How it works
              </a>
              <a
                href="#for-students"
                onClick={() => setMobileNavOpen(false)}
                className="rounded px-2 py-1.5 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                For Students
              </a>
              <a
                href="#for-interviewers"
                onClick={() => setMobileNavOpen(false)}
                className="rounded px-2 py-1.5 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                For Interviewers
              </a>
              <a
                href="#platform"
                onClick={() => setMobileNavOpen(false)}
                className="rounded px-2 py-1.5 hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                Platform
              </a>
              {!loading && !profile ? (
                <Link
                  href="/signup"
                  onClick={() => setMobileNavOpen(false)}
                  className="mt-1 inline-flex min-h-9 items-center justify-center rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-white"
                >
                  Get Started
                </Link>
              ) : null}
            </div>
          </nav>
        ) : null}
      </header>

      <main className="flex-1">
        {/* Section 1: Hero */}
        <section className="border-b border-[var(--border-hairline)]">
          <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-12 lg:items-center lg:gap-12 lg:px-8">
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="lg:col-span-7"
            >
              <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-[var(--accent-text)]">
                Technical Assessment &amp; Badge Certification
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-5xl sm:leading-[1.1]">
                Live technical interviews built for verified badge mastery.
              </h1>
              <p className="mt-5 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-base">
                GRIT Interview Hub connects skill-verified students with technical
                assessors through conflict-free scheduling, structured live
                evaluations, and accountable certification review.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                {!loading && profile ? (
                  <>
                    <Link
                      href={defaultPortal}
                      className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                    >
                      <span>Open {workspaceLabel}</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <button
                      type="button"
                      onClick={handleSignOut}
                      disabled={signingOut}
                      className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] disabled:opacity-55"
                    >
                      {signingOut ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : (
                        <LogOut className="h-4 w-4" aria-hidden="true" />
                      )}
                      <span>{signingOut ? "Signing out..." : "Sign out"}</span>
                    </button>
                  </>
                ) : (
                  <>
                    <Link
                      href="/signup"
                      className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                    >
                      <span>Create Student Account</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <Link
                      href="/login"
                      className="inline-flex min-h-11 items-center gap-2 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-5 py-2.5 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)]"
                    >
                      <span>Sign in</span>
                    </Link>
                  </>
                )}
              </div>

              <p className="mt-4 text-xs text-[var(--text-muted)]">
                Students register directly. Interviewers join through an official invitation link and sign in with their activated credentials.
              </p>
            </motion.div>

            {/* Right architectural preview frame */}
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, ease: "easeOut" }}
              className="lg:col-span-5"
            >
              <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 shadow-[var(--shadow-elevated)]">
                <div className="flex items-center justify-between border-b border-[var(--border-hairline)] pb-3">
                  <span className="font-mono text-[11px] uppercase tracking-wider text-[var(--text-muted)]">
                    Assessment Pipeline
                  </span>
                  <span className="font-mono text-[11px] text-[var(--accent-text)]">
                    Verified Lifecycle
                  </span>
                </div>

                <div className="mt-4 space-y-2.5">
                  <div className="flex items-center justify-between rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3.5 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        1. Skill Clearances
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Prerequisites checked per badge
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--status-success)]">
                      ELIGIBLE
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3.5 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        2. Live Interview Booking
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Assessor window locked cleanly
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--status-info)]">
                      BOOKED
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3.5 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        3. Rubric Evaluation
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Outcome &amp; feedback submitted
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--status-warning)]">
                      CERTIFICATION_PENDING
                    </span>
                  </div>

                  <div className="flex items-center justify-between rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-3.5 py-2.5">
                    <div>
                      <p className="text-xs font-semibold text-[var(--text-primary)]">
                        4. Badge Award Issuance
                      </p>
                      <p className="text-[11px] text-[var(--text-secondary)]">
                        Formal certification sign-off
                      </p>
                    </div>
                    <span className="font-mono text-[11px] text-[var(--status-success)]">
                      AWARDED
                    </span>
                  </div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>

        {/* Section 2: How GRIT Works */}
        <section
          id="how-it-works"
          className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/40"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-[var(--accent-text)]">
                How GRIT Works
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                Five clear steps from preparation to badge award.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                Every stage has explicit rules so candidates know what is required before booking and what happens after every evaluation.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
              {WORKFLOW_STEPS.map((item) => (
                <article
                  key={item.step}
                  className="flex flex-col rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
                >
                  <span className="font-mono text-xs font-semibold tabular-nums text-[var(--accent-text)]">
                    {item.step}
                  </span>
                  <h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {item.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        {/* Section 3: For Students */}
        <section id="for-students" className="border-b border-[var(--border-hairline)]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-[var(--accent-text)]">
                  For Students
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                  Transparent eligibility, scheduling, and feedback.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                  No guessing when you qualify or which slot is free. Track clearances, schedule live sessions in your timezone, and review every evaluation outcome.
                </p>
              </div>
              <Link
                href={profile ? defaultPortal : "/signup"}
                className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] lg:self-auto"
              >
                <span>{profile ? "Go to Workspace" : "Register as Student"}</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
              {STUDENT_CAPABILITIES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="flex items-start gap-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        {feature.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                        {feature.detail}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 4: For Interviewers */}
        <section
          id="for-interviewers"
          className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/40"
        >
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
              <div className="max-w-2xl">
                <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-[var(--accent-text)]">
                  For Interviewers
                </p>
                <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                  Structured assessor scheduling and live evaluation.
                </h2>
                <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Invited assessors publish weekly availability windows, manage live session attendance, and submit durable evaluations without manual spreadsheet coordination.
                </p>
              </div>
              <Link
                href="/login"
                className="inline-flex min-h-10 shrink-0 items-center gap-2 self-start whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] lg:self-auto"
              >
                <span>Assessor Sign In</span>
                <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
              </Link>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 md:grid-cols-2">
              {INTERVIEWER_CAPABILITIES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <article
                    key={feature.title}
                    className="flex items-start gap-4 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
                  >
                    <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                        {feature.title}
                      </h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                        {feature.detail}
                      </p>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 5: Certification & Outcomes */}
        <section id="platform" className="border-b border-[var(--border-hairline)]">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-[var(--accent-text)]">
                Certification &amp; Outcomes
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                Passing an interview is distinct from final badge issuance.
              </h2>
              <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                GRIT separates the live technical evaluation from final credential approval so badge integrity never depends on a single unchecked transition.
              </p>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-5 md:grid-cols-3">
              <article className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                <p className="font-mono text-xs font-medium text-[var(--status-warning)]">
                  PASS · CERTIFICATION_PENDING
                </p>
                <h3 className="mt-2 text-base font-semibold text-[var(--text-primary)]">
                  Interview Passed
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Once an interviewer records a PASS outcome, the attempt is logged permanently and placed in pending review rather than self-issuing immediately.
                </p>
              </article>

              <article className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                <p className="font-mono text-xs font-medium text-[var(--status-success)]">
                  VERIFIED · AWARDED
                </p>
                <h3 className="mt-2 text-base font-semibold text-[var(--text-primary)]">
                  Official Badge Award
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  After certification review verifies rubric compliance and clean integrity status, the badge transitions to AWARDED with a recorded timestamp.
                </p>
              </article>

              <article className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
                <p className="font-mono text-xs font-medium text-[var(--status-info)]">
                  RETAKE_LATER · FAIL
                </p>
                <h3 className="mt-2 text-base font-semibold text-[var(--text-primary)]">
                  Cooldown &amp; Re-Attempts
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Students who receive a retake-later outcome see structured assessor feedback and the exact cooldown date before scheduling their next attempt.
                </p>
              </article>
            </div>
          </div>
        </section>

        {/* Section 6: Trust & Integrity */}
        <section className="border-b border-[var(--border-hairline)] bg-[var(--bg-surface)]/40">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-[var(--accent-text)]">
                Trust &amp; Integrity
              </p>
              <h2 className="mt-2 text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-3xl">
                Built around verifiable records and fair governance.
              </h2>
            </div>

            <div className="mt-10 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {INTEGRITY_PILLARS.map((pillar) => {
                const Icon = pillar.icon;
                return (
                  <article
                    key={pillar.title}
                    className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
                  >
                    <Icon
                      className="h-4 w-4 text-[var(--accent-primary)]"
                      aria-hidden="true"
                    />
                    <h3 className="mt-3 text-sm font-semibold text-[var(--text-primary)]">
                      {pillar.title}
                    </h3>
                    <p className="mt-1.5 text-xs leading-relaxed text-[var(--text-secondary)]">
                      {pillar.description}
                    </p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* Section 7: Final CTA */}
        <section>
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:px-8">
            <div className="flex flex-col items-start justify-between gap-6 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-8 sm:flex-row sm:items-center sm:p-10">
              <div className="max-w-xl">
                <h2 className="text-xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-2xl">
                  Ready for your next GRIT badge assessment?
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                  Create your student account to inspect badge prerequisites, or sign in to resume an active booking or interviewer schedule.
                </p>
              </div>
              <div className="flex shrink-0 flex-wrap items-center gap-3">
                {!loading && profile ? (
                  <Link
                    href={defaultPortal}
                    className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                  >
                    <span>Open {workspaceLabel}</span>
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                ) : (
                  <>
                    <Link
                      href="/signup"
                      className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                    >
                      <span>Get Started</span>
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                    <Link
                      href="/login"
                      className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
                    >
                      <span>Sign in</span>
                    </Link>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-hairline)] bg-[var(--bg-surface)]/50">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-3 px-4 py-6 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <span>GRIT Interview Hub · Skill Assessment &amp; Certification Platform</span>
          <div className="flex flex-wrap items-center gap-4">
            <a href="#how-it-works" className="hover:text-[var(--text-primary)]">
              How it works
            </a>
            <a href="#for-students" className="hover:text-[var(--text-primary)]">
              Students
            </a>
            <a href="#for-interviewers" className="hover:text-[var(--text-primary)]">
              Interviewers
            </a>
            <Link href="/login" className="hover:text-[var(--text-primary)]">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
