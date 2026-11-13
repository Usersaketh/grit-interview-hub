import test from "node:test";
import assert from "node:assert/strict";
import {
  canNullifyCase,
  canReinstateCase,
  canStudentModifyBooking,
  generateUuid,
  getAllowedReviewTransitions,
  getAttendanceStatusMeta,
  getInterviewerLifecycleActions,
  getInvitationStatusMeta,
  groupBookableSlotsByDate,
  isValidUuid,
  resolveDefaultPortalPath,
  validateAvailabilityForm,
  validateBookingForm,
  validateBookingReasonForm,
  validateEvaluationForm,
  validateMalpracticeReportForm,
  validateReinstateForm,
  validateSignupForm,
} from "./domain";

test("validateBookingForm rejects invalid UUIDs and reversed time ranges", () => {
  const errors = validateBookingForm({
    badgeId: "not-a-uuid",
    interviewerId: "20000000-0000-4000-8000-000000000001",
    startsAtIso: "2026-12-01T10:00:00Z",
    endsAtIso: "2026-12-01T09:30:00Z",
    timezone: "Asia/Kolkata",
  });

  assert.equal(Boolean(errors.badgeId), true);
  assert.equal(Boolean(errors.endsAt), true);
  assert.equal(errors.interviewerId, undefined);
});

test("validateBookingForm accepts valid booking input", () => {
  const errors = validateBookingForm({
    badgeId: "40000000-0000-4000-8000-000000000001",
    interviewerId: "20000000-0000-4000-8000-000000000001",
    startsAtIso: "2026-12-01T10:00:00Z",
    endsAtIso: "2026-12-01T10:30:00Z",
    timezone: "Asia/Kolkata",
  });

  assert.deepEqual(errors, {});
});

test("validateAvailabilityForm enforces endTime > startTime and effectiveUntil >= effectiveFrom", () => {
  const errors = validateAvailabilityForm({
    dayOfWeek: 1,
    startTime: "14:00",
    endTime: "13:00",
    timezone: "Asia/Kolkata",
    effectiveFrom: "2026-12-10",
    effectiveUntil: "2026-12-01",
  });

  assert.equal(Boolean(errors.endTime), true);
  assert.equal(Boolean(errors.effectiveUntil), true);
});

test("validateEvaluationForm requires retakeAfter when outcome is RETAKE_LATER", () => {
  const missing = validateEvaluationForm({
    outcome: "RETAKE_LATER",
    feedback: "Review database indexing",
    retakeAfterIso: "",
  });
  assert.equal(Boolean(missing.retakeAfter), true);

  const valid = validateEvaluationForm({
    outcome: "PASS",
    feedback: "Strong understanding",
    retakeAfterIso: "",
  });
  assert.deepEqual(valid, {});
});

test("malpractice transition helpers match SQL state machine", () => {
  assert.deepEqual(getAllowedReviewTransitions("REPORTED"), ["UNDER_REVIEW"]);
  assert.deepEqual(getAllowedReviewTransitions("UNDER_REVIEW"), [
    "DISMISSED",
    "CONFIRMED",
  ]);
  assert.deepEqual(getAllowedReviewTransitions("CONFIRMED"), ["APPEALED"]);
  assert.deepEqual(getAllowedReviewTransitions("APPEALED"), ["CONFIRMED"]);
  assert.deepEqual(getAllowedReviewTransitions("DISMISSED"), []);
  assert.deepEqual(getAllowedReviewTransitions("REINSTATED"), []);

  assert.equal(canNullifyCase("CONFIRMED"), true);
  assert.equal(canNullifyCase("UNDER_REVIEW"), false);
  assert.equal(canReinstateCase("APPEALED"), true);
  assert.equal(canReinstateCase("CONFIRMED"), false);
});

test("resolveDefaultPortalPath prioritizes staff, interviewer, then student", () => {
  assert.equal(resolveDefaultPortalPath(["OPERATIONS"]), "/operations");
  assert.equal(resolveDefaultPortalPath(["ADMIN"]), "/operations");
  assert.equal(resolveDefaultPortalPath(["INTERVIEWER"]), "/interviewer");
  assert.equal(resolveDefaultPortalPath(["STUDENT"]), "/student");
  assert.equal(isValidUuid("40000000-0000-4000-8000-000000000001"), true);
});

test("validateMalpracticeReportForm and validateReinstateForm enforce schema bounds", () => {
  const invalidReport = validateMalpracticeReportForm({
    studentId: "bad",
    badgeId: "40000000-0000-4000-8000-000000000001",
    reasonCode: "",
    description: "   ",
    evidenceReference: "",
  });
  assert.equal(Boolean(invalidReport.studentId), true);
  assert.equal(Boolean(invalidReport.reasonCode), true);
  assert.equal(Boolean(invalidReport.description), true);

  const validReport = validateMalpracticeReportForm({
    studentId: "30000000-0000-4000-8000-000000000001",
    badgeId: "40000000-0000-4000-8000-000000000001",
    reasonCode: "CODE_PLAGIARISM",
    description: "Verified external repository code match during live session.",
    evidenceReference: "case-doc-42",
  });
  assert.deepEqual(validReport, {});

  assert.equal(Boolean(validateReinstateForm({ reason: "" }).reason), true);
  assert.deepEqual(validateReinstateForm({ reason: "Appeal evidence verified." }), {});
  assert.equal(isValidUuid(generateUuid()), true);
});

test("hasAllowedRole verifies intersection between user roles and required roles", async () => {
  const { hasAllowedRole } = await import("./domain");
  assert.equal(hasAllowedRole(["STUDENT"], ["STUDENT"]), true);
  assert.equal(hasAllowedRole(["STUDENT"], ["OPERATIONS", "ADMIN"]), false);
  assert.equal(hasAllowedRole(["OPERATIONS"], ["OPERATIONS", "ADMIN"]), true);
});

test("validateSignupForm validates name, email, password strength, and confirmation", () => {
  const invalid = validateSignupForm({
    fullName: "A",
    email: "not-an-email",
    password: "short",
    confirmPassword: "mismatch",
  });
  assert.equal(Boolean(invalid.fullName), true);
  assert.equal(Boolean(invalid.email), true);
  assert.equal(Boolean(invalid.password), true);
  assert.equal(Boolean(invalid.confirmPassword), true);

  const noNumber = validateSignupForm({
    fullName: "Aarav Mehta",
    email: "aarav@example.com",
    password: "OnlyLettersPassword",
    confirmPassword: "OnlyLettersPassword",
  });
  assert.equal(Boolean(noNumber.password), true);

  const valid = validateSignupForm({
    fullName: "Aarav Mehta",
    email: "aarav@example.com",
    password: "Password123",
    confirmPassword: "Password123",
  });
  assert.deepEqual(valid, {});
});

test("canStudentModifyBooking enforces 2-hour cutoff and modifiable statuses", () => {
  const now = new Date("2026-12-01T10:00:00Z");

  assert.equal(
    canStudentModifyBooking({ status: "BOOKED", starts_at: "2026-12-01T12:30:00Z" }, now).allowed,
    true
  );
  assert.equal(
    canStudentModifyBooking({ status: "BOOKED", starts_at: "2026-12-01T11:30:00Z" }, now).allowed,
    false
  );
  assert.equal(
    canStudentModifyBooking({ status: "EVALUATED", starts_at: "2026-12-02T10:00:00Z" }, now).allowed,
    false
  );
  assert.equal(
    canStudentModifyBooking({ status: "CANCELLED", starts_at: "2026-12-02T10:00:00Z" }, now).allowed,
    false
  );
});

test("validateBookingReasonForm requires minimum 5 trimmed characters", () => {
  assert.equal(Boolean(validateBookingReasonForm({ reason: "no" }).reason), true);
  assert.deepEqual(validateBookingReasonForm({ reason: "Conflict with lab exam" }), {});
});

test("status metadata & lifecycle helpers return expected labels and action gates", () => {
  assert.equal(getInvitationStatusMeta("PENDING").label, "Pending");
  assert.equal(getInvitationStatusMeta("ACCEPTED").tone, "success");
  assert.equal(getAttendanceStatusMeta("NO_SHOW").tone, "error");

  assert.deepEqual(getInterviewerLifecycleActions("BOOKED"), {
    canStart: true,
    canMarkAwaitingOutcome: false,
    canRecordAttendance: true,
    canSubmitEvaluation: false,
  });
  assert.deepEqual(getInterviewerLifecycleActions("IN_PROGRESS"), {
    canStart: false,
    canMarkAwaitingOutcome: true,
    canRecordAttendance: true,
    canSubmitEvaluation: true,
  });
  assert.deepEqual(getInterviewerLifecycleActions("EVALUATED"), {
    canStart: false,
    canMarkAwaitingOutcome: false,
    canRecordAttendance: false,
    canSubmitEvaluation: false,
  });
});

test("groupBookableSlotsByDate groups slots chronologically in the chosen timezone", () => {
  const grouped = groupBookableSlotsByDate(
    [
      {
        interviewerId: "i-1",
        interviewerName: "Ananya Rao",
        interviewerTitle: "Lead",
        interviewerTimezone: "UTC",
        startsAt: "2026-12-02T10:00:00Z",
        endsAt: "2026-12-02T10:45:00Z",
        durationMinutes: 45,
      },
      {
        interviewerId: "i-1",
        interviewerName: "Ananya Rao",
        interviewerTitle: "Lead",
        interviewerTimezone: "UTC",
        startsAt: "2026-12-01T14:00:00Z",
        endsAt: "2026-12-01T14:45:00Z",
        durationMinutes: 45,
      },
    ],
    "UTC"
  );

  assert.equal(grouped.length, 2);
  assert.equal(grouped[0].dateKey, "2026-12-01");
  assert.equal(grouped[1].dateKey, "2026-12-02");
});
