import { AppError } from "@backend/lib/errors";
import { signupSchema } from "@backend/validation/schemas";

export type StudentSignupResult = {
  userId: string;
  email: string;
  fullName: string;
  role: "STUDENT";
  requiresEmailVerification: boolean;
  sessionEstablished: boolean;
};

const FORBIDDEN_ROLE_KEYS = new Set([
  "role",
  "roles",
  "assignedRole",
  "assigned_role",
  "user_roles",
  "app_metadata",
  "isAdmin",
  "is_admin",
]);

/**
 * Explicitly rejects any client payload attempting to specify roles or privileged metadata.
 * This acts as an API-layer defense-in-depth guard alongside handle_new_auth_user() at the DB layer.
 */
export function assertNoPrivilegedSignupFields(rawBody: unknown): void {
  if (!rawBody || typeof rawBody !== "object" || Array.isArray(rawBody)) {
    return;
  }

  const record = rawBody as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_ROLE_KEYS.has(key)) {
      throw new AppError(
        "FORBIDDEN",
        403,
        "Public signup only provisions STUDENT accounts. Role selection is not allowed."
      );
    }
  }
}

export async function registerStudentAccount(
  db: any,
  rawBody: unknown,
  emailRedirectTo?: string
): Promise<StudentSignupResult> {
  assertNoPrivilegedSignupFields(rawBody);
  const input = signupSchema.parse(rawBody);

  const normalizedEmail = input.email.trim().toLowerCase();
  const fullName = input.fullName.trim();
  const campusRef = input.campusRef?.trim() || undefined;

  const { data, error } = await db.auth.signUp({
    email: normalizedEmail,
    password: input.password,
    options: {
      ...(emailRedirectTo ? { emailRedirectTo } : {}),
      data: {
        full_name: fullName,
        ...(campusRef ? { campus_ref: campusRef } : {}),
      },
    },
  });

  if (error) {
    const message = (error.message ?? "").toLowerCase();
    if (
      message.includes("already registered") ||
      message.includes("already exists") ||
      message.includes("user_already_exists")
    ) {
      throw new AppError(
        "EMAIL_ALREADY_REGISTERED",
        409,
        "An account with this email already exists. Please sign in instead."
      );
    }
    if (message.includes("rate limit") || message.includes("too many")) {
      throw new AppError(
        "RATE_LIMITED",
        429,
        "Too many signup attempts. Please wait before trying again."
      );
    }
    if (message.includes("password")) {
      throw new AppError("WEAK_PASSWORD", 422, error.message || "Password does not meet security requirements");
    }
    throw new AppError("SIGNUP_FAILED", 400, error.message || "Unable to complete student registration");
  }

  const user = data?.user;
  if (!user) {
    throw new AppError("SIGNUP_FAILED", 500, "Account creation did not return a user record");
  }

  // Supabase obfuscates duplicate emails when confirmations are enabled by returning identities = []
  if (Array.isArray(user.identities) && user.identities.length === 0) {
    throw new AppError(
      "EMAIL_ALREADY_REGISTERED",
      409,
      "An account with this email already exists. Please sign in or check your inbox."
    );
  }

  const sessionEstablished = Boolean(data?.session);

  if (sessionEstablished) {
    const { error: ensureError } = await db.rpc("ensure_student_profile");
    if (ensureError) {
      const msg = (ensureError.message ?? "").toLowerCase();
      if (msg.includes("privileged_account")) {
        throw new AppError(
          "FORBIDDEN",
          403,
          "Privileged accounts cannot self-register as students"
        );
      }
    }
  }

  return {
    userId: user.id,
    email: user.email ?? normalizedEmail,
    fullName,
    role: "STUDENT",
    requiresEmailVerification: !sessionEstablished,
    sessionEstablished,
  };
}
