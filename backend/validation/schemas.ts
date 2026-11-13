import { z } from "zod";
export const bookingSchema = z.object({ badgeId: z.string().uuid(), interviewerId: z.string().uuid(), startsAt: z.string().datetime({ offset: true }), endsAt: z.string().datetime({ offset: true }), timezone: z.string().min(1).max(64), idempotencyKey: z.string().uuid() }).refine((v) => new Date(v.endsAt) > new Date(v.startsAt), { message: "endsAt must be after startsAt", path: ["endsAt"] });
export const availabilitySchema = z.object({ dayOfWeek: z.number().int().min(0).max(6), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), timezone: z.string().min(1).max(64), effectiveFrom: z.string().date(), effectiveUntil: z.string().date().optional() }).refine((x) => x.endTime > x.startTime, { message: "endTime must be after startTime", path: ["endTime"] });
export const evaluationSchema = z.object({ outcome: z.enum(["PASS", "FAIL", "RETAKE_LATER"]), feedback: z.string().max(5000).optional(), retakeAfter: z.string().datetime({ offset: true }).optional(), idempotencyKey: z.string().uuid() }).superRefine((v, c) => { if (v.outcome === "RETAKE_LATER" && !v.retakeAfter) c.addIssue({ code: "custom", message: "retakeAfter is required", path: ["retakeAfter"] }); });

export const malpracticeReportSchema = z.object({
  studentId: z.string().uuid(),
  badgeId: z.string().uuid(),
  reasonCode: z.string().min(1).max(64),
  description: z.string().min(1).max(5000),
  evidenceReference: z.string().max(500).optional().nullable(),
  idempotencyKey: z.string().uuid()
});

export const malpracticeReviewSchema = z.object({
  toStatus: z.enum(["UNDER_REVIEW", "DISMISSED", "CONFIRMED", "APPEALED"]),
  reviewerNotes: z.string().max(5000).optional().nullable(),
  idempotencyKey: z.string().uuid()
});

export const malpracticeNullifySchema = z.object({
  idempotencyKey: z.string().uuid()
});

export const malpracticeReinstateSchema = z.object({
  reason: z.string().min(1).max(5000),
  idempotencyKey: z.string().uuid()
});
