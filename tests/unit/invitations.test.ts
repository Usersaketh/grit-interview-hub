import { describe, expect, it, vi } from "vitest";
import {
  acceptInterviewerInvitation,
  createInterviewerInvitation,
  generateInvitationToken,
  hashInvitationToken,
  mapInvitationRpcError,
  revokeInterviewerInvitation,
  verifyInvitationToken,
} from "@backend/modules/invitations/service";

describe("interviewer invitations service", () => {
  it("generates high-entropy tokens and deterministic SHA-256 hashes", () => {
    const t1 = generateInvitationToken();
    const t2 = generateInvitationToken();
    expect(t1).not.toBe(t2);
    expect(t1.length).toBeGreaterThanOrEqual(32);

    const h1 = hashInvitationToken(t1);
    const h2 = hashInvitationToken(` ${t1} `);
    expect(h1).toBe(h2);
    expect(h1).toHaveLength(64);
  });

  it("maps invitation RPC error codes cleanly", () => {
    expect(mapInvitationRpcError({ message: "invitation_expired" })).toMatchObject({
      status: 409,
      code: "INVITATION_EXPIRED",
    });
    expect(mapInvitationRpcError({ message: "invitation_revoked" })).toMatchObject({
      status: 409,
      code: "INVITATION_REVOKED",
    });
    expect(mapInvitationRpcError({ message: "invitation_already_accepted" })).toMatchObject({
      status: 409,
      code: "INVITATION_ALREADY_ACCEPTED",
    });
    expect(mapInvitationRpcError({ message: "invitation_email_mismatch" })).toMatchObject({
      status: 403,
      code: "INVITATION_EMAIL_MISMATCH",
    });
    expect(mapInvitationRpcError({ message: "staff_role_required" })).toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(mapInvitationRpcError({ message: "pending_invitation_exists" })).toMatchObject({
      status: 409,
      code: "PENDING_INVITATION_EXISTS",
    });
  });

  it("stores only hashed token in RPC when creating an invitation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "inv-1", email: "new.interviewer@example.com", status: "PENDING" },
      error: null,
    });
    const result = await createInterviewerInvitation(
      { rpc },
      {
        email: "New.Interviewer@example.com",
        fullName: "Meera Nair",
        defaultTimezone: "Asia/Kolkata",
        title: "Staff Reviewer",
        expertiseTags: ["system-design", "backend"],
        expiresInDays: 7,
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      },
      "http://localhost:3000"
    );

    expect(result.tokenIssued).toBe(true);
    expect(result.inviteUrl).toContain("http://localhost:3000/invitations/accept?token=");
    const rawToken = decodeURIComponent(result.inviteUrl.split("token=")[1]);
    const callArgs = rpc.mock.calls[0][1];
    expect(callArgs.p_token_hash).toBe(hashInvitationToken(rawToken));
    expect(callArgs.p_email).toBe("new.interviewer@example.com");
  });

  it("revokes invitation via RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "inv-1", status: "REVOKED" },
      error: null,
    });
    const res = await revokeInterviewerInvitation(
      { rpc },
      "inv-1",
      { reason: "Role filled", idempotencyKey: "22222222-2222-4222-8222-222222222222" }
    );
    expect(res.status).toBe("REVOKED");
    expect(rpc).toHaveBeenCalledWith("revoke_interviewer_invitation", {
      p_invitation_id: "inv-1",
      p_reason: "Role filled",
      p_idempotency_key: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("verifyInvitationToken marks overdue pending invitations as EXPIRED", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "inv-expired",
        email: "expired@example.com",
        full_name: "Expired Candidate",
        default_timezone: "UTC",
        title: "Assessor",
        expertise_tags: ["dsa"],
        invited_role: "INTERVIEWER",
        status: "PENDING",
        expires_at: "2020-01-01T00:00:00Z",
      },
      error: null,
    });
    const eq = vi.fn().mockReturnValue({ maybeSingle });
    const select = vi.fn().mockReturnValue({ eq });
    const adminDb = {
      from: vi.fn().mockReturnValue({ select, update }),
    };

    const info = await verifyInvitationToken(adminDb, "a-very-valid-token-string-123456");
    expect(info.status).toBe("EXPIRED");
    expect(info.invitedRole).toBe("INTERVIEWER");
    expect(update).toHaveBeenCalled();
  });

  it("rejects authenticated acceptance when signed-in user email mismatches", async () => {
    const adminDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "inv-2",
                email: "invited@example.com",
                full_name: "Invited Person",
                default_timezone: "UTC",
                title: "Assessor",
                status: "PENDING",
                expires_at: "2099-01-01T00:00:00Z",
              },
              error: null,
            }),
          }),
        }),
      }),
    };

    const userDb = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u-other", email: "other@example.com" } },
        }),
      },
    };

    await expect(
      acceptInterviewerInvitation(userDb, adminDb, {
        token: "valid-token-string-123456",
      })
    ).rejects.toMatchObject({ status: 403, code: "INVITATION_EMAIL_MISMATCH" });
  });

  it("refuses unauthenticated password provisioning when profile already exists", async () => {
    let callCount = 0;
    const adminDb = {
      from: vi.fn().mockImplementation((table: string) => {
        callCount += 1;
        if (table === "interviewer_invitations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "inv-3",
                    email: "existing@example.com",
                    full_name: "Existing User",
                    default_timezone: "UTC",
                    title: "Assessor",
                    status: "PENDING",
                    expires_at: "2099-01-01T00:00:00Z",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: "profile-1" },
                error: null,
              }),
            }),
          }),
        };
      }),
    };

    const userDb = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      },
    };

    await expect(
      acceptInterviewerInvitation(userDb, adminDb, {
        token: "valid-token-string-123456",
        password: "NewPassword123",
      })
    ).rejects.toMatchObject({ status: 409, code: "ACCOUNT_EXISTS_SIGN_IN_REQUIRED" });
    expect(callCount).toBe(2);
  });

  it("provisions new interviewer account with managed_provision and role INTERVIEWER", async () => {
    const createUser = vi.fn().mockResolvedValue({
      data: { user: { id: "new-interviewer-uid", email: "fresh@example.com" } },
      error: null,
    });
    const adminDb = {
      from: vi.fn().mockImplementation((table: string) => {
        if (table === "interviewer_invitations") {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: "inv-4",
                    email: "fresh@example.com",
                    full_name: "Fresh Assessor",
                    default_timezone: "Asia/Kolkata",
                    title: "Principal Engineer",
                    status: "PENDING",
                    expires_at: "2099-01-01T00:00:00Z",
                  },
                  error: null,
                }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
            }),
          }),
        };
      }),
      auth: { admin: { createUser } },
    };

    const rpc = vi.fn().mockResolvedValue({
      data: { id: "interviewer-row-1", display_name: "Fresh Assessor" },
      error: null,
    });
    const signInWithPassword = vi.fn().mockResolvedValue({ error: null });
    const userDb = {
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
        signInWithPassword,
      },
      rpc,
    };

    const res = await acceptInterviewerInvitation(userDb, adminDb, {
      token: "fresh-valid-token-123456",
      fullName: "Fresh Assessor",
      password: "Password123",
    });

    expect(res.role).toBe("INTERVIEWER");
    expect(res.signedIn).toBe(true);
    expect(createUser).toHaveBeenCalledWith(
      expect.objectContaining({
        email: "fresh@example.com",
        email_confirm: true,
        app_metadata: { managed_provision: "true" },
      })
    );
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "fresh@example.com",
      password: "Password123",
    });
    expect(rpc).toHaveBeenCalledWith("accept_interviewer_invitation", {
      p_token_hash: hashInvitationToken("fresh-valid-token-123456"),
      p_full_name: "Fresh Assessor",
    });
  });
});
