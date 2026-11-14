import type {
  AppRole,
  AttendanceStatus,
  BookableSlot,
  BookingStatus,
  CertificationStatus,
  EvaluationOutcome,
  InterviewRecord,
  InterviewResultRecord,
  InvitationStatus,
  MalpracticeReviewTargetStatus,
  MalpracticeStatus,
  UserProfile,
} from "../types/api";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "error";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const TIME_HHMM_REGEX = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE_YYYYMMDD_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const DAY_OF_WEEK_LABELS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value.trim());
}

export function normalizeInterviewResult(
  result: InterviewRecord["interview_results"]
): InterviewResultRecord | null {
  if (!result) return null;
  if (Array.isArray(result)) return result[0] ?? null;
  return result;
}

export function formatDayOfWeek(dayOfWeek: number): string {
  return DAY_OF_WEEK_LABELS[dayOfWeek] ?? `Day ${dayOfWeek}`;
}

export function formatTimeShort(timeStr: string): string {
  // Normalizes HH:MM:SS -> HH:MM
  const parts = timeStr.split(":");
  if (parts.length >= 2) {
    return `${parts[0].padStart(2, "0")}:${parts[1].padStart(2, "0")}`;
  }
  return timeStr;
}

export function formatTimestamp(
  isoString: string | null | undefined,
  timezone?: string
): string {
  if (!isoString) return "Not set";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  try {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: timezone || undefined,
    }).format(date);
  } catch {
    return new Intl.DateTimeFormat("en-US", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }
}

export function formatDateOnly(isoString: string | null | undefined): string {
  if (!isoString) return "Not set";
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
  }).format(date);
}

export function getBookingStatusMeta(status: BookingStatus): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "BOOKED":
      return { label: "Booked", tone: "info" };
    case "RESCHEDULE_PENDING":
      return { label: "Reschedule pending", tone: "warning" };
    case "IN_PROGRESS":
      return { label: "In progress", tone: "info" };
    case "AWAITING_OUTCOME":
      return { label: "Awaiting outcome", tone: "warning" };
    case "EVALUATED":
      return { label: "Evaluated", tone: "success" };
    case "CANCELLED":
      return { label: "Cancelled", tone: "neutral" };
    case "INTERVIEWER_CANCELLED":
      return { label: "Interviewer cancelled", tone: "warning" };
    case "NO_SHOW":
      return { label: "No show", tone: "error" };
  }
}

export function getOutcomeMeta(outcome: EvaluationOutcome): {
  label: string;
  tone: StatusTone;
} {
  switch (outcome) {
    case "PASS":
      return { label: "Pass", tone: "success" };
    case "FAIL":
      return { label: "Fail", tone: "error" };
    case "RETAKE_LATER":
      return { label: "Retake later", tone: "warning" };
  }
}

export function getCertificationStatusMeta(status: CertificationStatus): {
  label: string;
  tone: StatusTone;
  description: string;
} {
  switch (status) {
    case "LOCKED":
      return {
        label: "Locked",
        tone: "neutral",
        description: "Required skill clearances are not yet verified.",
      };
    case "ELIGIBLE_FOR_INTERVIEW":
      return {
        label: "Eligible for interview",
        tone: "info",
        description: "Skills verified; ready to schedule a live interview.",
      };
    case "CERTIFICATION_PENDING":
      return {
        label: "Certification pending",
        tone: "warning",
        description:
          "Interview passed. Awaiting administrator approval to issue the official badge award.",
      };
    case "AWARDED":
      return {
        label: "Awarded",
        tone: "success",
        description: "Badge certification has been officially approved and awarded.",
      };
    case "NULLIFICATION_UNDER_REVIEW":
      return {
        label: "Nullification under review",
        tone: "warning",
        description: "Award is currently under certification integrity review.",
      };
    case "NULLIFIED":
      return {
        label: "Nullified",
        tone: "error",
        description: "Badge award was revoked following a confirmed review.",
      };
    case "REINSTATED":
      return {
        label: "Reinstated",
        tone: "success",
        description: "Badge award was restored after an accepted appeal.",
      };
  }
}

export function getMalpracticeStatusMeta(status: MalpracticeStatus): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "REPORTED":
      return { label: "Reported", tone: "info" };
    case "UNDER_REVIEW":
      return { label: "Under review", tone: "warning" };
    case "DISMISSED":
      return { label: "Dismissed", tone: "neutral" };
    case "CONFIRMED":
      return { label: "Confirmed", tone: "error" };
    case "APPEALED":
      return { label: "Appealed", tone: "warning" };
    case "REINSTATED":
      return { label: "Reinstated", tone: "success" };
  }
}

/**
 * Exact transition rules enforced by public.review_malpractice_report in
 * supabase/migrations/202611130004_malpractice_workflow.sql.
 */
export function getAllowedReviewTransitions(
  currentStatus: MalpracticeStatus
): MalpracticeReviewTargetStatus[] {
  switch (currentStatus) {
    case "REPORTED":
      return ["UNDER_REVIEW"];
    case "UNDER_REVIEW":
      return ["DISMISSED", "CONFIRMED"];
    case "CONFIRMED":
      return ["APPEALED"];
    case "APPEALED":
      return ["CONFIRMED"];
    case "DISMISSED":
    case "REINSTATED":
      return [];
  }
}

export function canNullifyCase(status: MalpracticeStatus): boolean {
  return status === "CONFIRMED";
}

export function canReinstateCase(status: MalpracticeStatus): boolean {
  return status === "APPEALED";
}

export function validateBookingForm(input: {
  badgeId: string;
  interviewerId: string;
  startsAtIso: string;
  endsAtIso: string;
  timezone: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isValidUuid(input.badgeId)) {
    errors.badgeId = "Enter a valid Badge UUID.";
  }
  if (!isValidUuid(input.interviewerId)) {
    errors.interviewerId = "Enter a valid Interviewer UUID.";
  }
  const startMs = Date.parse(input.startsAtIso);
  const endMs = Date.parse(input.endsAtIso);
  if (Number.isNaN(startMs)) {
    errors.startsAt = "Select a valid start date and time.";
  }
  if (Number.isNaN(endMs)) {
    errors.endsAt = "Select a valid end date and time.";
  }
  if (!Number.isNaN(startMs) && !Number.isNaN(endMs) && endMs <= startMs) {
    errors.endsAt = "End time must be after start time.";
  }
  if (!input.timezone.trim() || input.timezone.trim().length > 64) {
    errors.timezone = "Provide a valid IANA timezone (e.g. Asia/Kolkata).";
  }
  return errors;
}

export function validateAvailabilityForm(input: {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  effectiveFrom: string;
  effectiveUntil?: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!Number.isInteger(input.dayOfWeek) || input.dayOfWeek < 0 || input.dayOfWeek > 6) {
    errors.dayOfWeek = "Select a valid day of the week.";
  }
  if (!TIME_HHMM_REGEX.test(input.startTime)) {
    errors.startTime = "Start time must be in HH:MM (24-hour) format.";
  }
  if (!TIME_HHMM_REGEX.test(input.endTime)) {
    errors.endTime = "End time must be in HH:MM (24-hour) format.";
  }
  if (
    TIME_HHMM_REGEX.test(input.startTime) &&
    TIME_HHMM_REGEX.test(input.endTime) &&
    input.endTime <= input.startTime
  ) {
    errors.endTime = "End time must be after start time.";
  }
  if (!input.timezone.trim() || input.timezone.trim().length > 64) {
    errors.timezone = "Timezone is required.";
  }
  if (!DATE_YYYYMMDD_REGEX.test(input.effectiveFrom)) {
    errors.effectiveFrom = "Effective from date is required (YYYY-MM-DD).";
  }
  if (input.effectiveUntil && input.effectiveUntil.trim() !== "") {
    if (!DATE_YYYYMMDD_REGEX.test(input.effectiveUntil)) {
      errors.effectiveUntil = "Effective until date must be YYYY-MM-DD.";
    } else if (
      DATE_YYYYMMDD_REGEX.test(input.effectiveFrom) &&
      input.effectiveUntil < input.effectiveFrom
    ) {
      errors.effectiveUntil = "Effective until date cannot be before effective from date.";
    }
  }
  return errors;
}

export function validateEvaluationForm(input: {
  outcome: EvaluationOutcome | "";
  feedback: string;
  retakeAfterIso: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!input.outcome) {
    errors.outcome = "Select an evaluation outcome.";
  }
  if (input.feedback.length > 5000) {
    errors.feedback = "Feedback cannot exceed 5000 characters.";
  }
  if (input.outcome === "RETAKE_LATER") {
    if (!input.retakeAfterIso || Number.isNaN(Date.parse(input.retakeAfterIso))) {
      errors.retakeAfter = "A valid retake-after date and time is required for RETAKE_LATER.";
    }
  }
  return errors;
}

export function resolveDefaultPortalPath(roles: AppRole[]): string {
  if (roles.includes("ADMIN") || roles.includes("OPERATIONS")) {
    return "/operations";
  }
  if (roles.includes("INTERVIEWER")) {
    return "/interviewer";
  }
  if (roles.includes("STUDENT")) {
    return "/student";
  }
  return "/";
}

export function isStaffRole(roles: AppRole[]): boolean {
  return roles.includes("OPERATIONS") || roles.includes("ADMIN");
}

export function hasAllowedRole(
  userRoles: AppRole[],
  allowedRoles: readonly AppRole[]
): boolean {
  return allowedRoles.some((role) => userRoles.includes(role));
}

export function getRequiredRolesForPath(
  pathname: string
): readonly AppRole[] | null {
  if (pathname === "/student" || pathname.startsWith("/student/")) {
    return ["STUDENT"];
  }
  if (pathname === "/interviewer" || pathname.startsWith("/interviewer/")) {
    return ["INTERVIEWER"];
  }
  if (pathname === "/operations" || pathname.startsWith("/operations/")) {
    return ["OPERATIONS", "ADMIN"];
  }
  return null;
}

export function getPortalDisplayName(path: string): string {
  if (path.startsWith("/student")) return "Student Portal";
  if (path.startsWith("/interviewer")) return "Interviewer Portal";
  if (path.startsWith("/operations")) return "Operations Portal";
  return "Home";
}

const PORTAL_ROOT_PATHS = new Set([
  "/student",
  "/interviewer",
  "/operations",
]);

function normalizeRoutePath(path: string): string {
  const withoutQuery = path.split("?")[0]?.split("#")[0] ?? "/";
  if (withoutQuery.length > 1 && withoutQuery.endsWith("/")) {
    return withoutQuery.slice(0, -1);
  }
  return withoutQuery || "/";
}

/**
 * Resolves the single active navigation href for a given pathname.
 * Prefers an exact route match over nested prefix matches, and picks the
 * longest segment-bounded non-root prefix when on a nested detail route
 * (e.g. /student/interviews/book matches ONLY Book Interview, while
 * /student/interviews/<id> matches My Interviews).
 */
export function resolveActiveNavHref(
  pathname: string,
  items: ReadonlyArray<{ href: string }>
): string | null {
  const current = normalizeRoutePath(pathname);

  for (const item of items) {
    if (normalizeRoutePath(item.href) === current) {
      return item.href;
    }
  }

  let bestHref: string | null = null;
  let bestLength = -1;

  for (const item of items) {
    const normalizedHref = normalizeRoutePath(item.href);
    if (PORTAL_ROOT_PATHS.has(normalizedHref) || normalizedHref === "/") {
      continue;
    }
    if (
      current.startsWith(`${normalizedHref}/`) &&
      normalizedHref.length > bestLength
    ) {
      bestHref = item.href;
      bestLength = normalizedHref.length;
    }
  }

  return bestHref;
}

export function sanitizeNextPath(
  nextParam: string | null | undefined
): string | null {
  if (!nextParam) return null;
  const trimmed = nextParam.trim();
  if (!trimmed.startsWith("/") || trimmed.startsWith("//")) return null;
  const pathname = trimmed.split("?")[0]?.split("#")[0] ?? "/";
  if (
    pathname === "/login" ||
    pathname === "/signup" ||
    pathname === "/auth/callback" ||
    pathname === "/staff-access"
  ) {
    return null;
  }
  return trimmed;
}

export interface PortalRedirectDecision {
  target: string;
  reason:
    | "unauthenticated"
    | "unauthorized_role"
    | "authenticated_auth_page";
  toastTitle?: string;
  toastDescription?: string;
}

export function resolvePortalRedirect(params: {
  pathname: string;
  search?: string;
  nextParam?: string | null;
  profile: Pick<UserProfile, "roles"> | null;
  loading: boolean;
}): PortalRedirectDecision | null {
  const { pathname, search = "", nextParam, profile, loading } = params;
  if (loading) return null;

  const requiredRoles = getRequiredRolesForPath(pathname);
  if (requiredRoles) {
    if (!profile) {
      const fullPath = `${pathname}${search ? (search.startsWith("?") ? search : `?${search}`) : ""}`;
      return {
        target: `/login?next=${encodeURIComponent(fullPath)}`,
        reason: "unauthenticated",
      };
    }

    if (!hasAllowedRole(profile.roles, requiredRoles)) {
      const fallback = resolveDefaultPortalPath(profile.roles);
      const portalName = getPortalDisplayName(fallback);
      return {
        target: fallback,
        reason: "unauthorized_role",
        toastTitle: "Redirected to your portal",
        toastDescription: `Your account does not have access to ${getPortalDisplayName(pathname)}. Opened ${portalName}.`,
      };
    }

    return null;
  }

  if (pathname === "/staff-access" && profile) {
    if (hasAllowedRole(profile.roles, ["OPERATIONS", "ADMIN"])) {
      return {
        target: "/operations",
        reason: "authenticated_auth_page",
      };
    }
    const fallback = resolveDefaultPortalPath(profile.roles);
    return {
      target: fallback,
      reason: "unauthorized_role",
      toastTitle: "Staff access restricted",
      toastDescription: `Signed-in account does not hold Operations permissions. Opened ${getPortalDisplayName(fallback)}.`,
    };
  }

  if ((pathname === "/login" || pathname === "/signup") && profile) {
    const safeNext = sanitizeNextPath(nextParam);
    if (safeNext) {
      const nextPathname = safeNext.split("?")[0] ?? safeNext;
      const nextRequired = getRequiredRolesForPath(nextPathname);
      if (!nextRequired || hasAllowedRole(profile.roles, nextRequired)) {
        return {
          target: safeNext,
          reason: "authenticated_auth_page",
        };
      }
      const fallback = resolveDefaultPortalPath(profile.roles);
      return {
        target: fallback,
        reason: "unauthorized_role",
        toastTitle: "Redirected to your portal",
        toastDescription: `Opened ${getPortalDisplayName(fallback)} based on your account role.`,
      };
    }

    return {
      target: resolveDefaultPortalPath(profile.roles),
      reason: "authenticated_auth_page",
    };
  }

  return null;
}

export type AuthCallbackParsed =
  | {
      kind: "error";
      errorCode: string | null;
      message: string;
      expired: boolean;
      nextPath: string | null;
    }
  | {
      kind: "code";
      code: string;
      nextPath: string | null;
    }
  | {
      kind: "token_hash";
      tokenHash: string;
      otpType: string;
      nextPath: string | null;
    }
  | {
      kind: "session_tokens";
      accessToken: string;
      refreshToken: string;
      nextPath: string | null;
    }
  | {
      kind: "empty";
      nextPath: string | null;
    };

export function parseAuthCallbackParams(
  searchString: string,
  hashString = ""
): AuthCallbackParsed {
  const search = new URLSearchParams(
    searchString.startsWith("?") ? searchString.slice(1) : searchString
  );
  const hash = new URLSearchParams(
    hashString.startsWith("#") ? hashString.slice(1) : hashString
  );

  const nextPath = sanitizeNextPath(
    search.get("next") || hash.get("next")
  );

  const errorCode =
    search.get("error_code") ||
    hash.get("error_code") ||
    search.get("error") ||
    hash.get("error");
  const errorDescription =
    search.get("error_description") || hash.get("error_description");

  if (errorCode || errorDescription) {
    const rawMsg = (errorDescription || errorCode || "Verification failed").replace(
      /\+/g,
      " "
    );
    const lower = `${errorCode ?? ""} ${rawMsg}`.toLowerCase();
    const expired =
      lower.includes("expired") || lower.includes("otp_expired");
    return {
      kind: "error",
      errorCode,
      message: rawMsg,
      expired,
      nextPath,
    };
  }

  const code = search.get("code");
  if (code) {
    return { kind: "code", code, nextPath };
  }

  const tokenHash = search.get("token_hash") || hash.get("token_hash");
  const otpType = search.get("type") || hash.get("type");
  if (tokenHash && otpType) {
    return { kind: "token_hash", tokenHash, otpType, nextPath };
  }

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    return {
      kind: "session_tokens",
      accessToken,
      refreshToken,
      nextPath,
    };
  }

  return { kind: "empty", nextPath };
}

export function isInterviewUpcoming(interview: InterviewRecord, now = new Date()): boolean {
  const activeStatuses: BookingStatus[] = [
    "BOOKED",
    "RESCHEDULE_PENDING",
    "IN_PROGRESS",
    "AWAITING_OUTCOME",
  ];
  if (!activeStatuses.includes(interview.status)) return false;
  return new Date(interview.ends_at) >= now || interview.status === "IN_PROGRESS" || interview.status === "AWAITING_OUTCOME";
}

export function isSameLocalCalendarDate(isoString: string, reference = new Date()): boolean {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return false;
  return (
    date.getFullYear() === reference.getFullYear() &&
    date.getMonth() === reference.getMonth() &&
    date.getDate() === reference.getDate()
  );
}

export function validateMalpracticeReportForm(input: {
  studentId: string;
  badgeId: string;
  reasonCode: string;
  description: string;
  evidenceReference: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!isValidUuid(input.studentId)) {
    errors.studentId = "Select or enter a valid Student UUID.";
  }
  if (!isValidUuid(input.badgeId)) {
    errors.badgeId = "Select or enter a valid Badge UUID.";
  }
  const code = input.reasonCode.trim();
  if (!code || code.length > 64) {
    errors.reasonCode = "Reason code must be between 1 and 64 characters.";
  }
  const desc = input.description.trim();
  if (!desc || desc.length > 5000) {
    errors.description = "Description is required (max 5000 characters).";
  }
  if (input.evidenceReference.trim().length > 500) {
    errors.evidenceReference = "Evidence reference cannot exceed 500 characters.";
  }
  return errors;
}

export function validateReinstateForm(input: { reason: string }): Record<string, string> {
  const errors: Record<string, string> = {};
  const trimmed = input.reason.trim();
  if (!trimmed || trimmed.length > 5000) {
    errors.reason = "A justification reason is required (max 5000 characters).";
  }
  return errors;
}

export function generateUuid(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

export function validateSignupForm(input: {
  fullName: string;
  email: string;
  password: string;
  confirmPassword: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  if (input.fullName.trim().length < 2) {
    errors.fullName = "Enter your full name (at least 2 characters).";
  }
  const email = input.email.trim();
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Enter a valid email address.";
  }
  if (input.password.length < 8) {
    errors.password = "Password must be at least 8 characters.";
  } else if (!/[A-Za-z]/.test(input.password) || !/\d/.test(input.password)) {
    errors.password = "Password must include at least one letter and one number.";
  }
  if (input.confirmPassword !== input.password) {
    errors.confirmPassword = "Passwords do not match.";
  }
  return errors;
}

export function canStudentModifyBooking(
  interview: Pick<InterviewRecord, "status" | "starts_at">,
  now = new Date(),
  cutoffMinutes = 120
): { allowed: boolean; reason: string | null } {
  if (interview.status !== "BOOKED" && interview.status !== "RESCHEDULE_PENDING") {
    return {
      allowed: false,
      reason: `Bookings in "${interview.status}" status cannot be modified.`,
    };
  }
  const startsMs = Date.parse(interview.starts_at);
  if (Number.isNaN(startsMs)) {
    return { allowed: false, reason: "Invalid interview start timestamp." };
  }
  const minutesUntilStart = (startsMs - now.getTime()) / 60_000;
  if (minutesUntilStart < cutoffMinutes) {
    return {
      allowed: false,
      reason: "Changes are locked within 2 hours of the scheduled start time.",
    };
  }
  return { allowed: true, reason: null };
}

export function validateBookingReasonForm(input: {
  reason: string;
}): Record<string, string> {
  const errors: Record<string, string> = {};
  const trimmed = input.reason.trim();
  if (trimmed.length < 5) {
    errors.reason = "Provide a brief reason (at least 5 characters).";
  } else if (trimmed.length > 1000) {
    errors.reason = "Reason cannot exceed 1000 characters.";
  }
  return errors;
}

export function getInvitationStatusMeta(status: InvitationStatus): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "PENDING":
      return { label: "Pending", tone: "info" };
    case "ACCEPTED":
      return { label: "Accepted", tone: "success" };
    case "REVOKED":
      return { label: "Revoked", tone: "error" };
    case "EXPIRED":
      return { label: "Expired", tone: "neutral" };
  }
}

export function getAttendanceStatusMeta(status: AttendanceStatus): {
  label: string;
  tone: StatusTone;
} {
  switch (status) {
    case "ATTENDED":
      return { label: "Attended", tone: "success" };
    case "LATE":
      return { label: "Late", tone: "warning" };
    case "NO_SHOW":
      return { label: "No show", tone: "error" };
  }
}

export function getInterviewerLifecycleActions(status: BookingStatus): {
  canStart: boolean;
  canMarkAwaitingOutcome: boolean;
  canRecordAttendance: boolean;
  canSubmitEvaluation: boolean;
} {
  return {
    canStart: status === "BOOKED",
    canMarkAwaitingOutcome: status === "IN_PROGRESS",
    canRecordAttendance:
      status === "BOOKED" ||
      status === "IN_PROGRESS" ||
      status === "AWAITING_OUTCOME",
    canSubmitEvaluation:
      status === "IN_PROGRESS" || status === "AWAITING_OUTCOME",
  };
}

export function groupBookableSlotsByDate(
  slots: BookableSlot[],
  timezone: string
): Array<{ dateKey: string; dateLabel: string; slots: BookableSlot[] }> {
  const groups = new Map<string, { dateLabel: string; slots: BookableSlot[] }>();
  for (const slot of slots) {
    const dt = new Date(slot.startsAt);
    let dateKey = slot.startsAt.slice(0, 10);
    let dateLabel = dateKey;
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone || undefined,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(dt);
      dateKey = parts;
      dateLabel = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || undefined,
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(dt);
    } catch {
      // Fallback to ISO date slice
    }

    const existing = groups.get(dateKey);
    if (existing) {
      existing.slots.push(slot);
    } else {
      groups.set(dateKey, { dateLabel, slots: [slot] });
    }
  }

  return Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([dateKey, value]) => ({
      dateKey,
      dateLabel: value.dateLabel,
      slots: value.slots,
    }));
}


