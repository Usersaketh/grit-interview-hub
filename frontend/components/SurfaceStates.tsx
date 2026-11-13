import { AlertCircle, Info, RefreshCw } from "lucide-react";

export function SectionSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading content"
      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
    >
      <div className="mb-4 h-4 w-40 rounded bg-[var(--bg-elevated)]" />
      <div className="space-y-3">
        {Array.from({ length: rows }).map((_, idx) => (
          <div
            key={idx}
            className="flex items-center justify-between gap-4 border-t border-[var(--border-hairline)] pt-3 first:border-t-0 first:pt-0"
          >
            <div className="h-3.5 w-1/3 rounded bg-[var(--bg-elevated)]" />
            <div className="h-3.5 w-1/4 rounded bg-[var(--bg-elevated)]" />
            <div className="h-3.5 w-20 rounded bg-[var(--bg-elevated)]" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function MetricStripSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading metrics"
      className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4"
    >
      {Array.from({ length: count }).map((_, idx) => (
        <div
          key={idx}
          className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-5"
        >
          <div className="h-3 w-24 rounded bg-[var(--bg-elevated)]" />
          <div className="mt-3 h-7 w-16 rounded bg-[var(--bg-elevated)]" />
          <div className="mt-2 h-3 w-32 rounded bg-[var(--bg-elevated)]" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-6 py-10 text-center">
      <h2 className="text-base font-semibold text-[var(--text-primary)]">
        {title}
      </h2>
      <p className="mx-auto mt-1.5 max-w-md text-sm leading-relaxed text-[var(--text-secondary)]">
        {description}
      </p>
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

export function ErrorBanner({
  title = "Unable to load data",
  message,
  onRetry,
}: {
  title?: string;
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--status-error-bg)] p-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-start gap-3">
        <AlertCircle
          className="mt-0.5 h-4 w-4 shrink-0 text-[var(--status-error)]"
          aria-hidden="true"
        />
        <div>
          <p className="text-sm font-semibold text-[var(--text-primary)]">
            {title}
          </p>
          <p className="mt-0.5 text-sm text-[var(--text-secondary)]">
            {message}
          </p>
        </div>
      </div>
      {onRetry ? (
        <button
          type="button"
          onClick={onRetry}
          className="inline-flex shrink-0 items-center gap-1.5 self-start rounded-md border border-[var(--border-strong)] bg-[var(--bg-surface)] px-3 py-1.5 text-xs font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] sm:self-center"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          <span>Retry</span>
        </button>
      ) : null}
    </div>
  );
}

export function CapabilityNotice({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-elevated)] p-4">
      <Info
        className="mt-0.5 h-4 w-4 shrink-0 text-[var(--accent-primary)]"
        aria-hidden="true"
      />
      <div className="min-w-0">
        <p className="text-sm font-medium text-[var(--text-primary)]">
          {title}
        </p>
        <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
          {description}
        </p>
      </div>
    </div>
  );
}
