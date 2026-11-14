import { createHash, randomBytes } from "node:crypto";
import { AppError } from "@backend/lib/errors";
import {
  sendInterviewerInvitationEmail,
  type EmailDeliveryResult,
} from "@backend/lib/email/mailer";

export type CreateInvitationInput = {
  email: string;
  fullName?: string;
  defaultTimezone: string;
  title?: string;
  expertiseTags: string[];
  expiresInDays: number;
  idempotencyKey: string;
};

export type CreateInvitationOptions = {
  inviterName?: string | null;
  sendEmail?: typeof sendInterviewerInvitationEmail;
};

export type RevokeInvitationInput = {
  reason?: string;
  idempotencyKey: string;
};

export type AcceptInvitationInput = {
  token: string;
  fullName?: string;
  password?: string;
};

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim()).digest("hex");
}

export function mapInvitationRpcError(error: { code?: string; message?: string }): AppError {
  const message = (error.message ?? "").toLowerCase();

  if (message.includes("unauthenticated")) {
    return new AppError("UNAUTHENTICATED", 401, "Authentication is required");
  }
  if (message.includes("staff_role_required")) {
    return new AppError("FORBIDDEN", 403, "Only operations or admin staff can manage interviewer invitations");
  }
  if (message.includes("invitation_email_mismatch")) {
    return new AppError(
      "INVITATION_EMAIL_MISMATCH",
      403,
      "This invitation was issued for a different email address"
    );
  }
  if (message.includes("invitation_not_found")) {
    return new AppError("INVITATION_NOT_FOUND", 404, "Invitation not found or invalid token");
  }
  if (message.includes("invitation_revoked")) {
    return new AppError("INVITATION_REVOKED", 409, "This invitation has been revoked");
  }
  if (message.includes("invitation_already_accepted")) {
    return new AppError("INVITATION_ALREADY_ACCEPTED", 409, "This invitation has already been used");
  }
  if (message.includes("invitation_expired")) {
    return new AppError("INVITATION_EXPIRED", 409, "This invitation has expired");
  }
  if (message.includes("invitation_not_pending")) {
    return new AppError("INVALID_INVITATION_STATE", 409, "Only pending invitations can be modified");
  }
  if (message.includes("pending_invitation_exists") || error.code === "23505") {
    return new AppError(
      "PENDING_INVITATION_EXISTS",
      409,
      "An active pending invitation already exists for this email"
    );
  }
  if (message.includes("idempotency_key_reused")) {
    return new AppError(
      "IDEMPOTENCY_KEY_REUSED",
      409,
      "This idempotency key was already used for a different invitation request"
    );
  }
  if (
    message.includes("invalid_email") ||
    message.includes("invalid_expiration") ||
    message.includes("invalid_idempotency_key") ||
    message.includes("invalid_invitation_token")
  ) {
    return new AppError("VALIDATION_ERROR", 422, "Invitation request contains invalid values");
  }

  return new AppError("INVITATION_FAILED", 400, "Invitation request could not be completed");
}

export async function createInterviewerInvitation(
  db: any,
  input: CreateInvitationInput,
  originUrl?: string,
  options: CreateInvitationOptions = {}
) {
  const rawToken = generateInvitationToken();
  const tokenHash = hashInvitationToken(rawToken);
  const expiresAt = new Date(Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000).toISOString();
  const normalizedEmail = input.email.trim().toLowerCase();

  const { data, error } = await db.rpc("create_interviewer_invitation", {
    p_email: normalizedEmail,
    p_full_name: input.fullName?.trim() ?? null,
    p_default_timezone: input.defaultTimezone.trim(),
    p_title: input.title?.trim() ?? null,
    p_expertise_tags: input.expertiseTags,
    p_token_hash: tokenHash,
    p_expires_at: expiresAt,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    throw mapInvitationRpcError(error);
  }

  // On an idempotency replay, Postgres returns the existing invitation row whose token_hash
  // corresponds to the original call rather than the freshly generated tokenHash.
  const isFreshCreation =
    !data?.token_hash || data.token_hash === tokenHash;

  const acceptPath = `/invitations/accept?token=${encodeURIComponent(rawToken)}`;
  const inviteUrl = isFreshCreation
    ? originUrl
      ? `${originUrl.replace(/\/$/, "")}${acceptPath}`
      : acceptPath
    : null;

  let emailDelivery: EmailDeliveryResult | null = null;
  if (isFreshCreation && inviteUrl) {
    const sendFn = options.sendEmail ?? sendInterviewerInvitationEmail;
    emailDelivery = await sendFn({
      recipientEmail: normalizedEmail,
      recipientName: input.fullName?.trim() ?? data?.full_name ?? null,
      inviterName: options.inviterName ?? null,
      title: input.title?.trim() ?? data?.title ?? null,
      defaultTimezone: input.defaultTimezone.trim(),
      expertiseTags: input.expertiseTags,
      expiresAt: data?.expires_at ?? expiresAt,
      inviteUrl,
    });
  }

  return {
    invitation: data,
    inviteUrl,
    tokenIssued: isFreshCreation,
    emailDelivery,
  };
}

export async function listInterviewerInvitations(db: any) {
  const { data, error } = await db.rpc("list_interviewer_invitations");
  if (error) throw mapInvitationRpcError(error);
  return data ?? [];
}

export async function revokeInterviewerInvitation(
  db: any,
  invitationId: string,
  input: RevokeInvitationInput
) {
  const { data, error } = await db.rpc("revoke_interviewer_invitation", {
    p_invitation_id: invitationId,
    p_reason: input.reason?.trim() ?? null,
    p_idempotency_key: input.idempotencyKey,
  });
  if (error) throw mapInvitationRpcError(error);
  return data;
}

export async function verifyInvitationToken(adminDb: any, rawToken: string) {
  if (!rawToken || rawToken.trim().length < 16) {
    throw new AppError("INVALID_INVITATION_TOKEN", 422, "Invitation token format is invalid");
  }

  const tokenHash = hashInvitationToken(rawToken);
  const { data: inv, error } = await adminDb
    .from("interviewer_invitations")
    .select("id, email, full_name, default_timezone, title, expertise_tags, invited_role, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (error) {
    throw new AppError("INVITATION_LOOKUP_FAILED", 500, "Could not verify invitation");
  }
  if (!inv) {
    throw new AppError("INVITATION_NOT_FOUND", 404, "Invitation not found or invalid");
  }

  const isExpired = inv.status === "EXPIRED" || (inv.status === "PENDING" && new Date(inv.expires_at) <= new Date());
  const effectiveStatus = isExpired ? "EXPIRED" : inv.status;

  if (effectiveStatus === "EXPIRED" && inv.status === "PENDING") {
    await adminDb
      .from("interviewer_invitations")
      .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
      .eq("id", inv.id);
  }

  return {
    id: inv.id,
    email: inv.email,
    fullName: inv.full_name,
    defaultTimezone: inv.default_timezone,
    title: inv.title,
    expertiseTags: inv.expertise_tags ?? [],
    invitedRole: inv.invited_role,
    status: effectiveStatus,
    expiresAt: inv.expires_at,
  };
}

export async function acceptInterviewerInvitation(
  userDb: any,
  adminDb: any,
  input: AcceptInvitationInput
) {
  const tokenHash = hashInvitationToken(input.token);

  const { data: inv, error: invError } = await adminDb
    .from("interviewer_invitations")
    .select("id, email, full_name, default_timezone, title, status, expires_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (invError) {
    throw new AppError("INVITATION_LOOKUP_FAILED", 500, "Could not look up invitation");
  }
  if (!inv) {
    throw new AppError("INVITATION_NOT_FOUND", 404, "Invitation not found or invalid token");
  }
  if (inv.status === "REVOKED") {
    throw new AppError("INVITATION_REVOKED", 409, "This invitation has been revoked");
  }
  if (inv.status === "ACCEPTED") {
    throw new AppError("INVITATION_ALREADY_ACCEPTED", 409, "This invitation has already been accepted");
  }
  if (inv.status === "EXPIRED" || new Date(inv.expires_at) <= new Date()) {
    await adminDb
      .from("interviewer_invitations")
      .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
      .eq("id", inv.id);
    throw new AppError("INVITATION_EXPIRED", 409, "This invitation has expired");
  }

  const invitedEmail = String(inv.email).trim().toLowerCase();
  const {
    data: { user: currentUser },
  } = await userDb.auth.getUser();

  if (currentUser) {
    const currentEmail = String(currentUser.email ?? "").trim().toLowerCase();
    if (currentEmail !== invitedEmail) {
      throw new AppError(
        "INVITATION_EMAIL_MISMATCH",
        403,
        `Signed in as ${currentEmail}, but this invitation belongs to ${invitedEmail}. Sign out first or switch accounts.`
      );
    }

    const { data: interviewer, error: rpcError } = await userDb.rpc("accept_interviewer_invitation", {
      p_token_hash: tokenHash,
      p_full_name: input.fullName?.trim() ?? null,
    });

    if (rpcError) throw mapInvitationRpcError(rpcError);

    return {
      interviewer,
      email: invitedEmail,
      role: "INTERVIEWER" as const,
      signedIn: true,
    };
  }

  // Unauthenticated acceptance path: verify no existing account first to never reset/take over passwords.
  const { data: existingProfile } = await adminDb
    .from("profiles")
    .select("id")
    .eq("email", invitedEmail)
    .maybeSingle();

  if (existingProfile) {
    throw new AppError(
      "ACCOUNT_EXISTS_SIGN_IN_REQUIRED",
      409,
      "An account already exists for this email. Sign in with your existing password to accept this invitation."
    );
  }

  if (!input.password) {
    throw new AppError(
      "PASSWORD_REQUIRED",
      422,
      "Create a password to set up your new interviewer account"
    );
  }

  const displayName =
    input.fullName?.trim() || inv.full_name || invitedEmail.split("@")[0];

  const { data: created, error: createError } = await adminDb.auth.admin.createUser({
    email: invitedEmail,
    password: input.password,
    email_confirm: true,
    app_metadata: { managed_provision: "true" },
    user_metadata: { full_name: displayName },
  });

  if (createError || !created?.user) {
    const msg = (createError?.message ?? "").toLowerCase();
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      throw new AppError(
        "ACCOUNT_EXISTS_SIGN_IN_REQUIRED",
        409,
        "An account already exists for this email. Sign in with your existing password to accept this invitation."
      );
    }
    throw new AppError("INVITATION_ACCEPT_FAILED", 400, createError?.message || "Failed to provision interviewer account");
  }

  const { error: signInError } = await userDb.auth.signInWithPassword({
    email: invitedEmail,
    password: input.password,
  });

  if (signInError) {
    throw new AppError(
      "SIGN_IN_FAILED",
      500,
      "Account was created, please sign in on the login page to complete invitation acceptance"
    );
  }

  const { data: interviewer, error: rpcError } = await userDb.rpc("accept_interviewer_invitation", {
    p_token_hash: tokenHash,
    p_full_name: displayName,
  });

  if (rpcError) throw mapInvitationRpcError(rpcError);

  return {
    interviewer,
    email: invitedEmail,
    role: "INTERVIEWER" as const,
    signedIn: true,
  };
}
