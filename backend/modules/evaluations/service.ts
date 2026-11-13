import { AppError } from "@backend/lib/errors";

export type EvaluationInput = {
  outcome: "PASS" | "FAIL" | "RETAKE_LATER";
  feedback?: string;
  retakeAfter?: string;
  idempotencyKey: string;
};

export function mapEvaluationRpcError(error: {
  code?: string;
  message: string;
}): AppError {
  const message = error.message.toLowerCase();

  if (
    message.includes("not_assigned_interviewer") ||
    message.includes("interviewer_role_required") ||
    message.includes("profile_inactive")
  ) {
    return new AppError(
      "FORBIDDEN",
      403,
      "Only an active, assigned interviewer may submit this evaluation"
    );
  }

  if (message.includes("interview_not_found")) {
    return new AppError("NOT_FOUND", 404, "Interview not found");
  }

  if (
    message.includes("retake_after_required") ||
    message.includes("idempotency_key_required") ||
    message.includes("outcome_required")
  ) {
    return new AppError(
      "VALIDATION_ERROR",
      422,
      "The evaluation request contains invalid or missing fields"
    );
  }

  if (message.includes("invalid_interview_status")) {
    return new AppError(
      "INVALID_INTERVIEW_STATUS",
      409,
      "An evaluation can only be submitted after the interview has started or completed"
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
    "Evaluation could not be submitted"
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
