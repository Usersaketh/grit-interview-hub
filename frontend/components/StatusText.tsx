import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  Info,
  XCircle,
} from "lucide-react";
import type { StatusTone } from "@frontend/lib/domain";

interface StatusTextProps {
  label: string;
  tone: StatusTone;
  className?: string;
}

export function StatusText({ label, tone, className = "" }: StatusTextProps) {
  const toneClass = getToneColorClass(tone);

  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium ${toneClass} ${className}`}
    >
      <ToneIcon tone={tone} />
      <span>{label}</span>
    </span>
  );
}

function getToneColorClass(tone: StatusTone): string {
  switch (tone) {
    case "success":
      return "text-[var(--status-success)]";
    case "warning":
      return "text-[var(--status-warning)]";
    case "error":
      return "text-[var(--status-error)]";
    case "info":
      return "text-[var(--status-info)]";
    case "neutral":
      return "text-[var(--text-secondary)]";
  }
}

function ToneIcon({ tone }: { tone: StatusTone }) {
  switch (tone) {
    case "success":
      return <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "warning":
      return <Clock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "error":
      return <XCircle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "info":
      return <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
    case "neutral":
      return <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />;
  }
}
