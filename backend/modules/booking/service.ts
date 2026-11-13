import { AppError } from "@backend/lib/errors";
import {
  computeBookableSlots,
  type AvailabilityOverrideRecord,
  type BusyWindowRecord,
  type InterviewerSummary,
  type RecurringAvailabilityRule,
} from "@backend/modules/availability/service";

export type BookingInput = {
  badgeId: string;
  interviewerId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  idempotencyKey: string;
};

export type CancelBookingInput = {
  reason: string;
  idempotencyKey: string;
};

export type RescheduleBookingInput = {
  newInterviewerId: string;
  newStartsAt: string;
  newEndsAt: string;
  timezone: string;
  reason: string;
  idempotencyKey: string;
};

type BookingRpcError = {
  message?: string;
  code?: string;
};

export function mapBookingRpcError(error: BookingRpcError): AppError {
  const message = (error.message ?? "").toLowerCase();

  if (message.includes("unauthenticated")) {
    return new AppError("UNAUTHENTICATED", 401, "Authentication is required");
  }
  if (message.includes("forbidden")) {
    return new AppError("FORBIDDEN", 403, "You do not have permission to access or modify this booking");
  }
  if (message.includes("not_eligible")) {
    return new AppError("NOT_ELIGIBLE", 409, "You are not eligible to book this badge interview");
  }
  if (message.includes("retake_cooldown_active")) {
    return new AppError(
      "RETAKE_COOLDOWN_ACTIVE",
      409,
      "You cannot book before your retake waiting period ends"
    );
  }
  if (message.includes("cancellation_cutoff_passed")) {
    return new AppError(
      "CANCELLATION_CUTOFF_PASSED",
      409,
      "Interviews cannot be cancelled within 2 hours of the scheduled start time"
    );
  }
  if (message.includes("reschedule_cutoff_passed")) {
    return new AppError(
      "RESCHEDULE_CUTOFF_PASSED",
      409,
      "Interviews cannot be rescheduled within 2 hours of the scheduled start time"
    );
  }
  if (message.includes("invalid_interview_status")) {
    return new AppError(
      "INVALID_INTERVIEW_STATUS",
      409,
      "This interview can no longer be modified in its current state"
    );
  }
  if (message.includes("interview_not_found")) {
    return new AppError("NOT_FOUND", 404, "Interview not found");
  }
  if (message.includes("badge_not_found")) {
    return new AppError("BADGE_NOT_FOUND", 404, "Badge not found");
  }
  if (message.includes("badge_inactive")) {
    return new AppError("BADGE_INACTIVE", 409, "Badge is inactive");
  }
  if (message.includes("profile_inactive")) {
    return new AppError("ACCOUNT_INACTIVE", 403, "Your account is inactive");
  }
  if (message.includes("student_role_required")) {
    return new AppError("FORBIDDEN", 403, "Student role is required to book interviews");
  }
  if (message.includes("interviewer_unavailable")) {
    return new AppError(
      "INTERVIEWER_UNAVAILABLE",
      409,
      "This interviewer is currently unavailable"
    );
  }
  if (message.includes("reason_required") || message.includes("invalid_time_range") || message.includes("invalid_idempotency_key")) {
    return new AppError("VALIDATION_ERROR", 422, "The request contains invalid or missing fields");
  }
  if (message.includes("idempotency_key_reused")) {
    return new AppError(
      "IDEMPOTENCY_KEY_REUSED",
      409,
      "This idempotency key was already used for a different booking request. Use a new key."
    );
  }
  if (
    message.includes("conflict") ||
    error.code === "23505" ||
    error.code === "23P01"
  ) {
    return new AppError("BOOKING_CONFLICT", 409, "This slot is no longer available");
  }
  if (message.includes("availability") || message.includes("outside")) {
    return new AppError("SLOT_UNAVAILABLE", 409, "This time is outside interviewer availability");
  }

  return new AppError("BOOKING_FAILED", 400, "Booking could not be completed");
}

export async function bookInterview(db: any, input: BookingInput) {
  const { data, error } = await db.rpc("book_interview", {
    p_badge_id: input.badgeId,
    p_interviewer_id: input.interviewerId,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_timezone: input.timezone,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    throw mapBookingRpcError(error);
  }

  return data;
}

export async function listBookableInterviewers(db: any, badgeId?: string) {
  const { data, error } = await db.rpc("list_bookable_interviewers", {
    p_badge_id: badgeId ?? null,
  });

  if (error) {
    throw mapBookingRpcError(error);
  }

  return data ?? [];
}

export async function discoverBookableSlots(
  db: any,
  params: {
    badgeId: string;
    interviewerId?: string;
    from?: string;
    to?: string;
    excludeInterviewId?: string;
    durationMinutes?: number;
  }
) {
  const now = new Date();
  const fromDate = params.from ? new Date(params.from) : now;
  const toDate = params.to
    ? new Date(params.to)
    : new Date(fromDate.getTime() + 14 * 24 * 60 * 60 * 1000);

  if (toDate <= fromDate) {
    throw new AppError("VALIDATION_ERROR", 422, "End date must be after start date");
  }

  const maxWindowMs = 31 * 24 * 60 * 60 * 1000;
  const clampedTo =
    toDate.getTime() - fromDate.getTime() > maxWindowMs
      ? new Date(fromDate.getTime() + maxWindowMs)
      : toDate;

  const { data, error } = await db.rpc("get_bookable_slot_inputs", {
    p_badge_id: params.badgeId,
    p_interviewer_id: params.interviewerId ?? null,
    p_from: fromDate.toISOString(),
    p_to: clampedTo.toISOString(),
    p_exclude_interview_id: params.excludeInterviewId ?? null,
  });

  if (error) {
    throw mapBookingRpcError(error);
  }

  const payload = (data ?? {}) as {
    interviewers?: InterviewerSummary[];
    availability?: RecurringAvailabilityRule[];
    overrides?: AvailabilityOverrideRecord[];
    busy_windows?: BusyWindowRecord[];
    student_state?: {
      has_active_booking: boolean;
      active_booking_id: string | null;
      retake_after: string | null;
    };
  };

  const retakeAfter = payload.student_state?.retake_after
    ? new Date(payload.student_state.retake_after)
    : null;

  const slots = computeBookableSlots({
    interviewers: payload.interviewers ?? [],
    availability: payload.availability ?? [],
    overrides: payload.overrides ?? [],
    busyWindows: payload.busy_windows ?? [],
    from: fromDate,
    to: clampedTo,
    durationMinutes: params.durationMinutes ?? 45,
    bufferMinutes: 10,
    minimumNoticeMinutes: 60,
    retakeAfter,
    now,
  });

  return {
    slots,
    interviewers: payload.interviewers ?? [],
    studentState: {
      hasActiveBooking: Boolean(payload.student_state?.has_active_booking),
      activeBookingId: payload.student_state?.active_booking_id ?? null,
      retakeAfter: payload.student_state?.retake_after ?? null,
    },
    window: {
      from: fromDate.toISOString(),
      to: clampedTo.toISOString(),
      durationMinutes: params.durationMinutes ?? 45,
    },
  };
}

export async function cancelStudentBooking(
  db: any,
  interviewId: string,
  input: CancelBookingInput
) {
  const { data, error } = await db.rpc("cancel_student_booking", {
    p_interview_id: interviewId,
    p_reason: input.reason.trim(),
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    throw mapBookingRpcError(error);
  }

  return data;
}

export async function rescheduleStudentBooking(
  db: any,
  interviewId: string,
  input: RescheduleBookingInput
) {
  const { data, error } = await db.rpc("reschedule_student_booking", {
    p_interview_id: interviewId,
    p_new_interviewer_id: input.newInterviewerId,
    p_new_starts_at: input.newStartsAt,
    p_new_ends_at: input.newEndsAt,
    p_timezone: input.timezone,
    p_reason: input.reason.trim(),
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    throw mapBookingRpcError(error);
  }

  return data;
}
