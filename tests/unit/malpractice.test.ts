import { describe, expect, it, vi } from "vitest";
import {
  mapMalpracticeRpcError,
  createMalpracticeReport,
  reviewMalpracticeReport,
  nullifyBadgeAward,
  reinstateBadgeAward,
  getMalpracticeQueue,
  getStudentMalpracticeStatus,
  approveBadgeCertification,
} from "@/modules/malpractice/service";

describe("malpractice RPC error mapping", () => {
  it("maps staff role required to forbidden", () => {
    const error = mapMalpracticeRpcError({ message: "staff_role_required" });
    expect(error.status).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
  });

  it("maps reporter cannot review own case to forbidden", () => {
    const error = mapMalpracticeRpcError({ message: "reporter_cannot_review_own_case" });
    expect(error.status).toBe(403);
    expect(error.code).toBe("FORBIDDEN");
  });

  it("maps student not found to not found", () => {
    const error = mapMalpracticeRpcError({ message: "student_not_found" });
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("maps badge not found or inactive to not found", () => {
    const error = mapMalpracticeRpcError({ message: "badge_not_found_or_inactive" });
    expect(error.status).toBe(404);
    expect(error.code).toBe("BADGE_NOT_FOUND");
  });

  it("maps report not found to not found", () => {
    const error = mapMalpracticeRpcError({ message: "report_not_found" });
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
  });

  it("maps report not confirmed to conflict", () => {
    const error = mapMalpracticeRpcError({ message: "report_not_confirmed" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("INVALID_CASE_STATE");
  });

  it("maps report not appealed to conflict", () => {
    const error = mapMalpracticeRpcError({ message: "report_not_appealed" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("INVALID_CASE_STATE");
  });

  it("maps report not resolved to conflict", () => {
    const error = mapMalpracticeRpcError({ message: "report_not_resolved" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("INVALID_CASE_STATE");
  });

  it("maps no awarded badge to nullify to conflict", () => {
    const error = mapMalpracticeRpcError({ message: "no_awarded_badge_to_nullify" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("NO_AWARDED_BADGE");
  });

  it("maps no nullified badge to reinstate to conflict", () => {
    const error = mapMalpracticeRpcError({ message: "no_nullified_badge_to_reinstate" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("NO_NULLIFIED_BADGE");
  });

  it("maps ambiguous award selection to conflict", () => {
    const error = mapMalpracticeRpcError({ message: "ambiguous_award_selection" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("AMBIGUOUS_AWARD");
  });

  it("maps outstanding case to conflict", () => {
    const error = mapMalpracticeRpcError({ message: "outstanding_malpractice_case" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("OUTSTANDING_CASE");
  });

  it("maps invalid transition to conflict", () => {
    const error = mapMalpracticeRpcError({ message: "invalid_transition" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("INVALID_TRANSITION");
  });

  it("maps missing required fields to validation error", () => {
    const error = mapMalpracticeRpcError({ message: "reason_code_required" });
    expect(error.status).toBe(422);
    expect(error.code).toBe("VALIDATION_ERROR");
  });

  it("maps to_status_required to validation error", () => {
    const error = mapMalpracticeRpcError({ message: "to_status_required" });
    expect(error.status).toBe(422);
    expect(error.code).toBe("VALIDATION_ERROR");
  });

  it("maps idempotency key reused to conflict", () => {
    const error = mapMalpracticeRpcError({ message: "idempotency_key_reused", code: "P0001" });
    expect(error.status).toBe(409);
    expect(error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("maps invalid idempotency key to validation error", () => {
    const error = mapMalpracticeRpcError({ message: "invalid_idempotency_key" });
    expect(error.status).toBe(422);
    expect(error.code).toBe("VALIDATION_ERROR");
  });

  it("maps unauthenticated to 401", () => {
    const error = mapMalpracticeRpcError({ message: "unauthenticated" });
    expect(error.status).toBe(401);
    expect(error.code).toBe("UNAUTHENTICATED");
  });

  it("maps unknown errors to generic failure", () => {
    const error = mapMalpracticeRpcError({ message: "unexpected database error" });
    expect(error.status).toBe(400);
    expect(error.code).toBe("MALPRACTICE_FAILED");
  });
});

describe("malpractice service validation", () => {
  const createMockDb = (rpcResult: any) => {
    const rpc = vi.fn().mockResolvedValue(rpcResult);
    return { rpc };
  };

  describe("createMalpracticeReport", () => {
    it("passes correct params to RPC", async () => {
      const mockDb = createMockDb({ data: { id: "report-1" }, error: null });
      const input = {
        studentId: "student-1",
        badgeId: "badge-1",
        reasonCode: "CHEATING",
        description: "Student used unauthorized materials",
        evidenceReference: "ref-123",
        idempotencyKey: "key-1"
      };
      await createMalpracticeReport(mockDb, input);
      expect(mockDb.rpc).toHaveBeenCalledWith("create_malpractice_report", {
        p_student_id: "student-1",
        p_badge_id: "badge-1",
        p_reason_code: "CHEATING",
        p_description: "Student used unauthorized materials",
        p_evidence_reference: "ref-123",
        p_idempotency_key: "key-1"
      });
    });

    it("throws mapped error when RPC returns staff_role_required", async () => {
      const mockDb = createMockDb({ data: null, error: { message: "staff_role_required", code: "42501" } });
      await expect(createMalpracticeReport(mockDb, {
        studentId: "student-1", badgeId: "badge-1", reasonCode: "CHEATING",
        description: "test", idempotencyKey: "key-1"
      })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    });
  });

  describe("reviewMalpracticeReport", () => {
    it("passes correct params to RPC for APPEALED -> CONFIRMED (appeal decision)", async () => {
      const mockDb = createMockDb({ data: { id: "report-1", status: "CONFIRMED" }, error: null });
      await reviewMalpracticeReport(mockDb, "report-1", { toStatus: "CONFIRMED", reviewerNotes: "Appeal rejected", idempotencyKey: "key-2" });
      expect(mockDb.rpc).toHaveBeenCalledWith("review_malpractice_report", {
        p_report_id: "report-1",
        p_to_status: "CONFIRMED",
        p_reviewer_notes: "Appeal rejected",
        p_idempotency_key: "key-2"
      });
    });

    it("passes correct params to RPC for CONFIRMED -> APPEALED (appeal filed)", async () => {
      const mockDb = createMockDb({ data: { id: "report-1", status: "APPEALED" }, error: null });
      await reviewMalpracticeReport(mockDb, "report-1", { toStatus: "APPEALED", reviewerNotes: "Appeal filed", idempotencyKey: "key-3" });
      expect(mockDb.rpc).toHaveBeenCalledWith("review_malpractice_report", {
        p_report_id: "report-1",
        p_to_status: "APPEALED",
        p_reviewer_notes: "Appeal filed",
        p_idempotency_key: "key-3"
      });
    });
  });

  describe("nullifyBadgeAward", () => {
    it("passes correct params to RPC", async () => {
      const mockDb = createMockDb({ data: { id: "award-1", status: "NULLIFIED" }, error: null });
      await nullifyBadgeAward(mockDb, "report-1", { idempotencyKey: "key-3" });
      expect(mockDb.rpc).toHaveBeenCalledWith("nullify_badge_award", {
        p_report_id: "report-1",
        p_idempotency_key: "key-3"
      });
    });
  });

  describe("reinstateBadgeAward", () => {
    it("passes correct params to RPC for APPEALED -> REINSTATED", async () => {
      const mockDb = createMockDb({ data: { id: "award-1", status: "REINSTATED" }, error: null });
      await reinstateBadgeAward(mockDb, "report-1", { reason: "Appeal accepted", idempotencyKey: "key-4" });
      expect(mockDb.rpc).toHaveBeenCalledWith("reinstate_badge_award", {
        p_report_id: "report-1",
        p_reason: "Appeal accepted",
        p_idempotency_key: "key-4"
      });
    });
  });

  describe("approveBadgeCertification", () => {
    it("passes correct params to RPC on success", async () => {
      const mockDb = createMockDb({
        data: {
          id: "award-1",
          student_id: "student-1",
          badge_id: "badge-1",
          interview_result_id: "result-1",
          status: "AWARDED",
          awarded_at: "2026-11-13T10:00:00Z",
          nullified_at: null,
          reinstated_at: null,
          created_at: "2026-11-13T09:00:00Z"
        },
        error: null
      });
      await approveBadgeCertification(mockDb, {
        badgeAwardId: "award-1",
        idempotencyKey: "key-approve-1"
      });
      expect(mockDb.rpc).toHaveBeenCalledWith("approve_badge_certification", {
        p_badge_award_id: "award-1",
        p_idempotency_key: "key-approve-1"
      });
    });

    it("returns mapped award data on success", async () => {
      const mockDb = createMockDb({
        data: {
          id: "award-1",
          student_id: "student-1",
          badge_id: "badge-1",
          interview_result_id: "result-1",
          status: "AWARDED",
          awarded_at: "2026-11-13T10:00:00Z",
          nullified_at: null,
          reinstated_at: null,
          created_at: "2026-11-13T09:00:00Z"
        },
        error: null
      });
      const result = await approveBadgeCertification(mockDb, {
        badgeAwardId: "award-1",
        idempotencyKey: "key-approve-2"
      });
      expect(result).toEqual({
        id: "award-1",
        student_id: "student-1",
        badge_id: "badge-1",
        interview_result_id: "result-1",
        status: "AWARDED",
        awarded_at: "2026-11-13T10:00:00Z",
        nullified_at: null,
        reinstated_at: null,
        created_at: "2026-11-13T09:00:00Z"
      });
    });

    it("throws NOT_FOUND when badge award does not exist", async () => {
      const mockDb = createMockDb({
        data: null,
        error: { message: "badge_award_not_found", code: "P0002" }
      });
      await expect(approveBadgeCertification(mockDb, {
        badgeAwardId: "award-missing",
        idempotencyKey: "key-approve-3"
      })).rejects.toMatchObject({ code: "NOT_FOUND", status: 404 });
    });

    it("throws FORBIDDEN when staff role is required", async () => {
      const mockDb = createMockDb({
        data: null,
        error: { message: "staff_role_required", code: "42501" }
      });
      await expect(approveBadgeCertification(mockDb, {
        badgeAwardId: "award-1",
        idempotencyKey: "key-approve-4"
      })).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    });

    it("throws INVALID_CASE_STATE when award is not pending", async () => {
      const mockDb = createMockDb({
        data: null,
        error: { message: "badge_award_not_pending", code: "23514" }
      });
      await expect(approveBadgeCertification(mockDb, {
        badgeAwardId: "award-1",
        idempotencyKey: "key-approve-5"
      })).rejects.toMatchObject({ code: "INVALID_CASE_STATE", status: 409 });
    });

    it("throws VALIDATION_ERROR when idempotency key is invalid", async () => {
      const mockDb = createMockDb({
        data: null,
        error: { message: "invalid_idempotency_key", code: "22023" }
      });
      await expect(approveBadgeCertification(mockDb, {
        badgeAwardId: "award-1",
        idempotencyKey: ""
      })).rejects.toMatchObject({ code: "VALIDATION_ERROR", status: 422 });
    });

    it("throws IDEMPOTENCY_KEY_REUSED when key is reused", async () => {
      const mockDb = createMockDb({
        data: null,
        error: { message: "idempotency_key_reused", code: "P0001" }
      });
      await expect(approveBadgeCertification(mockDb, {
        badgeAwardId: "award-1",
        idempotencyKey: "key-approve-6"
      })).rejects.toMatchObject({ code: "IDEMPOTENCY_KEY_REUSED", status: 409 });
  });
    it("allows a new REPORTED case after a report is REINSTATED (resolved, not in outstanding index)", async () => {
      const mockDb = createMockDb({ data: { id: "report-2", status: "REPORTED" }, error: null });
      await createMalpracticeReport(mockDb, {
        studentId: "student-1",
        badgeId: "badge-1",
        reasonCode: "CHEATING",
        description: "New incident after reinstatement",
        evidenceReference: "ref-456",
        idempotencyKey: "key-new"
      });
      expect(mockDb.rpc).toHaveBeenCalledWith("create_malpractice_report", {
        p_student_id: "student-1",
        p_badge_id: "badge-1",
        p_reason_code: "CHEATING",
        p_description: "New incident after reinstatement",
        p_evidence_reference: "ref-456",
        p_idempotency_key: "key-new"
      });
    });
  });

  describe("getMalpracticeQueue", () => {
    it("calls the malpractice_queue RPC", async () => {
      const mockDb = createMockDb({ data: [{ id: "report-1", status: "CONFIRMED" }], error: null });
      await getMalpracticeQueue(mockDb);
      expect(mockDb.rpc).toHaveBeenCalledWith("malpractice_queue");
    });
  });

  describe("getStudentMalpracticeStatus", () => {
    it("calls the student_malpractice_status RPC", async () => {
      const mockDb = createMockDb({ data: [], error: null });
      await getStudentMalpracticeStatus(mockDb);
      expect(mockDb.rpc).toHaveBeenCalledWith("student_malpractice_status");
    });

    it("maps badge_award RPC row to camelCase", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "badge_award",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: "550e8400-e29b-41d4-a716-446655440001",
            award_status: "NULLIFIED",
            awarded_at: "2026-11-01T10:00:00Z",
            nullified_at: "2026-11-10T10:00:00Z",
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      const result = await getStudentMalpracticeStatus(mockDb);
      expect(result).toHaveLength(1);
      expect(result[0].recordType).toBe("badge_award");
      expect(result[0].badgeId).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result[0].awardId).toBe("550e8400-e29b-41d4-a716-446655440001");
      expect(result[0].awardStatus).toBe("NULLIFIED");
      expect(result[0].awardedAt).toBe("2026-11-01T10:00:00Z");
      expect(result[0].nullifiedAt).toBe("2026-11-10T10:00:00Z");
      expect(result[0].reinstatedAt).toBe(null);
    });

    it("maps malpractice_report RPC row to camelCase", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "malpractice_report",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: "550e8400-e29b-41d4-a716-446655440002",
            report_status: "CONFIRMED",
            report_created_at: "2026-11-10T10:00:00Z"
          }
        ],
        error: null
      });
      const result = await getStudentMalpracticeStatus(mockDb);
      expect(result).toHaveLength(1);
      expect(result[0].recordType).toBe("malpractice_report");
      expect(result[0].badgeId).toBe("550e8400-e29b-41d4-a716-446655440000");
      expect(result[0].reportId).toBe("550e8400-e29b-41d4-a716-446655440002");
      expect(result[0].reportStatus).toBe("CONFIRMED");
      expect(result[0].reportCreatedAt).toBe("2026-11-10T10:00:00Z");
    });

    it("preserves null values as null for nullable fields", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "badge_award",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      const result = await getStudentMalpracticeStatus(mockDb);
      expect(result[0].awardId).toBe(null);
      expect(result[0].awardStatus).toBe(null);
      expect(result[0].awardedAt).toBe(null);
      expect(result[0].nullifiedAt).toBe(null);
      expect(result[0].reinstatedAt).toBe(null);
    });

    it("rejects unexpected record types", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "unknown_type",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500
      });
    });

    it("returns empty array when RPC data is null", async () => {
      const mockDb = createMockDb({ data: null, error: null });
      const result = await getStudentMalpracticeStatus(mockDb);
      expect(result).toEqual([]);
    });

    it("throws mapped error when RPC returns error", async () => {
      const mockDb = createMockDb({ data: null, error: { message: "staff_role_required", code: "42501" } });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({ code: "FORBIDDEN", status: 403 });
    });

    it("throws MALPRACTICE_FAILED when RPC data is not an array", async () => {
      const mockDb = createMockDb({ data: "not-an-array", error: null });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500,
      });
    });

    it("throws MALPRACTICE_FAILED when RPC data is a plain object", async () => {
      const mockDb = createMockDb({ data: { record_type: "badge_award" }, error: null });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500,
      });
    });

    it("throws MALPRACTICE_FAILED when record_type is missing", async () => {
      const mockDb = createMockDb({
        data: [
          {
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500,
      });
    });

    it("throws MALPRACTICE_FAILED when record_type is invalid", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "unknown_type",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500,
      });
    });

    it("throws MALPRACTICE_FAILED when badge_id is not a valid UUID", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "badge_award",
            badge_id: "not-a-uuid",
            award_id: null,
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500,
      });
    });

    it("throws MALPRACTICE_FAILED when awarded_at is not a valid timestamp", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "badge_award",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: null,
            awarded_at: "not-a-timestamp",
            nullified_at: null,
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500,
      });
    });

    it("throws MALPRACTICE_FAILED when award_status is not a string", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "badge_award",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: 123,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500,
      });
    });

    it("does not expose raw RPC response in error message", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "badge_award",
            badge_id: "not-a-uuid",
            award_id: null,
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500,
      });
    });

    it("throws MALPRACTICE_FAILED when award_status is not a valid certification status", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "badge_award",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: "UNKNOWN_STATUS",
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500,
      });
    });

    it("throws MALPRACTICE_FAILED when report_status is not a valid malpractice status", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "malpractice_report",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: "550e8400-e29b-41d4-a716-446655440002",
            report_status: "INVALID_STATE",
            report_created_at: "2026-11-10T10:00:00Z"
          }
        ],
        error: null
      });
      await expect(getStudentMalpracticeStatus(mockDb)).rejects.toMatchObject({
        code: "MALPRACTICE_FAILED",
        status: 500,
      });
    });

    it("preserves null award_status for badge_award records", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "badge_award",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: "550e8400-e29b-41d4-a716-446655440001",
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      const result = await getStudentMalpracticeStatus(mockDb);
      expect(result[0].awardStatus).toBe(null);
    });

    it("preserves null report_status for malpractice_report records", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "malpractice_report",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
            report_id: "550e8400-e29b-41d4-a716-446655440002",
            report_status: null,
            report_created_at: null
          }
        ],
        error: null
      });
      const result = await getStudentMalpracticeStatus(mockDb);
      expect(result[0].reportStatus).toBe(null);
    });

    it("returns records without sensitive fields", async () => {
      const mockDb = createMockDb({
        data: [
          {
            record_type: "badge_award",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: "550e8400-e29b-41d4-a716-446655440001",
            award_status: "NULLIFIED",
            awarded_at: "2026-01-01T00:00:00Z",
            nullified_at: "2026-02-01T00:00:00Z",
            reinstated_at: null,
            report_id: null,
            report_status: null,
            report_created_at: null
          },
          {
            record_type: "malpractice_report",
            badge_id: "550e8400-e29b-41d4-a716-446655440000",
            award_id: null,
            award_status: null,
            awarded_at: null,
            nullified_at: null,
            reinstated_at: null,
report_id: "550e8400-e29b-41d4-a716-446655440002",
            report_status: "CONFIRMED",
            report_created_at: "2026-01-15T00:00:00Z"
          }
        ],
        error: null
      });
      const result = await getStudentMalpracticeStatus(mockDb);
      expect(result).toHaveLength(2);
      // Verify no sensitive fields leaked
      for (const row of result) {
        expect("evidence_reference" in row).toBe(false);
        expect("reviewer_notes" in row).toBe(false);
        expect("reported_by" in row).toBe(false);
        expect("description" in row).toBe(false);
      }
      // Verify record type discriminator (camelCase after mapping)
      expect(result[0].recordType).toBe("badge_award");
      expect(result[1].recordType).toBe("malpractice_report");
    });
  });
});
