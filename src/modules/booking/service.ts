
import { AppError } from "@/lib/errors";

export type BookingInput = {
  badgeId: string;
  interviewerId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  idempotencyKey: string;
};

type BookingRpcError = {
  message?: string;
  code?: string;
};

export function mapBookingRpcError(error: BookingRpcError): AppError {
  const message = (error.message ?? "").toLowerCase();

  if (message.includes("not_eligible")) {
    return new AppError("NOT_ELIGIBLE", 409, "You are not eligible to book this badge interview");
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
