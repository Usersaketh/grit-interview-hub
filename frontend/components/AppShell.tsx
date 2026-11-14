"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import {
  Award,
  Calendar,
  CalendarClock,
  FileText,
  History,
  LayoutDashboard,
  Loader2,
  LogOut,
  Mail,
  Menu,
  ShieldAlert,
  ShieldCheck,
  Terminal,
  Users,
  X,
} from "lucide-react";
import { useAuth } from "@frontend/hooks/useAuth";
import { useToast } from "@frontend/hooks/useToast";
import { ThemeSwitch } from "@frontend/components/ThemeSwitch";
import { SectionSkeleton } from "@frontend/components/SurfaceStates";
import { resolvePortalRedirect } from "@frontend/lib/domain";
import type { AppRole } from "@frontend/types/api";

interface NavItem {
  label: string;
  href: string;
  icon: typeof LayoutDashboard;
}

interface NavSection {
  title: string;
  roles: AppRole[];
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  {
    title: "Student Portal",
    roles: ["STUDENT"],
    items: [
      { label: "Dashboard", href: "/student", icon: LayoutDashboard },
      { label: "Book Interview", href: "/student/interviews/book", icon: CalendarClock },
      { label: "My Interviews", href: "/student/interviews", icon: Calendar },
      { label: "My Badges", href: "/student/badges", icon: Award },
      { label: "Malpractice Status", href: "/student/malpractice", icon: ShieldAlert },
    ],
  },
  {
    title: "Interviewer Portal",
    roles: ["INTERVIEWER"],
    items: [
      { label: "Overview", href: "/interviewer", icon: LayoutDashboard },
      { label: "Schedule", href: "/interviewer/schedule", icon: Calendar },
      { label: "Availability", href: "/interviewer/availability", icon: CalendarClock },
      { label: "Evaluation History", href: "/interviewer/history", icon: History },
    ],
  },
  {
    title: "Operations Portal",
    roles: ["OPERATIONS", "ADMIN"],
    items: [
      { label: "Overview", href: "/operations", icon: LayoutDashboard },
      { label: "Students", href: "/operations/students", icon: Users },
      { label: "Invitations", href: "/operations/invitations", icon: Mail },
      { label: "Interviews", href: "/operations/interviews", icon: Calendar },
      { label: "Availability", href: "/operations/availability", icon: CalendarClock },
      { label: "Certifications", href: "/operations/certifications", icon: ShieldCheck },
      { label: "Malpractice", href: "/operations/malpractice", icon: ShieldAlert },
      { label: "Audit History", href: "/operations/audit", icon: FileText },
    ],
  },
];

interface AppShellProps {
  allowedRoles?: AppRole[];
  sectionLabel?: string;
  children: React.ReactNode;
}

export function AppShell({
  allowedRoles,
  sectionLabel,
  children,
}: AppShellProps) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { profile, loading, error, signOut, refreshProfile } = useAuth();
  const { pushToast } = useToast();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const lastRedirectKeyRef = useRef<string | null>(null);

  const visibleSections = profile
    ? NAV_SECTIONS.filter((section) =>
        section.roles.some((role) => profile.roles.includes(role))
      )
    : [];

  const hasAccess =
    !allowedRoles ||
    (profile !== null &&
      allowedRoles.some((role) => profile.roles.includes(role)));

  useEffect(() => {
    if (!allowedRoles || loading || error) return;

    const search =
      typeof window !== "undefined" ? window.location.search : "";
    const decision = resolvePortalRedirect({
      pathname,
      search,
      profile,
      loading,
    });

    if (!decision) {
      lastRedirectKeyRef.current = null;
      return;
    }

    const key = `${pathname}|${decision.reason}|${decision.target}`;
    if (lastRedirectKeyRef.current === key) return;
    lastRedirectKeyRef.current = key;

    if (decision.toastTitle) {
      pushToast({
        title: decision.toastTitle,
        description: decision.toastDescription,
        tone: "warning",
      });
    }

    router.replace(decision.target);
  }, [allowedRoles, loading, error, pathname, profile, pushToast, router]);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

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

  const renderNavLinks = (onNavigate?: () => void) => (
    <div className="space-y-6">
      {visibleSections.map((section) => (
        <div key={section.title}>
          <p className="mb-2 px-3 font-mono text-[10px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">
            {section.title}
          </p>
          <ul className="space-y-0.5">
            {section.items.map((item) => {
              const Icon = item.icon;
              const isRoot =
                item.href === "/student" ||
                item.href === "/interviewer" ||
                item.href === "/operations";
              const active = isRoot
                ? pathname === item.href
                : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    className={`group flex min-h-9 items-center gap-2.5 whitespace-nowrap rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] ${
                      active
                        ? "bg-[var(--accent-soft)] text-[var(--accent-text)] shadow-[inset_2px_0_0_var(--accent-primary)]"
                        : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                    }`}
                  >
                    <Icon
                      className={`h-4 w-4 shrink-0 transition-colors ${
                        active
                          ? "text-[var(--accent-primary)]"
                          : "text-[var(--text-muted)] group-hover:text-[var(--text-primary)]"
                      }`}
                      aria-hidden="true"
                    />
                    <span className="truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );

  const showRedirectingPlaceholder =
    Boolean(allowedRoles) && !loading && !error && (!profile || !hasAccess);

  return (
    <div className="flex min-h-screen bg-[var(--bg-canvas)] text-[var(--text-primary)]">
      {/* Desktop persistent sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-surface)] lg:flex">
        <div className="flex h-14 items-center justify-between border-b border-[var(--border-hairline)] px-5">
          <Link
            href="/"
            className="flex items-center gap-2.5 whitespace-nowrap text-sm font-semibold tracking-tight text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
          >
            <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
              <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
            <span>GRIT Interview Hub</span>
          </Link>
        </div>

        <nav
          aria-label="Primary navigation"
          className="flex-1 overflow-y-auto px-3 py-5"
        >
          {loading ? (
            <div className="space-y-2 px-3">
              <div className="h-3.5 w-24 rounded bg-[var(--bg-elevated)]" />
              <div className="h-8 w-full rounded bg-[var(--bg-elevated)]" />
              <div className="h-8 w-full rounded bg-[var(--bg-elevated)]" />
              <div className="h-8 w-full rounded bg-[var(--bg-elevated)]" />
            </div>
          ) : visibleSections.length > 0 ? (
            renderNavLinks()
          ) : (
            <div className="rounded-md border border-[var(--border-hairline)] bg-[var(--bg-canvas)]/60 p-3 text-xs leading-relaxed text-[var(--text-secondary)]">
              Sign in with an authorized GRIT account to unlock portal navigation.
            </div>
          )}
        </nav>

        {profile ? (
          <div className="border-t border-[var(--border-hairline)] bg-[var(--bg-canvas)]/40 p-4">
            <div className="flex items-center justify-between gap-2">
              <p className="truncate text-xs font-semibold text-[var(--text-primary)]">
                {profile.full_name}
              </p>
              <span className="shrink-0 rounded border border-[var(--border-hairline)] bg-[var(--bg-elevated)] px-1.5 py-0.5 font-mono text-[10px] uppercase text-[var(--accent-text)]">
                {profile.roles[0] ?? "USER"}
              </span>
            </div>
            <p className="mt-0.5 truncate font-mono text-[11px] text-[var(--text-muted)]">
              {profile.email}
            </p>
          </div>
        ) : null}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileMenuOpen ? (
        <div className="fixed inset-0 z-50 flex lg:hidden" role="presentation">
          <div
            className="fixed inset-0 bg-black/60 backdrop-blur-xs"
            onClick={() => setMobileMenuOpen(false)}
          />
          <aside className="relative z-10 flex w-72 max-w-[85vw] flex-col border-r border-[var(--border-hairline)] bg-[var(--bg-surface)]">
            <div className="flex h-14 items-center justify-between border-b border-[var(--border-hairline)] px-4">
              <Link
                href="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 whitespace-nowrap text-sm font-semibold tracking-tight text-[var(--text-primary)]"
              >
                <span className="inline-flex h-6 w-6 items-center justify-center rounded border border-[var(--border-strong)] bg-[var(--bg-elevated)] text-[var(--accent-primary)]">
                  <Terminal className="h-3.5 w-3.5" aria-hidden="true" />
                </span>
                <span>GRIT Interview Hub</span>
              </Link>
              <button
                type="button"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
                className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <nav
              aria-label="Mobile navigation"
              className="flex-1 overflow-y-auto px-3 py-4"
            >
              {renderNavLinks(() => setMobileMenuOpen(false))}
            </nav>
            {profile ? (
              <div className="border-t border-[var(--border-hairline)] p-4">
                <p className="truncate text-sm font-medium text-[var(--text-primary)]">
                  {profile.full_name}
                </p>
                <p className="truncate font-mono text-[11px] text-[var(--text-secondary)]">
                  {profile.roles.join(" · ")}
                </p>
              </div>
            ) : null}
          </aside>
        </div>
      ) : null}

      {/* Main content area */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-4 border-b border-[var(--border-hairline)] bg-[var(--bg-glass)] px-4 backdrop-blur-md sm:px-6 lg:px-8">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              className="inline-flex h-9 w-9 items-center justify-center rounded-md border border-[var(--border-hairline)] text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] lg:hidden"
            >
              <Menu className="h-4 w-4" aria-hidden="true" />
            </button>
            <Link
              href="/"
              className="whitespace-nowrap text-sm font-semibold text-[var(--text-primary)] lg:hidden"
            >
              GRIT Hub
            </Link>
            {sectionLabel ? (
              <span className="hidden truncate font-mono text-xs text-[var(--text-secondary)] lg:inline">
                {sectionLabel}
              </span>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2.5">
            <ThemeSwitch />
            {profile ? (
              <button
                type="button"
                onClick={handleSignOut}
                disabled={signingOut}
                className="inline-flex min-h-9 items-center gap-1.5 whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] transition-colors hover:border-[var(--border-strong)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
              >
                {signingOut ? (
                  <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" aria-hidden="true" />
                ) : (
                  <LogOut className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                )}
                <span>{signingOut ? "Signing out..." : "Sign out"}</span>
              </button>
            ) : (
              <Link
                href={
                  pathname && pathname !== "/"
                    ? `/login?next=${encodeURIComponent(pathname)}`
                    : "/login"
                }
                className="inline-flex min-h-9 items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-3.5 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[var(--accent-primary-hover)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
              >
                Sign in
              </Link>
            )}
          </div>
        </header>

        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          {loading || showRedirectingPlaceholder ? (
            <div className="space-y-4">
              <SectionSkeleton rows={3} />
              <SectionSkeleton rows={4} />
            </div>
          ) : error ? (
            <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-6">
              <h1 className="text-lg font-semibold text-[var(--text-primary)]">
                Authentication Verification Error
              </h1>
              <p className="mt-2 text-sm text-[var(--text-secondary)]">
                {error}
              </p>
              <div className="mt-4 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => void refreshProfile({ force: true })}
                  className="inline-flex min-h-9 items-center whitespace-nowrap rounded-md bg-[var(--accent-primary)] px-4 py-2 text-xs font-medium text-white hover:bg-[var(--accent-primary-hover)]"
                >
                  Retry Verification
                </button>
                <Link
                  href="/login"
                  className="inline-flex min-h-9 items-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] px-4 py-2 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                >
                  Go to Sign In
                </Link>
              </div>
            </div>
          ) : (
            <motion.div
              initial={false}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              {children}
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}
