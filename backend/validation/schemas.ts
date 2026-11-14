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

export const signupSchema = z
  .object({
    fullName: z.string().trim().min(2, "Full name must be at least 2 characters").max(120),
    email: z.string().trim().email("Enter a valid email address").max(254),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(/[A-Za-z]/, "Password must include at least one letter")
      .regex(/\d/, "Password must include at least one number"),
    confirmPassword: z.string(),
    campusRef: z.string().trim().max(120).optional(),
  })
  .strict()
  .refine((v) => v.password === v.confirmPassword, {
    message: "Passwords do not match",
    path: ["confirmPassword"],
  });

export const createInvitationSchema = z
  .object({
    email: z.string().trim().email("Enter a valid email address").max(254),
    fullName: z.string().trim().min(2).max(120).optional(),
    defaultTimezone: z.string().trim().min(1).max(64).default("Asia/Kolkata"),
    title: z.string().trim().min(2).max(120).optional(),
    expertiseTags: z.array(z.string().trim().min(1).max(48)).max(12).default([]),
    expiresInDays: z.number().int().min(1).max(30).default(7),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const revokeInvitationSchema = z
  .object({
    reason: z.string().trim().max(500).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const acceptInvitationSchema = z
  .object({
    invitationId: z.string().uuid("Valid invitation ID is required"),
    fullName: z.string().trim().min(2).max(120).optional(),
  })
  .strict();

export const slotsQuerySchema = z.object({
  badgeId: z.string().uuid(),
  interviewerId: z.string().uuid().optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  excludeInterviewId: z.string().uuid().optional(),
  durationMinutes: z.coerce.number().int().min(15).max(180).default(45),
});

export const cancelBookingSchema = z
  .object({
    reason: z.string().trim().min(5, "Provide a brief cancellation reason").max(1000),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const rescheduleBookingSchema = z
  .object({
    newInterviewerId: z.string().uuid(),
    newStartsAt: z.string().datetime({ offset: true }),
    newEndsAt: z.string().datetime({ offset: true }),
    timezone: z.string().trim().min(1).max(64),
    reason: z.string().trim().min(5, "Provide a brief rescheduling reason").max(1000),
    idempotencyKey: z.string().uuid(),
  })
  .strict()
  .refine((v) => new Date(v.newEndsAt) > new Date(v.newStartsAt), {
    message: "newEndsAt must be after newStartsAt",
    path: ["newEndsAt"],
  });

export const attendanceStatusSchema = z.enum(["ATTENDED", "LATE", "NO_SHOW"]);

export const startInterviewSchema = z
  .object({
    studentAttendance: attendanceStatusSchema.default("ATTENDED"),
    interviewerAttendance: attendanceStatusSchema.default("ATTENDED"),
    notes: z.string().trim().max(2000).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const completeSessionSchema = z
  .object({
    studentAttendance: attendanceStatusSchema.optional(),
    interviewerAttendance: attendanceStatusSchema.optional(),
    notes: z.string().trim().max(2000).optional(),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const recordAttendanceSchema = z
  .object({
    studentAttendance: attendanceStatusSchema,
    interviewerAttendance: attendanceStatusSchema,
    notes: z.string().trim().max(2000).optional(),
    markNoShow: z.boolean().default(false),
    idempotencyKey: z.string().uuid(),
  })
  .strict();

export const certificationListQuerySchema = z.object({
  status: z
    .enum([
      "LOCKED",
      "ELIGIBLE_FOR_INTERVIEW",
      "CERTIFICATION_PENDING",
      "AWARDED",
      "NULLIFICATION_UNDER_REVIEW",
      "NULLIFIED",
      "REINSTATED",
    ])
    .optional(),
  search: z.string().trim().max(120).optional(),
});

export const auditLogsQuerySchema = z.object({
  actorId: z.string().uuid().optional(),
  entityType: z.string().trim().min(1).max(64).optional(),
  entityId: z.string().uuid().optional(),
  action: z.string().trim().min(1).max(64).optional(),
  search: z.string().trim().max(120).optional(),
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
