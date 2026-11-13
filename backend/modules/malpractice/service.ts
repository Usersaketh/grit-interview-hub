import { AppError } from "@backend/lib/errors";
import { z } from "zod";

export type MalpracticeReportInput = {
  studentId: string;
  badgeId: string;
  reasonCode: string;
  description: string;
  evidenceReference?: string | null;
  idempotencyKey: string;
};

export type MalpracticeReviewInput = {
  toStatus: "UNDER_REVIEW" | "DISMISSED" | "CONFIRMED" | "APPEALED";
  reviewerNotes?: string | null;
  idempotencyKey: string;
};

export type MalpracticeNullifyInput = {
  idempotencyKey: string;
};

export type MalpracticeReinstateInput = {
  reason: string;
  idempotencyKey: string;
};

export type ApproveBadgeCertificationInput = {
  badgeAwardId: string;
  idempotencyKey: string;
};

export type MalpracticeQueueRow = {
  id: string;
  student_id: string;
  badge_id: string;
  reported_by: string;
  reason_code: string;
  description: string;
  evidence_reference: string | null;
  status: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
};

export type StudentBadgeAwardStatus = {
  recordType: "badge_award";
  badgeId: string | null;
  awardId: string | null;
  awardStatus: string | null;
  awardedAt: string | null;
  nullifiedAt: string | null;
  reinstatedAt: string | null;
};

export type StudentMalpracticeReportStatus = {
  recordType: "malpractice_report";
  badgeId: string | null;
  reportId: string | null;
  reportStatus: string | null;
  reportCreatedAt: string | null;
};

export type StudentMalpracticeStatusRow =
  | StudentBadgeAwardStatus
  | StudentMalpracticeReportStatus;

export type StudentMalpracticeStatus = {
  studentId: string;
  records: StudentMalpracticeStatusRow[];
};

type MalpracticeRpcError = {
  message?: string;
  code?: string;
};

export function mapMalpracticeRpcError(error: MalpracticeRpcError): AppError {
  const message = (error.message ?? "").toLowerCase();

  if (message.includes("staff_role_required")) {
    return new AppError("FORBIDDEN", 403, "Only operations or admin staff can perform this action");
  }
  if (message.includes("reporter_cannot_review_own_case")) {
    return new AppError("FORBIDDEN", 403, "A reporter cannot review their own case");
  }
  if (message.includes("student_not_found")) {
    return new AppError("NOT_FOUND", 404, "Student not found");
  }
  if (message.includes("badge_not_found_or_inactive")) {
    return new AppError("BADGE_NOT_FOUND", 404, "Badge not found or inactive");
  }
  if (message.includes("report_not_found")) {
    return new AppError("NOT_FOUND", 404, "Malpractice report not found");
  }
  if (message.includes("report_not_confirmed")) {
    return new AppError("INVALID_CASE_STATE", 409, "Only a confirmed malpractice case can trigger badge nullification");
  }
  if (message.includes("report_not_appealed")) {
    return new AppError("INVALID_CASE_STATE", 409, "Reinstatement requires an appealed malpractice case");
  }
  if (message.includes("report_not_resolved")) {
    return new AppError("INVALID_CASE_STATE", 409, "Reinstatement requires a resolved (dismissed or appealed) malpractice case");
  }
  if (message.includes("no_awarded_badge_to_nullify")) {
    return new AppError("NO_AWARDED_BADGE", 409, "No awarded badge exists for this student and badge");
  }
  if (message.includes("no_nullified_badge_to_reinstate")) {
    return new AppError("NO_NULLIFIED_BADGE", 409, "No nullified badge exists for this student and badge");
  }
  if (message.includes("badge_award_not_found")) {
    return new AppError("NOT_FOUND", 404, "Badge award not found");
  }
  if (message.includes("badge_award_not_pending")) {
    return new AppError("INVALID_CASE_STATE", 409, "Only a pending certification can be awarded");
  }
  if (message.includes("ambiguous_award_selection")) {
    return new AppError("AMBIGUOUS_AWARD", 409, "Multiple awards match this student and badge; cannot select one deterministically");
  }
  if (message.includes("outstanding_malpractice_case")) {
    return new AppError("OUTSTANDING_CASE", 409, "An outstanding malpractice case already exists for this student and badge");
  }
  if (message.includes("unique_violation") || error.code === "23505") {
    return new AppError("OUTSTANDING_CASE", 409, "An outstanding malpractice case already exists for this student and badge");
  }
  if (message.includes("invalid_transition")) {
    return new AppError("INVALID_TRANSITION", 409, "Invalid malpractice case state transition");
  }
  if (message.includes("reason_code_required") || message.includes("description_required") || message.includes("reason_required") || message.includes("idempotency_key_required") || message.includes("to_status_required")) {
    return new AppError("VALIDATION_ERROR", 422, "The request contains invalid or missing fields");
  }
  if (message.includes("idempotency_key_reused")) {
    return new AppError("IDEMPOTENCY_KEY_REUSED", 409, "This idempotency key was already used for a different request. Use a new key.");
  }
  if (message.includes("invalid_idempotency_key")) {
    return new AppError("VALIDATION_ERROR", 422, "Invalid idempotency key");
  }
  if (message.includes("unauthenticated")) {
    return new AppError("UNAUTHENTICATED", 401, "Authentication is required");
  }

  return new AppError("MALPRACTICE_FAILED", 400, "Malpractice operation could not be completed");
}

export async function createMalpracticeReport(db: any, input: MalpracticeReportInput) {
  const { data, error } = await db.rpc("create_malpractice_report", {
    p_student_id: input.studentId,
    p_badge_id: input.badgeId,
    p_reason_code: input.reasonCode,
    p_description: input.description,
    p_evidence_reference: input.evidenceReference ?? null,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) throw mapMalpracticeRpcError(error);

  return data;
}

export async function reviewMalpracticeReport(db: any, reportId: string, input: MalpracticeReviewInput) {
  const { data, error } = await db.rpc("review_malpractice_report", {
    p_report_id: reportId,
    p_to_status: input.toStatus,
    p_reviewer_notes: input.reviewerNotes ?? null,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) throw mapMalpracticeRpcError(error);

  return data;
}

export async function nullifyBadgeAward(db: any, reportId: string, input: MalpracticeNullifyInput) {
  const { data, error } = await db.rpc("nullify_badge_award", {
    p_report_id: reportId,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) throw mapMalpracticeRpcError(error);

  return data;
}

export async function reinstateBadgeAward(db: any, reportId: string, input: MalpracticeReinstateInput) {
  const { data, error } = await db.rpc("reinstate_badge_award", {
    p_report_id: reportId,
    p_reason: input.reason,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) throw mapMalpracticeRpcError(error);

  return data;
}

export async function approveBadgeCertification(db: any, input: ApproveBadgeCertificationInput) {
  const { data, error } = await db.rpc("approve_badge_certification", {
    p_badge_award_id: input.badgeAwardId,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) throw mapMalpracticeRpcError(error);

  return data;
}

export async function getMalpracticeQueue(db: any) {
  const { data, error } = await db.rpc("malpractice_queue");

  if (error) throw mapMalpracticeRpcError(error);

  return data;
}

type StudentMalpracticeRpcRow = {
  record_type: string;
  badge_id: string | null;
  award_id: string | null;
  award_status: string | null;
  awarded_at: string | null;
  nullified_at: string | null;
  reinstated_at: string | null;
  report_id: string | null;
  report_status: string | null;
  report_created_at: string | null;
};

const uuidOrNull = z.string().uuid().nullable();
const timestampOrNull = z.string().datetime({ offset: true }).nullable();
const certificationStatusOrNull = z.enum([
  "LOCKED",
  "ELIGIBLE_FOR_INTERVIEW",
  "CERTIFICATION_PENDING",
  "AWARDED",
  "NULLIFICATION_UNDER_REVIEW",
  "NULLIFIED",
  "REINSTATED",
]).nullable();
const malpracticeStatusOrNull = z.enum([
  "REPORTED",
  "UNDER_REVIEW",
  "DISMISSED",
  "CONFIRMED",
  "APPEALED",
  "REINSTATED",
]).nullable();

const studentMalpracticeRpcRowSchema = z.discriminatedUnion("record_type", [
  z.object({
    record_type: z.literal("badge_award"),
    badge_id: uuidOrNull,
    award_id: uuidOrNull,
    award_status: certificationStatusOrNull,
    awarded_at: timestampOrNull,
    nullified_at: timestampOrNull,
    reinstated_at: timestampOrNull,
    report_id: uuidOrNull,
    report_status: malpracticeStatusOrNull,
    report_created_at: timestampOrNull,
  }),
  z.object({
    record_type: z.literal("malpractice_report"),
    badge_id: uuidOrNull,
    award_id: uuidOrNull,
    award_status: certificationStatusOrNull,
    awarded_at: timestampOrNull,
    nullified_at: timestampOrNull,
    reinstated_at: timestampOrNull,
    report_id: uuidOrNull,
    report_status: malpracticeStatusOrNull,
    report_created_at: timestampOrNull,
  }),
]);

const studentMalpracticeRpcResponseSchema = z.array(studentMalpracticeRpcRowSchema);

function validateStudentMalpracticeRpcResponse(data: unknown): StudentMalpracticeRpcRow[] {
  const result = studentMalpracticeRpcResponseSchema.safeParse(data);
  if (!result.success) {
    throw new AppError("MALPRACTICE_FAILED", 500, "Malpractice status response is malformed");
  }
  return result.data;
}

function mapStudentMalpracticeRpcRow(row: StudentMalpracticeRpcRow): StudentMalpracticeStatusRow {
  switch (row.record_type) {
    case "badge_award":
      return {
        recordType: "badge_award",
        badgeId: row.badge_id,
        awardId: row.award_id,
        awardStatus: row.award_status,
        awardedAt: row.awarded_at,
        nullifiedAt: row.nullified_at,
        reinstatedAt: row.reinstated_at,
      };
    case "malpractice_report":
      return {
        recordType: "malpractice_report",
        badgeId: row.badge_id,
        reportId: row.report_id,
        reportStatus: row.report_status,
        reportCreatedAt: row.report_created_at,
      };
    default:
      throw new AppError("MALPRACTICE_FAILED", 500, `Unexpected record type: ${row.record_type}`);
  }
}

export async function getStudentMalpracticeStatus(db: any) {
  const { data, error } = await db.rpc("student_malpractice_status");

  if (error) throw mapMalpracticeRpcError(error);

  if (data === null || data === undefined) {
    return [];
  }

  const rows = validateStudentMalpracticeRpcResponse(data);
  return rows.map(mapStudentMalpracticeRpcRow);
}
