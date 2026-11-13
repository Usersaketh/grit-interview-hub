export type AppRole = "STUDENT" | "INTERVIEWER" | "OPERATIONS" | "ADMIN";

export type BookingStatus =
  | "BOOKED"
  | "RESCHEDULE_PENDING"
  | "CANCELLED"
  | "INTERVIEWER_CANCELLED"
  | "IN_PROGRESS"
  | "AWAITING_OUTCOME"
  | "EVALUATED"
  | "NO_SHOW";

export type EvaluationOutcome = "PASS" | "FAIL" | "RETAKE_LATER";

export type CertificationStatus =
  | "LOCKED"
  | "ELIGIBLE_FOR_INTERVIEW"
  | "CERTIFICATION_PENDING"
  | "AWARDED"
  | "NULLIFICATION_UNDER_REVIEW"
  | "NULLIFIED"
  | "REINSTATED";

export type MalpracticeStatus =
  | "REPORTED"
  | "UNDER_REVIEW"
  | "DISMISSED"
  | "CONFIRMED"
  | "APPEALED"
  | "REINSTATED";

export type MalpracticeReviewTargetStatus =
  | "UNDER_REVIEW"
  | "DISMISSED"
  | "CONFIRMED"
  | "APPEALED";

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface ApiSuccessBody<T> {
  data: T;
}

export interface UserProfile {
  id: string;
  full_name: string;
  email: string;
  is_active: boolean;
  roles: AppRole[];
}

export interface EligibilityDecision {
  eligible: boolean;
  state: "ELIGIBLE" | "NOT_ELIGIBLE";
  unmetSkillIds: string[];
  reason: string;
}

export interface BadgeSummary {
  id: string;
  track_id: string;
  external_id: string | null;
  name: string;
  level: string;
  is_active: boolean;
}

export interface BadgeRequiredSkill {
  badge_id: string;
  skill_id: string;
  required_level: number;
}

export interface StudentSkillProgress {
  skill_id: string;
  achieved_level: number;
  verified_at: string | null;
  source_updated_at: string;
}

export interface InterviewResultRecord {
  id: string;
  interview_id: string;
  outcome: EvaluationOutcome;
  feedback: string | null;
  evaluator_id: string;
  submitted_at: string;
  retake_after: string | null;
  visibility_status: string;
}

export interface InterviewRecord {
  id: string;
  student_id: string;
  badge_id: string;
  interviewer_id: string;
  starts_at: string;
  ends_at: string;
  timezone: string;
  status: BookingStatus;
  booking_reference: string;
  attempt_number: number;
  created_by: string;
  cancelled_at: string | null;
  cancellation_reason: string | null;
  created_at: string;
  updated_at: string;
  badges?: {
    name: string;
    level: string;
  } | null;
  interview_results?: InterviewResultRecord | InterviewResultRecord[] | null;
}

export interface BookingInputPayload {
  badgeId: string;
  interviewerId: string;
  startsAt: string;
  endsAt: string;
  timezone: string;
  idempotencyKey: string;
}

export interface InterviewerAvailabilityRecord {
  id: string;
  interviewer_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
  timezone: string;
  effective_from: string;
  effective_until: string | null;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface AvailabilityInputPayload {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}

export interface EvaluationInputPayload {
  outcome: EvaluationOutcome;
  feedback?: string;
  retakeAfter?: string;
  idempotencyKey: string;
}

export interface StudentBadgeAwardStatus {
  recordType: "badge_award";
  badgeId: string | null;
  awardId: string | null;
  awardStatus: CertificationStatus | null;
  awardedAt: string | null;
  nullifiedAt: string | null;
  reinstatedAt: string | null;
}

export interface StudentMalpracticeReportStatus {
  recordType: "malpractice_report";
  badgeId: string | null;
  reportId: string | null;
  reportStatus: MalpracticeStatus | null;
  reportCreatedAt: string | null;
}

export type StudentMalpracticeStatusRow =
  | StudentBadgeAwardStatus
  | StudentMalpracticeReportStatus;

export interface StudentMalpracticeStatusResponse {
  studentId: string;
  records: StudentMalpracticeStatusRow[];
}

export interface AdminDashboardMetrics {
  totalInterviews: number;
  pendingEvaluations: number;
  evaluated: number;
  pendingCertifications?: number;
  pendingInvitations?: number;
}

export interface BadgeAwardRecord {
  id: string;
  student_id: string;
  badge_id: string;
  interview_result_id: string | null;
  external_award_id: string | null;
  status: CertificationStatus;
  awarded_at: string | null;
  nullified_at: string | null;
  reinstated_at: string | null;
  created_at: string;
}

export interface MalpracticeQueueRow {
  id: string;
  student_id: string;
  badge_id: string;
  reported_by: string;
  reason_code: string;
  description: string;
  evidence_reference: string | null;
  status: MalpracticeStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  reviewer_notes: string | null;
  created_at: string;
}

export interface MalpracticeReportInputPayload {
  studentId: string;
  badgeId: string;
  reasonCode: string;
  description: string;
  evidenceReference?: string | null;
  idempotencyKey: string;
}

export interface MalpracticeReviewInputPayload {
  toStatus: MalpracticeReviewTargetStatus;
  reviewerNotes?: string | null;
  idempotencyKey: string;
}

export interface MalpracticeReinstateInputPayload {
  reason: string;
  idempotencyKey: string;
}

export interface MalpracticeNullifyInputPayload {
  idempotencyKey: string;
}

export interface StudentRosterItem {
  id: string;
  user_id: string;
  external_student_id: string;
  campus_ref: string | null;
  created_at: string;
  profile?: {
    full_name: string;
    email: string;
    is_active: boolean;
  } | null;
}

export interface InterviewerRosterItem {
  id: string;
  user_id: string;
  is_active: boolean;
  default_timezone: string;
  profile?: {
    full_name: string;
    email: string;
  } | null;
}

export interface StudentSignupPayload {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
  campusRef?: string;
}

export interface StudentSignupResponse {
  userId: string;
  email: string;
  fullName: string;
  role: "STUDENT";
  requiresEmailVerification: boolean;
  sessionEstablished: boolean;
}

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export interface InterviewerInvitationRecord {
  id: string;
  email: string;
  full_name: string | null;
  default_timezone: string;
  title: string | null;
  expertise_tags: string[];
  invited_role: "INTERVIEWER";
  status: InvitationStatus;
  expires_at: string;
  invited_by: string;
  invited_by_name?: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
  revoked_by: string | null;
  revoked_at: string | null;
  revocation_reason: string | null;
  created_at: string;
}

export interface CreateInvitationPayload {
  email: string;
  fullName?: string;
  defaultTimezone: string;
  title?: string;
  expertiseTags: string[];
  expiresInDays: number;
  idempotencyKey: string;
}

export interface CreateInvitationResponse {
  invitation: InterviewerInvitationRecord;
  inviteUrl: string;
  tokenIssued: boolean;
}

export interface InvitationVerifyInfo {
  id: string;
  email: string;
  fullName: string | null;
  defaultTimezone: string;
  title: string | null;
  expertiseTags: string[];
  invitedRole: "INTERVIEWER";
  status: InvitationStatus;
  expiresAt: string;
}

export interface AcceptInvitationPayload {
  token: string;
  fullName?: string;
  password?: string;
}

export interface AcceptInvitationResponse {
  interviewer: {
    id: string;
    user_id: string;
    is_active: boolean;
    default_timezone: string;
  };
  email: string;
  role: "INTERVIEWER";
  signedIn: boolean;
}

export interface BookableInterviewerSummary {
  interviewer_id: string;
  display_name: string;
  title: string;
  bio: string | null;
  expertise_tags: string[];
  default_timezone: string;
  weekly_windows_count: number;
  availability_summary: Array<{
    day_of_week: number;
    start_time: string;
    end_time: string;
    timezone: string;
  }>;
}

export interface BookableSlot {
  interviewerId: string;
  interviewerName: string;
  interviewerTitle: string;
  interviewerTimezone: string;
  startsAt: string;
  endsAt: string;
  durationMinutes: number;
}

export interface SlotsDiscoveryResponse {
  slots: BookableSlot[];
  interviewers: Array<{
    interviewer_id: string;
    display_name: string;
    title: string;
    bio: string | null;
    expertise_tags: string[];
    default_timezone: string;
  }>;
  studentState: {
    hasActiveBooking: boolean;
    activeBookingId: string | null;
    retakeAfter: string | null;
  };
  window: {
    from: string;
    to: string;
    durationMinutes: number;
  };
}

export type AttendanceStatus = "ATTENDED" | "LATE" | "NO_SHOW";

export interface InterviewAttendanceRecord {
  id: string;
  interview_id: string;
  student_attendance: AttendanceStatus;
  interviewer_attendance: AttendanceStatus;
  marked_by: string | null;
  marked_at: string | null;
  notes: string | null;
}

export interface InterviewRescheduleEntry {
  id: string;
  old_starts_at: string;
  old_ends_at: string;
  new_starts_at: string;
  new_ends_at: string;
  reason: string | null;
  created_at: string;
}

export interface InterviewWorkspaceDetail {
  interview: InterviewRecord;
  badge: {
    id: string;
    name: string;
    level: string;
    track_name: string;
  } | null;
  student: {
    id: string;
    full_name: string | null;
    external_student_id: string | null;
    campus_ref: string | null;
  };
  interviewer: {
    id: string;
    display_name: string | null;
    title: string | null;
  };
  attendance: InterviewAttendanceRecord | null;
  result: InterviewResultRecord | null;
  reschedule_history: InterviewRescheduleEntry[];
}

export interface CancelBookingPayload {
  reason: string;
  idempotencyKey: string;
}

export interface RescheduleBookingPayload {
  newInterviewerId: string;
  newStartsAt: string;
  newEndsAt: string;
  timezone: string;
  reason: string;
  idempotencyKey: string;
}

export interface BadgeCertificationQueueRow {
  id: string;
  student_id: string;
  student_name: string;
  external_student_id: string;
  campus_ref: string | null;
  badge_id: string;
  badge_name: string;
  badge_level: string;
  track_name: string;
  interview_result_id: string | null;
  interview_id: string | null;
  booking_reference: string | null;
  outcome: EvaluationOutcome | null;
  feedback: string | null;
  evaluator_name: string | null;
  submitted_at: string | null;
  status: CertificationStatus;
  external_award_id: string | null;
  awarded_at: string | null;
  nullified_at: string | null;
  reinstated_at: string | null;
  created_at: string;
}

export interface BadgeCertificationDetail extends BadgeCertificationQueueRow {
  interview_starts_at: string | null;
  interview_timezone: string | null;
  reinstatements: Array<{
    id: string;
    malpractice_report_id: string;
    reason: string;
    approved_by: string;
    reinstated_at: string;
  }>;
}

export interface AuditLogItem {
  id: string;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  entityType: string;
  entityId: string;
  action: string;
  previousValue: Record<string, unknown> | null;
  newValue: Record<string, unknown> | null;
  reason: string | null;
  createdAt: string;
}

export interface AuditLogPageResponse {
  items: AuditLogItem[];
  totalCount: number;
  limit: number;
  offset: number;
}
