import { AppError } from "@backend/lib/errors";

export type EvaluationInput = {
  outcome: "PASS" | "FAIL" | "RETAKE_LATER";
  feedback?: string;
  retakeAfter?: string;
  idempotencyKey: string;
};

export type AttendanceStatus = "ATTENDED" | "LATE" | "NO_SHOW";

export type StartInterviewInput = {
  studentAttendance?: AttendanceStatus;
  interviewerAttendance?: AttendanceStatus;
  notes?: string;
  idempotencyKey: string;
};

export type CompleteSessionInput = {
  studentAttendance?: AttendanceStatus;
  interviewerAttendance?: AttendanceStatus;
  notes?: string;
  idempotencyKey: string;
};

export type RecordAttendanceInput = {
  studentAttendance: AttendanceStatus;
  interviewerAttendance: AttendanceStatus;
  notes?: string;
  markNoShow?: boolean;
  idempotencyKey: string;
};

export function mapEvaluationRpcError(error: {
  code?: string;
  message: string;
}): AppError {
  const message = (error.message ?? "").toLowerCase();

  if (message.includes("unauthenticated")) {
    return new AppError("UNAUTHENTICATED", 401, "Authentication is required");
  }

  if (
    message.includes("not_assigned_interviewer") ||
    message.includes("interviewer_role_required") ||
    message.includes("profile_inactive") ||
    message.includes("forbidden")
  ) {
    return new AppError(
      "FORBIDDEN",
      403,
      "Only an active, assigned interviewer or staff member may perform this action"
    );
  }

  if (message.includes("interview_not_found")) {
    return new AppError("NOT_FOUND", 404, "Interview not found");
  }

  if (
    message.includes("retake_after_required") ||
    message.includes("idempotency_key_required") ||
    message.includes("invalid_idempotency_key") ||
    message.includes("outcome_required")
  ) {
    return new AppError(
      "VALIDATION_ERROR",
      422,
      "The interview request contains invalid or missing fields"
    );
  }

  if (message.includes("invalid_interview_status")) {
    return new AppError(
      "INVALID_INTERVIEW_STATUS",
      409,
      "This action is not valid for the interview's current status"
    );
  }

  if (
    message.includes("evaluation_exists") ||
    message.includes("evaluation_conflict") ||
    message.includes("idempotency_key_reused") ||
    error.code === "23505"
  ) {
    return new AppError(
      "EVALUATION_CONFLICT",
      409,
      "An evaluation already exists or the idempotency key was reused"
    );
  }

  return new AppError(
    "EVALUATION_FAILED",
    400,
    "Interview operation could not be completed"
  );
}

export async function submitEvaluation(
  db: any,
  interviewId: string,
  input: EvaluationInput
) {
  const { data, error } = await db.rpc("submit_interview_result", {
    p_interview_id: interviewId,
    p_outcome: input.outcome,
    p_feedback: input.feedback ?? null,
    p_retake_after: input.retakeAfter ?? null,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) throw mapEvaluationRpcError(error);

  return data;
}

export async function startInterviewSession(
  db: any,
  interviewId: string,
  input: StartInterviewInput
) {
  const { data, error } = await db.rpc("start_interview", {
    p_interview_id: interviewId,
    p_idempotency_key: input.idempotencyKey,
    p_student_attendance: input.studentAttendance ?? "ATTENDED",
    p_interviewer_attendance: input.interviewerAttendance ?? "ATTENDED",
    p_notes: input.notes ?? null,
  });

  if (error) throw mapEvaluationRpcError(error);

  return data;
}

export async function completeInterviewSession(
  db: any,
  interviewId: string,
  input: CompleteSessionInput
) {
  const { data, error } = await db.rpc("complete_interview_session", {
    p_interview_id: interviewId,
    p_idempotency_key: input.idempotencyKey,
    p_student_attendance: input.studentAttendance ?? null,
    p_interviewer_attendance: input.interviewerAttendance ?? null,
    p_notes: input.notes ?? null,
  });

  if (error) throw mapEvaluationRpcError(error);

  return data;
}

export async function recordInterviewAttendance(
  db: any,
  interviewId: string,
  input: RecordAttendanceInput
) {
  const { data, error } = await db.rpc("record_interview_attendance", {
    p_interview_id: interviewId,
    p_student_attendance: input.studentAttendance,
    p_interviewer_attendance: input.interviewerAttendance,
    p_notes: input.notes ?? null,
    p_mark_no_show: Boolean(input.markNoShow),
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) throw mapEvaluationRpcError(error);

  return data;
}

export async function getInterviewWorkspaceDetail(db: any, interviewId: string) {
  const { data, error } = await db.rpc("get_interview_workspace_detail", {
    p_interview_id: interviewId,
  });

  if (error) throw mapEvaluationRpcError(error);

  return data;
}
