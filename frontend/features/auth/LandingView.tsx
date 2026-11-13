"use client";

import Link from "next/link";
import { ArrowRight, Award, CalendarCheck2, ShieldCheck } from "lucide-react";
import { AppShell } from "@frontend/components/AppShell";
import { useAuth } from "@frontend/hooks/useAuth";
import { resolveDefaultPortalPath } from "@frontend/lib/domain";

const PORTAL_ENTRIES = [
  {
    role: "STUDENT" as const,
    title: "Student Portal",
    href: "/student",
    description:
      "Track verified skill clearances, check badge eligibility, book live interviews, and inspect certification and malpractice status.",
    icon: Award,
  },
  {
    role: "INTERVIEWER" as const,
    title: "Interviewer Portal",
    href: "/interviewer",
    description:
      "Manage recurring weekly availability, review assigned schedules, and submit idempotent interview evaluations.",
    icon: CalendarCheck2,
  },
  {
    role: "OPERATIONS" as const,
    title: "Operations & Admin Portal",
    href: "/operations",
    description:
      "Monitor the interview pipeline, approve pending badge certifications, and oversee malpractice review and reinstatement workflows.",
    icon: ShieldCheck,
  },
];

export function LandingView() {
  const { profile, loading } = useAuth();

  return (
    <AppShell sectionLabel="Platform Overview">
      <section className="mb-8 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6 sm:p-8">
        <p className="text-xs font-medium text-[var(--accent-text)]">
          Badge Certification & Interview Operations
        </p>
        <h1 className="mt-2 max-w-2xl text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[32px] sm:leading-[1.2]">
          GRIT Interview Hub
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)] sm:text-[15px]">
          Centralized scheduling, evaluation, badge certification approval, and
          integrity review for GRIT skill-based badge assessments.
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          {!loading && profile ? (
            <Link
              href={resolveDefaultPortalPath(profile.roles)}
              className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
            >
              <span>Go to Your Portal</span>
              <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
            </Link>
          ) : (
            <>
              <Link
                href="/login"
                className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-sm font-medium text-white hover:bg-[var(--accent-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
              >
                <span>Sign in to Continue</span>
                <ArrowRight className="h-4 w-4 shrink-0" aria-hidden="true" />
              </Link>
              <Link
                href="/signup"
                className="inline-flex min-h-10 items-center whitespace-nowrap rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
              >
                Create Student Account
              </Link>
            </>
          )}
        </div>
      </section>

      <section aria-label="Role Portals" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PORTAL_ENTRIES.map((portal) => {
          const Icon = portal.icon;
          const authorized =
            profile !== null &&
            (portal.role === "OPERATIONS"
              ? profile.roles.includes("OPERATIONS") ||
                profile.roles.includes("ADMIN")
              : profile.roles.includes(portal.role));

          return (
            <article
              key={portal.href}
              className="flex flex-col justify-between rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
            >
              <div>
                <div className="flex items-center gap-2.5">
                  <Icon
                    className="h-4 w-4 shrink-0 text-[var(--accent-primary)]"
                    aria-hidden="true"
                  />
                  <h2 className="text-base font-semibold text-[var(--text-primary)]">
                    {portal.title}
                  </h2>
                </div>
                <p className="mt-2.5 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {portal.description}
                </p>
              </div>

              <div className="mt-5 border-t border-[var(--border-hairline)] pt-4">
                {authorized ? (
                  <Link
                    href={portal.href}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent-text)] hover:underline"
                  >
                    <span>Open {portal.title}</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                ) : profile ? (
                  <span className="text-xs text-[var(--text-muted)]">
                    Requires {portal.role} role
                  </span>
                ) : (
                  <Link
                    href={`/login?next=${encodeURIComponent(portal.href)}`}
                    className="inline-flex items-center gap-1.5 text-sm font-medium text-[var(--accent-text)] hover:underline"
                  >
                    <span>Sign in to access</span>
                    <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
                  </Link>
                )}
              </div>
            </article>
          );
        })}
      </section>
    </AppShell>
  );
}
