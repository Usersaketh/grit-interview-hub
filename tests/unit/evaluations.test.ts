import { describe, expect, it } from "vitest";
import { mapEvaluationRpcError } from "@/modules/evaluations/service";

describe("evaluation RPC error mapping", () => {
  it("does not expose assignment failures as a generic database error", () => {
    const error = mapEvaluationRpcError({ message: "not_assigned_interviewer" });
    expect(error.status).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
  });
  it("maps duplicate or non-idempotent resubmission to a conflict", () => {
    const error = mapEvaluationRpcError({ code: "23505", message: "evaluation_conflict" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("EVALUATION_CONFLICT");
  });
  it("requires a retake date", () => {
    const error = mapEvaluationRpcError({ message: "retake_after_required" });
    expect(error.status).toBe(422);
  });
});
