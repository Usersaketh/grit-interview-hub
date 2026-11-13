"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  ArrowRight,
  Award,
  CalendarCheck2,
  Lock,
  LogOut,
  ShieldCheck,
  Terminal,
} from "lucide-react";
import { GritProgressionTrack } from "@frontend/components/GritProgressionTrack";
import { ThemeSwitch } from "@frontend/components/ThemeSwitch";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import {
  hasAllowedRole,
  resolveDefaultPortalPath,
} from "@frontend/lib/domain";
import type { AppRole } from "@frontend/types/api";

const PORTAL_CARDS: Array<{
  index: string;
  roles: AppRole[];
  title: string;
  subtitle: string;
  href: string;
  description: string;
  icon: typeof Award;
}> = [
  {
    index: "01",
    roles: ["STUDENT"],
    title: "Student Portal",
    subtitle: "Clearances & Booking",
    href: "/student",
    description:
      "Track verified skill clearances, inspect badge eligibility, schedule live technical interviews, and monitor certification awards.",
    icon: Award,
  },
  {
    index: "02",
    roles: ["INTERVIEWER"],
    title: "Interviewer Portal",
    subtitle: "Availability & Evaluation",
    href: "/interviewer",
    description:
      "Configure recurring weekly availability windows, manage upcoming interview sessions, record attendance, and submit evaluations.",
    icon: CalendarCheck2,
  },
  {
    index: "03",
    roles: ["OPERATIONS", "ADMIN"],
    title: "Operations Portal",
    subtitle: "Governance & Integrity",
    href: "/operations",
    description:
      "Monitor assessment throughput, approve pending badge certifications, oversee malpractice cases, and inspect immutable audit logs.",
    icon: ShieldCheck,
  },
];

export function LandingView() {
  const router = useRouter();
  const { profile, loading, signOut } = useAuth();
  const { pushToast } = useToast();

  const handleSignOut = async () => {
    await signOut();
    pushToast({
      title: "Signed out",
      description: "Your session has been cleared.",
      tone: "info",
    });
    router.replace("/");
  };

  const defaultPortal = profile ? resolveDefaultPortalPath(profile.roles) : "/login";

  return (
    <div className="relative flex min-h-screen flex-col bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Subtle architectural background */}
      <div
        aria-hidden="true"
        className="grit-grid-bg pointer-events-none absolute inset-x-0 top-0 h-[520px] opacity-40 [mask-image:linear-gradient(to_bottom,black,transparent)]"
      />
      <div
        aria-hidden="true"
        className="grit-spotlight pointer-events-none absolute inset-x-0 top-0 h-[440px]"
      />

      {/* Top Navigation */}
      <header className="sticky top-0 z-30 border-b border-[var(--border-hairline)] bg-[var(--bg-glass)] backdrop-blur-md">
        <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
          <Link
            href="/"
            className="flex min-w-0 items-center gap-2 whitespace-nowrap text-sm font-semibold tracking-tight text-[var(--text-primary)]"
          >
            <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span className="truncate">GRIT Interview Hub</span>
          </Link>

          <div className="flex shrink-0 items-center gap-2 sm:gap-2.5">
            <ThemeSwitch />
            {!loading && profile ? (
              <>
                <Link
                  href={defaultPortal}
                  className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] sm:px-3.5"
                >
                  <span>Open Portal</span>
                  <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] sm:px-3"
                >
                  <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Sign out</span>
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="inline-flex min-h-9 items-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-elevated)] sm:px-3.5"
                >
                  Sign in
                </Link>
                <Link
                  href="/signup"
                  className="hidden min-h-9 items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] sm:inline-flex"
                >
                  Student Signup
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 py-10 sm:px-6 sm:py-14 lg:px-8">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mb-10 rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)]/95 p-6 shadow-[var(--shadow-elevated)] sm:p-10"
        >
          <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
            <div className="max-w-2xl">
              <p className="font-mono text-[11px] font-medium uppercase tracking-widest text-[var(--accent-text)]">
                GRIT Assessment &amp; Certification Infrastructure
              </p>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[42px] sm:leading-[1.12]">
                Verify skill mastery from live interview to badge award.
              </h1>
              <p className="mt-4 max-w-xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-[15px]">
                A unified portal for student skill eligibility checks, conflict-free
                slot booking, structured interviewer evaluations, and auditable
                certification governance.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-3">
              {!loading && profile ? (
                <Link
                  href={defaultPortal}
                  className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                >
                  <span>Continue to Portal</span>
                  <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                </Link>
              ) : (
                <>
                  <Link
                    href="/login"
                    className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)]"
                  >
                    <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
                    <span>Sign in to Portal</span>
                  </Link>
                  <Link
                    href="/signup"
                    className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-elevated)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] transition-colors hover:bg-[var(--bg-subtle)]"
                  >
                    <span>Create Student Account</span>
                    <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
                  </Link>
                </>
              )}
            </div>
          </div>

          <div className="mt-8 border-t border-[var(--border-hairline)] pt-6">
            <GritProgressionTrack
              title="Certification Lifecycle Architecture"
              stages={{
                preparation: {
                  state: "completed",
                  detail: "Skill progress verified against badge rubric thresholds",
                },
                interview: {
                  state: "active",
                  detail: "Exclusion-protected slot discovery & live session booking",
                },
                evaluation: {
                  state: "upcoming",
                  detail: "Idempotent rubric outcome, feedback & retake cooldowns",
                },
                certification: {
                  state: "upcoming",
                  detail: "Operations sign-off, award issuance & integrity audit",
                },
              }}
            />
          </div>
        </motion.section>

        {/* Role Portals Grid */}
        <section aria-label="Role Portals">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Role Workspaces
            </h2>
            <span className="font-mono text-xs text-[var(--text-muted)]">
              3 Dedicated Portals
            </span>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            {PORTAL_CARDS.map((portal) => {
              const Icon = portal.icon;
              const authorized =
                profile !== null && hasAllowedRole(profile.roles, portal.roles);

              return (
                <article
                  key={portal.href}
                  className="group flex flex-col justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5 transition-colors hover:border-[var(--border-strong)]"
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-[var(--border-hairline)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
                        <Icon className="h-4 w-4" aria-hidden="true" />
                      </span>
                      <span className="font-mono text-[11px] tabular-nums text-[var(--text-muted)]">
                        {portal.index}
                      </span>
                    </div>

                    <p className="mt-4 font-mono text-[11px] text-[var(--text-muted)]">
                      {portal.subtitle}
                    </p>
                    <h3 className="mt-0.5 text-base font-semibold tracking-tight text-[var(--text-primary)]">
                      {portal.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]">
                      {portal.description}
                    </p>
                  </div>

                  <div className="mt-6 border-t border-[var(--border-hairline)] pt-4">
                    {authorized ? (
                      <Link
                        href={portal.href}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-[var(--accent-text)] hover:underline"
                      >
                        <span>Open {portal.title}</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    ) : profile ? (
                      <span className="font-mono text-[11px] text-[var(--text-muted)]">
                        Requires {portal.roles.join(" / ")} role
                      </span>
                    ) : (
                      <Link
                        href={`/login?next=${encodeURIComponent(portal.href)}`}
                        className="inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-semibold text-[var(--accent-text)] hover:underline"
                      >
                        <span>Sign in to access</span>
                        <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                      </Link>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--border-hairline)] bg-[var(--bg-surface)]/50">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-2 px-4 py-5 text-xs text-[var(--text-muted)] sm:flex-row sm:items-center sm:px-6 lg:px-8">
          <span>GRIT Interview Hub · Assessment &amp; Certification Platform</span>
          <span className="font-mono text-[11px]">
            Role-Isolated · Append-Only Audit · Transactional Booking
          </span>
        </div>
      </footer>
    </div>
  );
}
