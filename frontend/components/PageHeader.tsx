import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface PageHeaderProps {
  title: string;
  description?: string;
  breadcrumbs?: BreadcrumbItem[];
  actions?: React.ReactNode;
}

export function PageHeader({
  title,
  description,
  breadcrumbs,
  actions,
}: PageHeaderProps) {
  return (
    <div className="mb-6 flex flex-col gap-4 border-b border-[var(--border-hairline)] pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {breadcrumbs && breadcrumbs.length > 0 ? (
          <nav
            aria-label="Breadcrumb"
            className="mb-2 flex flex-wrap items-center gap-1.5 font-mono text-[11px] text-[var(--text-muted)]"
          >
            {breadcrumbs.map((crumb, index) => (
              <span
                key={`${crumb.label}-${index}`}
                className="inline-flex items-center gap-1.5"
              >
                {index > 0 ? (
                  <ChevronRight
                    className="h-3 w-3 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                ) : null}
                {crumb.href ? (
                  <Link
                    href={crumb.href}
                    className="whitespace-nowrap transition-colors hover:text-[var(--text-primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
                  >
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="whitespace-nowrap font-medium text-[var(--text-secondary)]">
                    {crumb.label}
                  </span>
                )}
              </span>
            ))}
          </nav>
        ) : null}
        <h1 className="text-2xl font-semibold tracking-tight text-[var(--text-primary)] sm:text-[28px] sm:leading-[1.18]">
          {title}
        </h1>
        {description ? (
          <p className="mt-1.5 max-w-3xl text-sm leading-relaxed text-[var(--text-secondary)]">
            {description}
          </p>
        ) : null}
      </div>
      {actions ? (
        <div className="flex shrink-0 flex-wrap items-center gap-2.5">
          {actions}
        </div>
      ) : null}
    </div>
  );
}
