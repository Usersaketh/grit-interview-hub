import type {
  CertificationStatus,
  EvaluationOutcome,
} from "../types/api";

export type StudentMessageKind =
  | "BOOKING_CONFIRMATION"
  | "INTERVIEW_RESULT_PUBLISHED"
  | "CERTIFICATION_AWARDED"
  | "BOOKING_CANCELLED"
  | "BOOKING_RESCHEDULED";

export interface FormattedStudentMessage {
  kind: StudentMessageKind;
  subject: string;
  body: string;
}

export interface BookingConfirmedMessageInput {
  studentName: string;
  badgeName: string;
  trackName: string;
  startsAtIso: string;
  timezone?: string;
  interviewerName: string;
}

export interface ResultPublishedMessageInput {
  studentName: string;
  badgeName: string;
  trackName: string;
  outcome: EvaluationOutcome;
  feedback?: string | null;
}

export interface CertificationAwardedMessageInput {
  studentName: string;
  badgeName: string;
  trackName: string;
}

export function formatInterviewDateAndTime(
  startsAtIso: string,
  timezone?: string
): { dateText: string; timeText: string } {
  const dt = new Date(startsAtIso);
  if (Number.isNaN(dt.getTime())) {
    return { dateText: startsAtIso, timeText: timezone ? `UTC (${timezone})` : "UTC" };
  }
  const tz = timezone && timezone.trim() ? timezone.trim() : "UTC";
  try {
    const dateText = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(dt);
    const timeText = `${new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      hour: "numeric",
      minute: "2-digit",
    }).format(dt)} (${tz})`;
    return { dateText, timeText };
  } catch {
    const dateText = new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(dt);
    const timeText = `${new Intl.DateTimeFormat("en-US", {
      timeZone: "UTC",
      hour: "numeric",
      minute: "2-digit",
    }).format(dt)} (UTC)`;
    return { dateText, timeText };
  }
}

export function buildBookingConfirmationMessage(
  input: BookingConfirmedMessageInput
): FormattedStudentMessage {
  const { dateText, timeText } = formatInterviewDateAndTime(
    input.startsAtIso,
    input.timezone
  );
  const studentName = input.studentName.trim() || "Student";
  const badgeName = input.badgeName.trim() || "GRIT Badge";
  const trackName = input.trackName.trim() || "GRIT Track";
  const interviewerName = input.interviewerName.trim() || "Assigned Interviewer";

  return {
    kind: "BOOKING_CONFIRMATION",
    subject: "Your GRIT interview is confirmed",
    body: [
      `Hi ${studentName},`,
      "",
      `Your interview for ${badgeName} (${trackName}) is confirmed.`,
      "",
      `Date: ${dateText}`,
      `Time: ${timeText}`,
      `Interviewer: ${interviewerName}`,
      "",
      "You can view or manage your booking in GRIT Interview Hub.",
    ].join("\n"),
  };
}

export function buildInterviewResultMessage(
  input: ResultPublishedMessageInput
): FormattedStudentMessage {
  const studentName = input.studentName.trim() || "Student";
  const badgeName = input.badgeName.trim() || "GRIT Badge";
  const trackName = input.trackName.trim() || "GRIT Track";
  const safeFeedback =
    input.feedback && input.feedback.trim().length > 0
      ? input.feedback.trim()
      : "No written feedback provided.";

  if (input.outcome === "PASS") {
    return {
      kind: "INTERVIEW_RESULT_PUBLISHED",
      subject: "Your GRIT interview result is available",
      body: [
        `Hi ${studentName},`,
        "",
        `Your interview result for ${badgeName} (${trackName}) has been published.`,
        "",
        "Result: PASS",
        "Status: CERTIFICATION PENDING",
        "",
        "Your performance met the badge requirements. Your certification is currently pending final approval.",
      ].join("\n"),
    };
  }

  if (input.outcome === "FAIL") {
    return {
      kind: "INTERVIEW_RESULT_PUBLISHED",
      subject: "Your GRIT interview result is available",
      body: [
        `Hi ${studentName},`,
        "",
        `Your interview result for ${badgeName} (${trackName}) has been published.`,
        "",
        "Result: NOT PASSED",
        `Feedback: ${safeFeedback}`,
        "",
        "You may review the feedback and prepare for a future attempt.",
      ].join("\n"),
    };
  }

  return {
    kind: "INTERVIEW_RESULT_PUBLISHED",
    subject: "Your GRIT interview result is available",
    body: [
      `Hi ${studentName},`,
      "",
      `Your interview result for ${badgeName} (${trackName}) has been published.`,
      "",
      "Result: RETAKE REQUIRED",
      `Feedback: ${safeFeedback}`,
      "",
      "Please review the feedback and book another interview when ready.",
    ].join("\n"),
  };
}

export function buildCertificationAwardedMessage(
  input: CertificationAwardedMessageInput
): FormattedStudentMessage {
  const studentName = input.studentName.trim() || "Student";
  const badgeName = input.badgeName.trim() || "GRIT Badge";
  const trackName = input.trackName.trim() || "GRIT Track";

  return {
    kind: "CERTIFICATION_AWARDED",
    subject: "Congratulations! Your GRIT badge has been awarded",
    body: [
      `Hi ${studentName},`,
      "",
      `Congratulations! Your ${badgeName} certification in ${trackName} has been approved and awarded.`,
      "",
      "You can view your awarded badge in your GRIT Interview Hub profile.",
    ].join("\n"),
  };
}

export function formatStoredNotificationMessage(record: {
  type: string;
  payload: Record<string, unknown>;
  fallbackStudentName?: string;
}): FormattedStudentMessage {
  const p = record.payload ?? {};
  const studentName =
    typeof p.student_name === "string" && p.student_name.trim()
      ? p.student_name
      : (record.fallbackStudentName ?? "Student");
  const badgeName =
    typeof p.badge_name === "string" && p.badge_name.trim()
      ? p.badge_name
      : "GRIT Badge";
  const trackName =
    typeof p.track_name === "string" && p.track_name.trim()
      ? p.track_name
      : "GRIT Track";

  if (record.type === "BOOKING_CONFIRMATION") {
    return buildBookingConfirmationMessage({
      studentName,
      badgeName,
      trackName,
      startsAtIso:
        typeof p.starts_at === "string" ? p.starts_at : new Date().toISOString(),
      timezone: typeof p.timezone === "string" ? p.timezone : "UTC",
      interviewerName:
        typeof p.interviewer_name === "string"
          ? p.interviewer_name
          : "Assigned Interviewer",
    });
  }

  if (record.type === "INTERVIEW_RESULT_PUBLISHED") {
    const rawOutcome = typeof p.outcome === "string" ? p.outcome : "PASS";
    const outcome: EvaluationOutcome =
      rawOutcome === "FAIL" || rawOutcome === "RETAKE_LATER"
        ? rawOutcome
        : "PASS";
    return buildInterviewResultMessage({
      studentName,
      badgeName,
      trackName,
      outcome,
      feedback: typeof p.feedback === "string" ? p.feedback : null,
    });
  }

  if (record.type === "CERTIFICATION_AWARDED") {
    return buildCertificationAwardedMessage({
      studentName,
      badgeName,
      trackName,
    });
  }

  if (record.type === "BOOKING_CANCELLED") {
    return {
      kind: "BOOKING_CANCELLED",
      subject: "Your GRIT interview booking was cancelled",
      body: [
        `Hi ${studentName},`,
        "",
        `Your interview booking for ${badgeName} (${trackName}) has been cancelled.`,
        typeof p.reason === "string" && p.reason.trim()
          ? `Reason: ${p.reason.trim()}`
          : "",
      ]
        .filter(Boolean)
        .join("\n"),
    };
  }

  if (record.type === "BOOKING_RESCHEDULED") {
    const { dateText, timeText } = formatInterviewDateAndTime(
      typeof p.new_starts_at === "string"
        ? p.new_starts_at
        : new Date().toISOString(),
      typeof p.timezone === "string" ? p.timezone : "UTC"
    );
    return {
      kind: "BOOKING_RESCHEDULED",
      subject: "Your GRIT interview has been rescheduled",
      body: [
        `Hi ${studentName},`,
        "",
        `Your interview for ${badgeName} (${trackName}) has been rescheduled.`,
        "",
        `New Date: ${dateText}`,
        `New Time: ${timeText}`,
      ].join("\n"),
    };
  }

  return {
    kind: "BOOKING_CONFIRMATION",
    subject: "GRIT Interview Hub update",
    body: `Hi ${studentName},\n\nThere is an update on your GRIT Interview Hub record.`,
  };
}

export function shouldAllowCertificationAwardMessage(
  status: CertificationStatus | null | undefined
): boolean {
  return status === "AWARDED" || status === "REINSTATED";
}
