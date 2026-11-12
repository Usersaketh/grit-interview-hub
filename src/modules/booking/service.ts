import { AppError } from "@/lib/errors";
export type BookingInput = { badgeId: string; interviewerId: string; startsAt: string; endsAt: string; timezone: string; idempotencyKey: string };
export async function bookInterview(db: any, input: BookingInput) {
  const { data, error } = await db.rpc("book_interview", { p_badge_id: input.badgeId, p_interviewer_id: input.interviewerId, p_starts_at: input.startsAt, p_ends_at: input.endsAt, p_timezone: input.timezone, p_idempotency_key: input.idempotencyKey });
  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("not_eligible")) throw new AppError("NOT_ELIGIBLE", 409, "You are not eligible to book this badge interview");
    if (message.includes("badge_not_found")) throw new AppError("BADGE_NOT_FOUND", 404, "Badge not found");
    if (message.includes("badge_inactive")) throw new AppError("BADGE_INACTIVE", 409, "Badge is inactive");
    if (message.includes("profile_inactive")) throw new AppError("ACCOUNT_INACTIVE", 403, "Your account is inactive");
    if (message.includes("student_role_required")) throw new AppError("FORBIDDEN", 403, "Student role is required to book interviews");
    if (message.includes("conflict") || error.code === "23505" || error.code === "23P01") throw new AppError("BOOKING_CONFLICT", 409, "This slot is no longer available");
    if (message.includes("availability") || message.includes("outside")) throw new AppError("SLOT_UNAVAILABLE", 409, "This time is outside interviewer availability");
    throw new AppError("BOOKING_FAILED", 400, "Booking could not be completed");
  }
  return data;
}
