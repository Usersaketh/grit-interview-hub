import { createHash, randomBytes } from "node:crypto";
import { AppError } from "@backend/lib/errors";

export type CreateInvitationInput = {
  email: string;
  fullName?: string;
  defaultTimezone: string;
  title?: string;
  expertiseTags: string[];
  expiresInDays: number;
  idempotencyKey: string;
};

export type EmailDeliveryResult = {
  status: "sent" | "not_configured" | "failed";
  provider: "supabase_auth" | "none";
  recipient: string;
  deliveryKind?: "invite" | "magiclink_existing_user";
  error?: string;
};

export type CreateInvitationOptions = {
  inviterName?: string | null;
  adminDb?: any;
  otpClient?: any;
};

export type RevokeInvitationInput = {
  reason?: string;
  idempotencyKey: string;
};

export type AcceptInvitationInput = {
  invitationId: string;
  fullName?: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashInvitationToken(rawToken: string): string {
  return createHash("sha256").update(rawToken.trim()).digest("hex");
}

export function buildInvitationRedirectUrl(
  invitationId: string,
  originUrl?: string
): string {
  const nextPath = `/invitations/accept?invitationId=${encodeURIComponent(invitationId)}`;
  const callbackPath = `/auth/callback?next=${encodeURIComponent(nextPath)}`;
  if (originUrl && originUrl.trim()) {
    return `${originUrl.trim().replace(/\/$/, "")}${callbackPath}`;
  }
  return callbackPath;
}

function isAlreadyRegisteredAuthError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already") ||
    lower.includes("registered") ||
    lower.includes("exists") ||
    lower.includes("email_exists") ||
    lower.includes("user_already_exists")
  );
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
    return new AppError("INVITATION_NOT_FOUND", 404, "Invitation not found");
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

async function dispatchSupabaseAuthInvitation(params: {
  adminDb?: any;
  otpClient?: any;
  recipientEmail: string;
  redirectTo: string;
  invitationId: string;
  fullName?: string | null;
  inviterName?: string | null;
  title?: string | null;
  defaultTimezone: string;
  expertiseTags: string[];
}): Promise<EmailDeliveryResult> {
  const { adminDb, otpClient, recipientEmail, redirectTo } = params;

  if (!adminDb?.auth?.admin?.inviteUserByEmail) {
    return {
      status: "not_configured",
      provider: "none",
      recipient: recipientEmail,
      error:
        "SUPABASE_SERVICE_ROLE_KEY is required on the server to send Supabase Auth invitation emails.",
    };
  }

  const metadata = {
    full_name: params.fullName?.trim() || null,
    title: params.title?.trim() || null,
    default_timezone: params.defaultTimezone,
    expertise_tags: params.expertiseTags,
    expertise_tags_text: params.expertiseTags.join(", "),
    invited_by_name: params.inviterName?.trim() || null,
    invitation_id: params.invitationId,
  };

  try {
    const { error: inviteError } = await adminDb.auth.admin.inviteUserByEmail(
      recipientEmail,
      {
        redirectTo,
        data: metadata,
      }
    );

    if (!inviteError) {
      return {
        status: "sent",
        provider: "supabase_auth",
        recipient: recipientEmail,
        deliveryKind: "invite",
      };
    }

    if (isAlreadyRegisteredAuthError(inviteError.message ?? "")) {
      const otpAuth = otpClient?.auth?.signInWithOtp ? otpClient : adminDb;
      const { error: otpError } = await otpAuth.auth.signInWithOtp({
        email: recipientEmail,
        options: {
          emailRedirectTo: redirectTo,
          shouldCreateUser: false,
        },
      });

      if (!otpError) {
        return {
          status: "sent",
          provider: "supabase_auth",
          recipient: recipientEmail,
          deliveryKind: "magiclink_existing_user",
        };
      }

      return {
        status: "failed",
        provider: "supabase_auth",
        recipient: recipientEmail,
        deliveryKind: "magiclink_existing_user",
        error: otpError.message || "Could not dispatch Supabase Auth invitation link to existing user.",
      };
    }

    return {
      status: "failed",
      provider: "supabase_auth",
      recipient: recipientEmail,
      deliveryKind: "invite",
      error: inviteError.message || "Supabase Auth could not send invitation email.",
    };
  } catch (err) {
    return {
      status: "failed",
      provider: "supabase_auth",
      recipient: recipientEmail,
      deliveryKind: "invite",
      error: err instanceof Error ? err.message : "Unexpected Supabase Auth invitation error.",
    };
  }
}

export async function createInterviewerInvitation(
  db: any,
  input: CreateInvitationInput,
  originUrl?: string,
  options: CreateInvitationOptions = {}
) {
  const internalTokenHash = hashInvitationToken(generateInvitationToken());
  const expiresAt = new Date(
    Date.now() + input.expiresInDays * 24 * 60 * 60 * 1000
  ).toISOString();
  const normalizedEmail = input.email.trim().toLowerCase();

  const { data, error } = await db.rpc("create_interviewer_invitation", {
    p_email: normalizedEmail,
    p_full_name: input.fullName?.trim() ?? null,
    p_default_timezone: input.defaultTimezone.trim(),
    p_title: input.title?.trim() ?? null,
    p_expertise_tags: input.expertiseTags,
    p_token_hash: internalTokenHash,
    p_expires_at: expiresAt,
    p_idempotency_key: input.idempotencyKey,
  });

  if (error) {
    throw mapInvitationRpcError(error);
  }

  // On an idempotency replay, Postgres returns the existing invitation row whose token_hash
  // differs from the freshly generated hash, preventing duplicate email delivery.
  const isFreshCreation =
    !data?.token_hash || data.token_hash === internalTokenHash;

  let emailDelivery: EmailDeliveryResult | null = null;
  if (isFreshCreation && data?.id) {
    const redirectTo = buildInvitationRedirectUrl(data.id, originUrl);
    emailDelivery = await dispatchSupabaseAuthInvitation({
      adminDb: options.adminDb,
      otpClient: options.otpClient,
      recipientEmail: normalizedEmail,
      redirectTo,
      invitationId: data.id,
      fullName: input.fullName?.trim() ?? data?.full_name ?? null,
      inviterName: options.inviterName ?? null,
      title: input.title?.trim() ?? data?.title ?? null,
      defaultTimezone: input.defaultTimezone.trim(),
      expertiseTags: input.expertiseTags,
    });
  }

  return {
    invitation: data,
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

export async function verifyInvitationForSession(
  userDb: any,
  adminDb: any,
  invitationId: string
) {
  if (!invitationId || !UUID_REGEX.test(invitationId.trim())) {
    throw new AppError("VALIDATION_ERROR", 422, "Valid invitation ID is required");
  }

  const {
    data: { user: currentUser },
  } = await userDb.auth.getUser();

  if (!currentUser?.email) {
    throw new AppError(
      "UNAUTHENTICATED",
      401,
      "Open the invitation link from your email or sign in with your invited email address."
    );
  }

  const { data: inv, error } = await adminDb
    .from("interviewer_invitations")
    .select(
      "id, email, full_name, default_timezone, title, expertise_tags, invited_role, status, expires_at"
    )
    .eq("id", invitationId.trim())
    .maybeSingle();

  if (error) {
    throw new AppError("INVITATION_LOOKUP_FAILED", 500, "Could not verify invitation");
  }
  if (!inv) {
    throw new AppError("INVITATION_NOT_FOUND", 404, "Invitation not found or invalid");
  }

  const currentEmail = String(currentUser.email).trim().toLowerCase();
  const invitedEmail = String(inv.email).trim().toLowerCase();
  if (currentEmail !== invitedEmail) {
    throw new AppError(
      "INVITATION_EMAIL_MISMATCH",
      403,
      `Signed in as ${currentEmail}, which does not match this invitation's email address.`
    );
  }

  const isExpired =
    inv.status === "EXPIRED" ||
    (inv.status === "PENDING" && new Date(inv.expires_at) <= new Date());
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

export async function acceptInterviewerInvitationForSession(
  userDb: any,
  adminDb: any,
  input: AcceptInvitationInput
) {
  const {
    data: { user: currentUser },
  } = await userDb.auth.getUser();

  if (!currentUser?.email) {
    throw new AppError(
      "UNAUTHENTICATED",
      401,
      "Sign in or open your Supabase Auth invitation email link before accepting."
    );
  }

  const { data: inv, error: invError } = await adminDb
    .from("interviewer_invitations")
    .select("id, email, full_name, default_timezone, title, status, expires_at")
    .eq("id", input.invitationId)
    .maybeSingle();

  if (invError) {
    throw new AppError("INVITATION_LOOKUP_FAILED", 500, "Could not look up invitation");
  }
  if (!inv) {
    throw new AppError("INVITATION_NOT_FOUND", 404, "Invitation not found");
  }

  const currentEmail = String(currentUser.email).trim().toLowerCase();
  const invitedEmail = String(inv.email).trim().toLowerCase();
  if (currentEmail !== invitedEmail) {
    throw new AppError(
      "INVITATION_EMAIL_MISMATCH",
      403,
      `Signed in as ${currentEmail}, which does not match this invitation's email address.`
    );
  }

  if (inv.status === "REVOKED") {
    throw new AppError("INVITATION_REVOKED", 409, "This invitation has been revoked");
  }
  if (inv.status === "ACCEPTED") {
    throw new AppError(
      "INVITATION_ALREADY_ACCEPTED",
      409,
      "This invitation has already been accepted"
    );
  }
  if (inv.status === "EXPIRED" || new Date(inv.expires_at) <= new Date()) {
    await adminDb
      .from("interviewer_invitations")
      .update({ status: "EXPIRED", updated_at: new Date().toISOString() })
      .eq("id", inv.id);
    throw new AppError("INVITATION_EXPIRED", 409, "This invitation has expired");
  }

  const { data: interviewer, error: rpcError } = await userDb.rpc(
    "accept_interviewer_invitation_by_id",
    {
      p_invitation_id: input.invitationId,
      p_full_name: input.fullName?.trim() ?? null,
    }
  );

  if (rpcError) throw mapInvitationRpcError(rpcError);

  return {
    interviewer,
    email: invitedEmail,
    role: "INTERVIEWER" as const,
    signedIn: true,
  };
}
