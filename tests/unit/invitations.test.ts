import { describe, expect, it, vi } from "vitest";
import {
  acceptInterviewerInvitationForSession,
  createInterviewerInvitation,
  generateInvitationToken,
  hashInvitationToken,
  mapInvitationRpcError,
  revokeInterviewerInvitation,
  verifyInvitationForSession,
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
    expect(
      mapInvitationRpcError({ message: "invitation_already_accepted" })
    ).toMatchObject({
      status: 409,
      code: "INVITATION_ALREADY_ACCEPTED",
    });
    expect(
      mapInvitationRpcError({ message: "invitation_email_mismatch" })
    ).toMatchObject({
      status: 403,
      code: "INVITATION_EMAIL_MISMATCH",
    });
    expect(mapInvitationRpcError({ message: "staff_role_required" })).toMatchObject({
      status: 403,
      code: "FORBIDDEN",
    });
    expect(
      mapInvitationRpcError({ message: "pending_invitation_exists" })
    ).toMatchObject({
      status: 409,
      code: "PENDING_INVITATION_EXISTS",
    });
  });

  it("normalizes email and forwards expertise tags when creating an invitation", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "new.interviewer@example.com",
        status: "PENDING",
      },
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
    const callArgs = rpc.mock.calls[0][1];
    expect(callArgs.p_email).toBe("new.interviewer@example.com");
    expect(callArgs.p_expertise_tags).toEqual(["system-design", "backend"]);
    expect(callArgs.p_token_hash).toHaveLength(64);
  });

  it("revokes invitation via RPC", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "inv-1", status: "REVOKED" },
      error: null,
    });
    const res = await revokeInterviewerInvitation(
      { rpc },
      "inv-1",
      {
        reason: "Role filled",
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
      }
    );
    expect(res.status).toBe("REVOKED");
    expect(rpc).toHaveBeenCalledWith("revoke_interviewer_invitation", {
      p_invitation_id: "inv-1",
      p_reason: "Role filled",
      p_idempotency_key: "22222222-2222-4222-8222-222222222222",
    });
  });

  it("verifyInvitationForSession requires authenticated session and marks overdue pending invitations EXPIRED", async () => {
    const updateEq = vi.fn().mockResolvedValue({ error: null });
    const update = vi.fn().mockReturnValue({ eq: updateEq });
    const maybeSingle = vi.fn().mockResolvedValue({
      data: {
        id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
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

    const userDb = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u-exp", email: "expired@example.com" } },
        }),
      },
    };

    const info = await verifyInvitationForSession(
      userDb,
      adminDb,
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
    expect(info.status).toBe("EXPIRED");
    expect(info.invitedRole).toBe("INTERVIEWER");
    expect(update).toHaveBeenCalled();
  });

  it("rejects verification and acceptance when unauthenticated or email mismatches", async () => {
    const adminDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
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

    const unauthDb = {
      auth: { getUser: vi.fn().mockResolvedValue({ data: { user: null } }) },
    };

    await expect(
      verifyInvitationForSession(
        unauthDb,
        adminDb,
        "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
      )
    ).rejects.toMatchObject({ status: 401, code: "UNAUTHENTICATED" });

    const mismatchUserDb = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u-other", email: "other@example.com" } },
        }),
      },
    };

    await expect(
      acceptInterviewerInvitationForSession(mismatchUserDb, adminDb, {
        invitationId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
      })
    ).rejects.toMatchObject({ status: 403, code: "INVITATION_EMAIL_MISMATCH" });
  });

  it("accepts verified invitation session and invokes accept_interviewer_invitation_by_id RPC", async () => {
    const adminDb = {
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({
              data: {
                id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
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
      }),
    };

    const rpc = vi.fn().mockResolvedValue({
      data: { id: "interviewer-row-1", default_timezone: "Asia/Kolkata" },
      error: null,
    });
    const userDb = {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "u-fresh", email: "fresh@example.com" } },
        }),
      },
      rpc,
    };

    const res = await acceptInterviewerInvitationForSession(userDb, adminDb, {
      invitationId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      fullName: "Fresh Assessor",
    });

    expect(res.role).toBe("INTERVIEWER");
    expect(res.signedIn).toBe(true);
    expect(rpc).toHaveBeenCalledWith("accept_interviewer_invitation_by_id", {
      p_invitation_id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      p_full_name: "Fresh Assessor",
    });
  });
});
