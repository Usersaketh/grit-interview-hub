"use client";

import { useEffect } from "react";
import { motion } from "motion/react";
import { X } from "lucide-react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  busy?: boolean;
  children?: React.ReactNode;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive = false,
  busy = false,
  children,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs"
      role="presentation"
      onClick={(event) => {
        if (event.target === event.currentTarget && !busy) {
          onCancel();
        }
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.98, y: 6 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-dialog-title"
        aria-describedby="confirm-dialog-desc"
        className="w-full max-w-md rounded-lg border border-[var(--border-strong)] bg-[var(--bg-surface)] p-6 shadow-[var(--shadow-elevated)]"
      >
        <div className="flex items-start justify-between gap-4">
          <h2
            id="confirm-dialog-title"
            className="text-lg font-semibold text-[var(--text-primary)]"
          >
            {title}
          </h2>
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close dialog"
            className="rounded p-1 text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)] disabled:opacity-50"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <p
          id="confirm-dialog-desc"
          className="mt-2 text-sm leading-relaxed text-[var(--text-secondary)]"
        >
          {description}
        </p>

        {children ? <div className="mt-4">{children}</div> : null}

        <div className="mt-6 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md border border-[var(--border-hairline)] bg-[var(--bg-surface)] px-4 py-2 text-sm font-medium text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] disabled:opacity-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className={`inline-flex min-h-10 items-center justify-center whitespace-nowrap rounded-md px-4 py-2 text-sm font-medium text-white transition-colors disabled:opacity-60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent-primary)] ${
              destructive
                ? "bg-[var(--status-error)] hover:opacity-90"
                : "bg-[var(--accent-primary)] hover:bg-[var(--accent-primary-hover)]"
            }`}
          >
            {busy ? "Processing..." : confirmLabel}
          </button>
        </div>
      </motion.div>
    </div>
  );
}
