import { describe, expect, it } from "vitest";
import {
  buildBookingConfirmationMessage,
  buildCertificationAwardedMessage,
  buildInterviewResultMessage,
  formatStoredNotificationMessage,
  shouldAllowCertificationAwardMessage,
} from "@frontend/lib/studentMessages";

describe("exact student notification messages", () => {
  it("renders Message 1: Booking Confirmation with exact subject and structure", () => {
    const msg = buildBookingConfirmationMessage({
      studentName: "Aarav Sharma",
      badgeName: "Full Stack Foundations",
      trackName: "Software Engineering",
      startsAtIso: "2026-12-08T10:30:00.000Z",
      timezone: "UTC",
      interviewerName: "Ananya Rao",
    });

    expect(msg.subject).toBe("Your GRIT interview is confirmed");
    expect(msg.body).toContain("Hi Aarav Sharma,");
    expect(msg.body).toContain(
      "Your interview for Full Stack Foundations (Software Engineering) is confirmed."
    );
    expect(msg.body).toContain("Date:");
    expect(msg.body).toContain("Time: 10:30 AM (UTC)");
    expect(msg.body).toContain("Interviewer: Ananya Rao");
    expect(msg.body).toContain(
      "You can view or manage your booking in GRIT Interview Hub."
    );
  });

  it("renders Message 2 for PASS with CERTIFICATION PENDING and never emits Message 3 prematurely", () => {
    const msg = buildInterviewResultMessage({
      studentName: "Aarav Sharma",
      badgeName: "Full Stack Foundations",
      trackName: "Software Engineering",
      outcome: "PASS",
    });

    expect(msg.subject).toBe("Your GRIT interview result is available");
    expect(msg.body).toBe(
      [
        "Hi Aarav Sharma,",
        "",
        "Your interview result for Full Stack Foundations (Software Engineering) has been published.",
        "",
        "Result: PASS",
        "Status: CERTIFICATION PENDING",
        "",
        "Your performance met the badge requirements. Your certification is currently pending final approval.",
      ].join("\n")
    );

    expect(shouldAllowCertificationAwardMessage("CERTIFICATION_PENDING")).toBe(false);
    expect(shouldAllowCertificationAwardMessage("AWARDED")).toBe(true);
  });

  it("renders Message 2 for FAIL and RETAKE_LATER with published feedback", () => {
    const failMsg = buildInterviewResultMessage({
      studentName: "Diya Patel",
      badgeName: "LLM Evaluation & Guardrails",
      trackName: "AI & Generative Intelligence",
      outcome: "FAIL",
      feedback: "Need stronger adversarial prompt-injection defenses.",
    });

    expect(failMsg.subject).toBe("Your GRIT interview result is available");
    expect(failMsg.body).toBe(
      [
        "Hi Diya Patel,",
        "",
        "Your interview result for LLM Evaluation & Guardrails (AI & Generative Intelligence) has been published.",
        "",
        "Result: NOT PASSED",
        "Feedback: Need stronger adversarial prompt-injection defenses.",
        "",
        "You may review the feedback and prepare for a future attempt.",
      ].join("\n")
    );

    const retakeMsg = buildInterviewResultMessage({
      studentName: "Diya Patel",
      badgeName: "LLM Evaluation & Guardrails",
      trackName: "AI & Generative Intelligence",
      outcome: "RETAKE_LATER",
      feedback: "Review deterministic regression assertions before retaking.",
    });

    expect(retakeMsg.subject).toBe("Your GRIT interview result is available");
    expect(retakeMsg.body).toBe(
      [
        "Hi Diya Patel,",
        "",
        "Your interview result for LLM Evaluation & Guardrails (AI & Generative Intelligence) has been published.",
        "",
        "Result: RETAKE REQUIRED",
        "Feedback: Review deterministic regression assertions before retaking.",
        "",
        "Please review the feedback and book another interview when ready.",
      ].join("\n")
    );
  });

  it("renders Message 3: Badge Awarded upon admin approval", () => {
    const msg = buildCertificationAwardedMessage({
      studentName: "Aarav Sharma",
      badgeName: "Full Stack Foundations",
      trackName: "Software Engineering",
    });

    expect(msg.subject).toBe("Congratulations! Your GRIT badge has been awarded");
    expect(msg.body).toBe(
      [
        "Hi Aarav Sharma,",
        "",
        "Congratulations! Your Full Stack Foundations certification in Software Engineering has been approved and awarded.",
        "",
        "You can view your awarded badge in your GRIT Interview Hub profile.",
      ].join("\n")
    );
  });

  it("formats stored notification database payloads cleanly", () => {
    const formatted = formatStoredNotificationMessage({
      type: "CERTIFICATION_AWARDED",
      payload: {
        student_name: "Aarav Sharma",
        badge_name: "Containers & Kubernetes Operations",
        track_name: "Cloud & Infrastructure",
      },
    });
    expect(formatted.subject).toBe(
      "Congratulations! Your GRIT badge has been awarded"
    );
    expect(formatted.body).toContain(
      "Containers & Kubernetes Operations certification in Cloud & Infrastructure"
    );
  });
});
