import { describe, expect, it, vi } from "vitest";
import {
  completeInterviewSession,
  getInterviewWorkspaceDetail,
  mapEvaluationRpcError,
  recordInterviewAttendance,
  startInterviewSession,
} from "@backend/modules/evaluations/service";

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

  it("maps invalid interview status transitions to 409", () => {
    const error = mapEvaluationRpcError({ message: "invalid_interview_status" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("INVALID_INTERVIEW_STATUS");
  });
});

describe("interview lifecycle & attendance service", () => {
  it("starts an interview session with attendance defaults", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { interview: { id: "int-1", status: "IN_PROGRESS" } },
      error: null,
    });
    const res = await startInterviewSession({ rpc }, "int-1", {
      idempotencyKey: "k-start",
    });
    expect(res.interview.status).toBe("IN_PROGRESS");
    expect(rpc).toHaveBeenCalledWith("start_interview", {
      p_interview_id: "int-1",
      p_idempotency_key: "k-start",
      p_student_attendance: "ATTENDED",
      p_interviewer_attendance: "ATTENDED",
      p_notes: null,
    });
  });

  it("completes an interview session to AWAITING_OUTCOME", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { interview: { id: "int-1", status: "AWAITING_OUTCOME" } },
      error: null,
    });
    const res = await completeInterviewSession({ rpc }, "int-1", {
      notes: "Live coding finished",
      idempotencyKey: "k-complete",
    });
    expect(res.interview.status).toBe("AWAITING_OUTCOME");
    expect(rpc).toHaveBeenCalledWith("complete_interview_session", {
      p_interview_id: "int-1",
      p_idempotency_key: "k-complete",
      p_student_attendance: null,
      p_interviewer_attendance: null,
      p_notes: "Live coding finished",
    });
  });

  it("records attendance and supports marking NO_SHOW", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { interview: { id: "int-1", status: "NO_SHOW" } },
      error: null,
    });
    const res = await recordInterviewAttendance({ rpc }, "int-1", {
      studentAttendance: "NO_SHOW",
      interviewerAttendance: "ATTENDED",
      notes: "Did not join within 15 minutes",
      markNoShow: true,
      idempotencyKey: "k-noshow",
    });
    expect(res.interview.status).toBe("NO_SHOW");
    expect(rpc).toHaveBeenCalledWith("record_interview_attendance", {
      p_interview_id: "int-1",
      p_student_attendance: "NO_SHOW",
      p_interviewer_attendance: "ATTENDED",
      p_notes: "Did not join within 15 minutes",
      p_mark_no_show: true,
      p_idempotency_key: "k-noshow",
    });
  });

  it("loads scoped interview workspace detail", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        interview: { id: "int-1", status: "BOOKED" },
        student: { id: "stu-1", full_name: "Aarav Mehta" },
      },
      error: null,
    });
    const res = await getInterviewWorkspaceDetail({ rpc }, "int-1");
    expect(res.student.full_name).toBe("Aarav Mehta");
    expect(rpc).toHaveBeenCalledWith("get_interview_workspace_detail", {
      p_interview_id: "int-1",
    });
  });
});
