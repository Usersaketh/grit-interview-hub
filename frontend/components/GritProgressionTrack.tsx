import { Check, CircleDot, AlertTriangle } from "lucide-react";

export type ProgressionStageKey =
  | "preparation"
  | "interview"
  | "evaluation"
  | "certification";

export type ProgressionStageState =
  | "completed"
  | "active"
  | "upcoming"
  | "attention";

export interface ProgressionStageInput {
  key: ProgressionStageKey;
  label: string;
  detail?: string;
  state: ProgressionStageState;
}

const DEFAULT_STAGES: Array<{
  key: ProgressionStageKey;
  label: string;
  defaultDetail: string;
}> = [
  {
    key: "preparation",
    label: "Preparation",
    defaultDetail: "Skill verification & eligibility clearance",
  },
  {
    key: "interview",
    label: "Interview",
    defaultDetail: "Live technical slot & session attendance",
  },
  {
    key: "evaluation",
    label: "Evaluation",
    defaultDetail: "Rubric outcome & assessor feedback",
  },
  {
    key: "certification",
    label: "Certification",
    defaultDetail: "Governance review & badge issuance",
  },
];

interface GritProgressionTrackProps {
  stages?: Partial<Record<ProgressionStageKey, { state: ProgressionStageState; detail?: string }>>;
  activeStage?: ProgressionStageKey;
  compact?: boolean;
  title?: string;
}

export function GritProgressionTrack({
  stages,
  activeStage,
  compact = false,
  title,
}: GritProgressionTrackProps) {
  const activeIndex = activeStage
    ? DEFAULT_STAGES.findIndex((s) => s.key === activeStage)
    : -1;

  const resolved: ProgressionStageInput[] = DEFAULT_STAGES.map((item, idx) => {
    const override = stages?.[item.key];
    let state: ProgressionStageState = "upcoming";
    if (override) {
      state = override.state;
    } else if (activeIndex >= 0) {
      if (idx < activeIndex) state = "completed";
      else if (idx === activeIndex) state = "active";
      else state = "upcoming";
    }
    return {
      key: item.key,
      label: item.label,
      detail: override?.detail ?? item.defaultDetail,
      state,
    };
  });

  return (
    <section
      aria-label={title ?? "GRIT Certification Progression"}
      className="rounded-lg border border-[var(--border-hairline)] bg-[var(--bg-surface)] p-4 sm:p-5"
    >
      {title ? (
        <div className="mb-3.5 flex items-center justify-between gap-2">
          <span className="font-mono text-[11px] font-medium uppercase tracking-wider text-[var(--text-muted)]">
            {title}
          </span>
          <span className="font-mono text-[11px] text-[var(--text-secondary)]">
            01 → 04
          </span>
        </div>
      ) : null}

      <ol className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {resolved.map((stage, idx) => {
          const isCompleted = stage.state === "completed";
          const isActive = stage.state === "active";
          const isAttention = stage.state === "attention";

          const borderClass = isActive
            ? "border-[var(--accent-primary)] bg-[var(--accent-soft)]"
            : isAttention
              ? "border-[var(--status-warning)] bg-[var(--status-warning-bg)]"
              : isCompleted
                ? "border-[var(--border-strong)] bg-[var(--bg-elevated)]"
                : "border-[var(--border-hairline)] bg-[var(--bg-canvas)]/50";

          return (
            <li
              key={stage.key}
              className={`relative flex flex-col justify-between rounded-md border p-3.5 transition-colors ${borderClass}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-mono text-[11px] font-medium tabular-nums text-[var(--text-muted)]">
                  {String(idx + 1).padStart(2, "0")}
                </span>
                {isCompleted ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--status-success)]">
                    <Check className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Done</span>
                  </span>
                ) : isActive ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--accent-text)]">
                    <CircleDot className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Active</span>
                  </span>
                ) : isAttention ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[var(--status-warning)]">
                    <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>Action</span>
                  </span>
                ) : (
                  <span className="text-[11px] text-[var(--text-muted)]">
                    Queued
                  </span>
                )}
              </div>

              <div className={compact ? "mt-2" : "mt-3"}>
                <p
                  className={`text-sm font-semibold tracking-tight ${
                    isActive || isCompleted || isAttention
                      ? "text-[var(--text-primary)]"
                      : "text-[var(--text-secondary)]"
                  }`}
                >
                  {stage.label}
                </p>
                {!compact && stage.detail ? (
                  <p className="mt-1 text-xs leading-relaxed text-[var(--text-secondary)]">
                    {stage.detail}
                  </p>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
