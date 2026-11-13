import { describe, expect, it, vi } from "vitest";
import {
  cancelStudentBooking,
  discoverBookableSlots,
  listBookableInterviewers,
  mapBookingRpcError,
  rescheduleStudentBooking,
} from "@backend/modules/booking/service";

describe("booking RPC error mapping", () => {
  it("maps inactive interviewer to a conflict", () => {
    const error = mapBookingRpcError({
      message: "interviewer_unavailable",
      code: "23514",
    });

    expect(error.status).toBe(409);
    expect(error.code).toBe("INTERVIEWER_UNAVAILABLE");
  });

  it("maps ineligible badge to a conflict", () => {
    const error = mapBookingRpcError({ message: "not_eligible" });

    expect(error.status).toBe(409);
    expect(error.code).toBe("NOT_ELIGIBLE");
  });

  it("maps inactive profile to forbidden", () => {
    const error = mapBookingRpcError({ message: "profile_inactive" });

    expect(error.status).toBe(403);
    expect(error.code).toBe("ACCOUNT_INACTIVE");
  });

  it("maps duplicate booking to a conflict", () => {
    const error = mapBookingRpcError({
      code: "23505",
      message: "duplicate key",
    });

    expect(error.status).toBe(409);
    expect(error.code).toBe("BOOKING_CONFLICT");
  });

  it("maps unknown errors to booking failure", () => {
    const error = mapBookingRpcError({ message: "unexpected database error" });

    expect(error.status).toBe(400);
    expect(error.code).toBe("BOOKING_FAILED");
  });

  it("maps reused idempotency keys with different payloads to a conflict", () => {
    const error = mapBookingRpcError({
      message: "idempotency_key_reused",
      code: "P0001",
    });

    expect(error.status).toBe(409);
    expect(error.code).toBe("IDEMPOTENCY_KEY_REUSED");
  });

  it("maps retake cooldown, cancel cutoff, reschedule cutoff, and invalid status", () => {
    expect(mapBookingRpcError({ message: "retake_cooldown_active" })).toMatchObject({
      status: 409,
      code: "RETAKE_COOLDOWN_ACTIVE",
    });
    expect(mapBookingRpcError({ message: "cancellation_cutoff_passed" })).toMatchObject({
      status: 409,
      code: "CANCELLATION_CUTOFF_PASSED",
    });
    expect(mapBookingRpcError({ message: "reschedule_cutoff_passed" })).toMatchObject({
      status: 409,
      code: "RESCHEDULE_CUTOFF_PASSED",
    });
    expect(mapBookingRpcError({ message: "invalid_interview_status" })).toMatchObject({
      status: 409,
      code: "INVALID_INTERVIEW_STATUS",
    });
  });
});

describe("booking discovery, cancel, and reschedule services", () => {
  it("lists bookable interviewers via RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [{ interviewer_id: "i-1", display_name: "Ananya Rao" }],
      error: null,
    });
    const list = await listBookableInterviewers({ rpc }, "badge-1");
    expect(list).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("list_bookable_interviewers", {
      p_badge_id: "badge-1",
    });
  });

  it("discovers real bookable slots from get_bookable_slot_inputs RPC", async () => {
    const from = "2099-05-04T00:00:00.000Z"; // Monday
    const to = "2099-05-05T00:00:00.000Z";
    const rpc = vi.fn().mockResolvedValue({
      data: {
        interviewers: [
          {
            interviewer_id: "i-1",
            display_name: "Ananya Rao",
            title: "Lead Assessor",
            bio: null,
            expertise_tags: ["sql"],
            default_timezone: "UTC",
          },
        ],
        availability: [
          {
            id: "a-1",
            interviewer_id: "i-1",
            day_of_week: 1,
            start_time: "10:00",
            end_time: "11:00",
            timezone: "UTC",
            effective_from: "2099-01-01",
            effective_until: null,
          },
        ],
        overrides: [],
        busy_windows: [],
        student_state: {
          has_active_booking: false,
          active_booking_id: null,
          retake_after: null,
        },
      },
      error: null,
    });

    const res = await discoverBookableSlots({ rpc }, { badgeId: "b-1", from, to });
    expect(res.slots).toHaveLength(1);
    expect(res.slots[0].startsAt).toBe("2099-05-04T10:00:00.000Z");
    expect(res.studentState.hasActiveBooking).toBe(false);
  });

  it("cancels and reschedules student bookings via transactional RPCs", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "int-1", status: "CANCELLED" },
      error: null,
    });
    const cancelled = await cancelStudentBooking({ rpc }, "int-1", {
      reason: "  Schedule conflict  ",
      idempotencyKey: "k-cancel",
    });
    expect(cancelled.status).toBe("CANCELLED");
    expect(rpc).toHaveBeenCalledWith("cancel_student_booking", {
      p_interview_id: "int-1",
      p_reason: "Schedule conflict",
      p_idempotency_key: "k-cancel",
    });

    rpc.mockResolvedValueOnce({
      data: { interview: { id: "int-1", status: "BOOKED" } },
      error: null,
    });
    const resched = await rescheduleStudentBooking({ rpc }, "int-1", {
      newInterviewerId: "i-2",
      newStartsAt: "2099-05-06T10:00:00Z",
      newEndsAt: "2099-05-06T10:45:00Z",
      timezone: "UTC",
      reason: "  Prefer morning slot ",
      idempotencyKey: "k-resched",
    });
    expect(resched.interview.status).toBe("BOOKED");
    expect(rpc).toHaveBeenLastCalledWith("reschedule_student_booking", {
      p_interview_id: "int-1",
      p_new_interviewer_id: "i-2",
      p_new_starts_at: "2099-05-06T10:00:00Z",
      p_new_ends_at: "2099-05-06T10:45:00Z",
      p_timezone: "UTC",
      p_reason: "Prefer morning slot",
      p_idempotency_key: "k-resched",
    });
  });
});
