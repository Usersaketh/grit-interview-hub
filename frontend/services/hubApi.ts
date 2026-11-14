import { apiRequest, ApiClientError } from "@frontend/services/apiClient";
import { getSupabaseBrowserClient } from "@frontend/services/supabaseBrowser";
import type {
  AcceptInvitationPayload,
  AcceptInvitationResponse,
  AdminDashboardMetrics,
  AttendanceStatus,
  AuditLogPageResponse,
  AvailabilityInputPayload,
  BadgeAwardRecord,
  BadgeCertificationDetail,
  BadgeCertificationQueueRow,
  BadgeRequiredSkill,
  BadgeSummary,
  BookableInterviewerSummary,
  BookingInputPayload,
  CancelBookingPayload,
  CertificationStatus,
  CreateInvitationPayload,
  CreateInvitationResponse,
  EligibilityDecision,
  EvaluationInputPayload,
  InterviewRecord,
  InterviewResultRecord,
  InterviewWorkspaceDetail,
  InterviewerAvailabilityRecord,
  InterviewerInvitationRecord,
  InterviewerRosterItem,
  InvitationVerifyInfo,
  MalpracticeNullifyInputPayload,
  MalpracticeQueueRow,
  MalpracticeReinstateInputPayload,
  MalpracticeReportInputPayload,
  MalpracticeReviewInputPayload,
  NotificationRecord,
  RescheduleBookingPayload,
  SlotsDiscoveryResponse,
  StudentMalpracticeStatusResponse,
  StudentOverviewResponse,
  StudentRosterItem,
  StudentSignupPayload,
  StudentSignupResponse,
  StudentSkillProgress,
  UserProfile,
} from "@frontend/types/api";

/* ============================================================================
 * 1. Core /api/v1 HTTP endpoints (authoritative backend contracts)
 * ========================================================================== */

export function signupStudentAccount(
  payload: StudentSignupPayload
): Promise<StudentSignupResponse> {
  return apiRequest<StudentSignupResponse>("/api/v1/auth/signup", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function verifyInvitationById(
  invitationId: string
): Promise<InvitationVerifyInfo> {
  return apiRequest<InvitationVerifyInfo>(
    `/api/v1/invitations/verify?invitationId=${encodeURIComponent(invitationId)}`
  );
}

export function acceptInvitationById(
  payload: AcceptInvitationPayload
): Promise<AcceptInvitationResponse> {
  return apiRequest<AcceptInvitationResponse>("/api/v1/invitations/accept", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function fetchProfile(): Promise<UserProfile> {
  return apiRequest<UserProfile>("/api/v1/profile");
}

export function fetchStudentOverview(): Promise<StudentOverviewResponse> {
  return apiRequest<StudentOverviewResponse>("/api/v1/student/overview");
}

export function fetchStudentNotifications(): Promise<NotificationRecord[]> {
  return apiRequest<NotificationRecord[]>("/api/v1/student/notifications");
}

export function markStudentNotificationRead(
  notificationId: string
): Promise<NotificationRecord> {
  return apiRequest<NotificationRecord>(
    `/api/v1/student/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
    }
  );
}

export function fetchBadgeEligibility(
  badgeId: string
): Promise<EligibilityDecision> {
  return apiRequest<EligibilityDecision>(
    `/api/v1/student/badges/${encodeURIComponent(badgeId)}/eligibility`
  );
}

export function fetchBookableInterviewers(
  badgeId?: string
): Promise<BookableInterviewerSummary[]> {
  const qs = badgeId ? `?badgeId=${encodeURIComponent(badgeId)}` : "";
  return apiRequest<BookableInterviewerSummary[]>(
    `/api/v1/student/interviewers${qs}`
  );
}

export function fetchBookableSlots(params: {
  badgeId: string;
  interviewerId?: string;
  from?: string;
  to?: string;
  excludeInterviewId?: string;
  durationMinutes?: number;
}): Promise<SlotsDiscoveryResponse> {
  const sp = new URLSearchParams({ badgeId: params.badgeId });
  if (params.interviewerId) sp.set("interviewerId", params.interviewerId);
  if (params.from) sp.set("from", params.from);
  if (params.to) sp.set("to", params.to);
  if (params.excludeInterviewId) {
    sp.set("excludeInterviewId", params.excludeInterviewId);
  }
  if (params.durationMinutes) {
    sp.set("durationMinutes", String(params.durationMinutes));
  }
  return apiRequest<SlotsDiscoveryResponse>(
    `/api/v1/student/slots?${sp.toString()}`
  );
}

export function fetchStudentInterviews(): Promise<InterviewRecord[]> {
  return apiRequest<InterviewRecord[]>("/api/v1/student/interviews");
}

export function fetchStudentInterviewDetail(
  interviewId: string
): Promise<InterviewWorkspaceDetail> {
  return apiRequest<InterviewWorkspaceDetail>(
    `/api/v1/student/interviews/${encodeURIComponent(interviewId)}`
  );
}

export function bookStudentInterview(
  payload: BookingInputPayload
): Promise<InterviewRecord> {
  return apiRequest<InterviewRecord>("/api/v1/student/interviews/book", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function cancelStudentBooking(
  interviewId: string,
  payload: CancelBookingPayload
): Promise<InterviewRecord> {
  return apiRequest<InterviewRecord>(
    `/api/v1/student/interviews/${encodeURIComponent(interviewId)}/cancel`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function rescheduleStudentBooking(
  interviewId: string,
  payload: RescheduleBookingPayload
): Promise<InterviewRecord> {
  return apiRequest<InterviewRecord>(
    `/api/v1/student/interviews/${encodeURIComponent(interviewId)}/reschedule`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function fetchStudentMalpracticeStatus(): Promise<StudentMalpracticeStatusResponse> {
  return apiRequest<StudentMalpracticeStatusResponse>(
    "/api/v1/student/malpractice-status"
  );
}

export function fetchInterviewerAvailability(): Promise<
  InterviewerAvailabilityRecord[]
> {
  return apiRequest<InterviewerAvailabilityRecord[]>(
    "/api/v1/interviewer/availability"
  );
}

export function createInterviewerAvailability(
  payload: AvailabilityInputPayload
): Promise<InterviewerAvailabilityRecord> {
  return apiRequest<InterviewerAvailabilityRecord>(
    "/api/v1/interviewer/availability",
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function updateInterviewerAvailability(
  id: string,
  payload: AvailabilityInputPayload
): Promise<InterviewerAvailabilityRecord> {
  return apiRequest<InterviewerAvailabilityRecord>(
    `/api/v1/interviewer/availability/${encodeURIComponent(id)}`,
    {
      method: "PUT",
      body: JSON.stringify(payload),
    }
  );
}

export function deleteInterviewerAvailability(id: string): Promise<void> {
  return apiRequest<void>(
    `/api/v1/interviewer/availability/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    }
  );
}

export function fetchInterviewerInterviewDetail(
  interviewId: string
): Promise<InterviewWorkspaceDetail> {
  return apiRequest<InterviewWorkspaceDetail>(
    `/api/v1/interviewer/interviews/${encodeURIComponent(interviewId)}`
  );
}

export function startInterviewSession(
  interviewId: string,
  payload: {
    studentAttendance?: AttendanceStatus;
    interviewerAttendance?: AttendanceStatus;
    notes?: string;
    idempotencyKey: string;
  }
): Promise<InterviewRecord> {
  return apiRequest<InterviewRecord>(
    `/api/v1/interviewer/interviews/${encodeURIComponent(interviewId)}/start`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function completeInterviewSession(
  interviewId: string,
  payload: {
    studentAttendance?: AttendanceStatus;
    interviewerAttendance?: AttendanceStatus;
    notes?: string;
    idempotencyKey: string;
  }
): Promise<InterviewRecord> {
  return apiRequest<InterviewRecord>(
    `/api/v1/interviewer/interviews/${encodeURIComponent(interviewId)}/awaiting-outcome`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function recordInterviewAttendance(
  interviewId: string,
  payload: {
    studentAttendance: AttendanceStatus;
    interviewerAttendance: AttendanceStatus;
    notes?: string;
    markNoShow?: boolean;
    idempotencyKey: string;
  }
): Promise<InterviewRecord> {
  return apiRequest<InterviewRecord>(
    `/api/v1/interviewer/interviews/${encodeURIComponent(interviewId)}/attendance`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function submitInterviewEvaluation(
  interviewId: string,
  payload: EvaluationInputPayload
): Promise<InterviewResultRecord> {
  return apiRequest<InterviewResultRecord>(
    `/api/v1/interviewer/interviews/${encodeURIComponent(interviewId)}/result`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function fetchAdminDashboard(): Promise<AdminDashboardMetrics> {
  return apiRequest<AdminDashboardMetrics>("/api/v1/admin/dashboard");
}

export function fetchAdminInvitations(): Promise<
  InterviewerInvitationRecord[]
> {
  return apiRequest<InterviewerInvitationRecord[]>("/api/v1/admin/invitations");
}

export function createAdminInvitation(
  payload: CreateInvitationPayload
): Promise<CreateInvitationResponse> {
  return apiRequest<CreateInvitationResponse>("/api/v1/admin/invitations", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function revokeAdminInvitation(
  invitationId: string,
  payload: { reason?: string; idempotencyKey: string }
): Promise<InterviewerInvitationRecord> {
  return apiRequest<InterviewerInvitationRecord>(
    `/api/v1/admin/invitations/${encodeURIComponent(invitationId)}/revoke`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function fetchBadgeCertifications(params?: {
  status?: CertificationStatus;
  search?: string;
}): Promise<BadgeCertificationQueueRow[]> {
  const sp = new URLSearchParams();
  if (params?.status) sp.set("status", params.status);
  if (params?.search) sp.set("search", params.search);
  const qs = sp.toString();
  return apiRequest<BadgeCertificationQueueRow[]>(
    `/api/v1/admin/badge-certifications${qs ? `?${qs}` : ""}`
  );
}

export function fetchBadgeCertificationDetail(
  badgeAwardId: string
): Promise<BadgeCertificationDetail> {
  return apiRequest<BadgeCertificationDetail>(
    `/api/v1/admin/badge-certifications/${encodeURIComponent(badgeAwardId)}`
  );
}

export function approveBadgeCertification(
  badgeAwardId: string,
  idempotencyKey: string
): Promise<BadgeAwardRecord> {
  return apiRequest<BadgeAwardRecord>(
    `/api/v1/admin/badge-certifications/${encodeURIComponent(badgeAwardId)}/approve`,
    {
      method: "POST",
      body: JSON.stringify({ idempotencyKey }),
    }
  );
}

export function fetchAuditLogs(params?: {
  entityType?: string;
  action?: string;
  search?: string;
  from?: string;
  to?: string;
  limit?: number;
  offset?: number;
}): Promise<AuditLogPageResponse> {
  const sp = new URLSearchParams();
  if (params?.entityType) sp.set("entityType", params.entityType);
  if (params?.action) sp.set("action", params.action);
  if (params?.search) sp.set("search", params.search);
  if (params?.from) sp.set("from", params.from);
  if (params?.to) sp.set("to", params.to);
  if (params?.limit !== undefined) sp.set("limit", String(params.limit));
  if (params?.offset !== undefined) sp.set("offset", String(params.offset));
  const qs = sp.toString();
  return apiRequest<AuditLogPageResponse>(
    `/api/v1/admin/audit-logs${qs ? `?${qs}` : ""}`
  );
}

export function fetchMalpracticeQueue(): Promise<MalpracticeQueueRow[]> {
  return apiRequest<MalpracticeQueueRow[]>("/api/v1/admin/malpractice");
}

export function createMalpracticeReport(
  payload: MalpracticeReportInputPayload
): Promise<MalpracticeQueueRow> {
  return apiRequest<MalpracticeQueueRow>("/api/v1/admin/malpractice", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function reviewMalpracticeReport(
  reportId: string,
  payload: MalpracticeReviewInputPayload
): Promise<MalpracticeQueueRow> {
  return apiRequest<MalpracticeQueueRow>(
    `/api/v1/admin/malpractice/${encodeURIComponent(reportId)}/review`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function nullifyBadgeAward(
  reportId: string,
  payload: MalpracticeNullifyInputPayload
): Promise<BadgeAwardRecord> {
  return apiRequest<BadgeAwardRecord>(
    `/api/v1/admin/malpractice/${encodeURIComponent(reportId)}/nullify`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

export function reinstateBadgeAward(
  reportId: string,
  payload: MalpracticeReinstateInputPayload
): Promise<BadgeAwardRecord> {
  return apiRequest<BadgeAwardRecord>(
    `/api/v1/admin/malpractice/${encodeURIComponent(reportId)}/reinstate`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    }
  );
}

/* ============================================================================
 * 2. RLS-permitted read-only Supabase queries (ONLY tables with authenticated
 *    GRANT SELECT in migration 0002 and not revoked in migration 0005)
 * ========================================================================== */

function requireSupabaseClient() {
  const client = getSupabaseBrowserClient();
  if (!client) {
    throw new ApiClientError(
      503,
      "SUPABASE_NOT_CONFIGURED",
      "Supabase client configuration is missing in this environment."
    );
  }
  return client;
}

export async function fetchBadgesCatalog(): Promise<BadgeSummary[]> {
  const db = requireSupabaseClient();
  const { data, error } = await db
    .from("badges")
    .select("id, track_id, external_id, name, level, description, is_active")
    .order("name", { ascending: true });
  if (error) {
    throw new ApiClientError(400, error.code ?? "QUERY_ERROR", error.message);
  }
  return (data ?? []) as BadgeSummary[];
}

export async function fetchBadgeRequiredSkills(
  badgeId?: string
): Promise<BadgeRequiredSkill[]> {
  const db = requireSupabaseClient();
  const query = db
    .from("badge_required_skills")
    .select("badge_id, skill_id, required_level");
  const { data, error } = badgeId
    ? await query.eq("badge_id", badgeId)
    : await query;
  if (error) {
    throw new ApiClientError(400, error.code ?? "QUERY_ERROR", error.message);
  }
  return (data ?? []) as BadgeRequiredSkill[];
}

export async function fetchOwnStudentRow(userId: string): Promise<{
  id: string;
  user_id: string;
  external_student_id: string;
  campus_ref: string | null;
  created_at: string;
} | null> {
  const db = requireSupabaseClient();
  const { data, error } = await db
    .from("students")
    .select("id, user_id, external_student_id, campus_ref, created_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new ApiClientError(400, error.code ?? "QUERY_ERROR", error.message);
  }
  return data;
}

export async function fetchOwnInterviewerRow(userId: string): Promise<{
  id: string;
  user_id: string;
  is_active: boolean;
  default_timezone: string;
} | null> {
  const db = requireSupabaseClient();
  const { data, error } = await db
    .from("interviewers")
    .select("id, user_id, is_active, default_timezone")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) {
    throw new ApiClientError(400, error.code ?? "QUERY_ERROR", error.message);
  }
  return data;
}

export async function fetchStudentSkillProgress(
  studentId: string
): Promise<StudentSkillProgress[]> {
  const db = requireSupabaseClient();
  const { data, error } = await db
    .from("skill_progress")
    .select("skill_id, achieved_level, verified_at, source_updated_at")
    .eq("student_id", studentId);
  if (error) {
    throw new ApiClientError(400, error.code ?? "QUERY_ERROR", error.message);
  }
  return (data ?? []) as StudentSkillProgress[];
}

export async function fetchScopedInterviews(): Promise<InterviewRecord[]> {
  const db = requireSupabaseClient();
  const { data, error } = await db
    .from("interviews")
    .select("*, badges(name, level), interview_results(*)")
    .order("starts_at", { ascending: false });
  if (error) {
    throw new ApiClientError(400, error.code ?? "QUERY_ERROR", error.message);
  }
  return (data ?? []) as InterviewRecord[];
}

export async function fetchScopedInterviewById(
  interviewId: string
): Promise<InterviewRecord | null> {
  const db = requireSupabaseClient();
  const { data, error } = await db
    .from("interviews")
    .select("*, badges(name, level), interview_results(*)")
    .eq("id", interviewId)
    .maybeSingle();
  if (error) {
    throw new ApiClientError(400, error.code ?? "QUERY_ERROR", error.message);
  }
  return (data ?? null) as InterviewRecord | null;
}

export async function fetchStaffStudentsRoster(): Promise<StudentRosterItem[]> {
  const db = requireSupabaseClient();
  const { data, error } = await db
    .from("students")
    .select("id, user_id, external_student_id, campus_ref, created_at")
    .order("created_at", { ascending: false });
  if (error) {
    throw new ApiClientError(400, error.code ?? "QUERY_ERROR", error.message);
  }
  const rows = (data ?? []) as StudentRosterItem[];
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: profilesData } = await db
    .from("profiles")
    .select("id, full_name, email, is_active")
    .in("id", userIds);

  const profileMap = new Map(
    (profilesData ?? []).map((p) => [
      p.id as string,
      {
        full_name: p.full_name as string,
        email: p.email as string,
        is_active: p.is_active as boolean,
      },
    ])
  );

  return rows.map((row) => ({
    ...row,
    profile: profileMap.get(row.user_id) ?? null,
  }));
}

export async function fetchStaffInterviewersRoster(): Promise<
  InterviewerRosterItem[]
> {
  const db = requireSupabaseClient();
  const { data, error } = await db
    .from("interviewers")
    .select("id, user_id, is_active, default_timezone")
    .order("created_at", { ascending: false });
  if (error) {
    throw new ApiClientError(400, error.code ?? "QUERY_ERROR", error.message);
  }
  const rows = (data ?? []) as InterviewerRosterItem[];
  if (rows.length === 0) return [];

  const userIds = rows.map((r) => r.user_id);
  const { data: profilesData } = await db
    .from("profiles")
    .select("id, full_name, email")
    .in("id", userIds);

  const profileMap = new Map(
    (profilesData ?? []).map((p) => [
      p.id as string,
      {
        full_name: p.full_name as string,
        email: p.email as string,
      },
    ])
  );

  return rows.map((row) => ({
    ...row,
    profile: profileMap.get(row.user_id) ?? null,
  }));
}
