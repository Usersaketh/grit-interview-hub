import { describe, expect, it, vi } from "vitest";
import {
  buildInvitationRedirectUrl,
  createInterviewerInvitation,
} from "@backend/modules/invitations/service";

describe("Supabase Auth interviewer invitation delivery", () => {
  it("builds production and local Supabase Auth callback redirect URLs targeting invitation acceptance", () => {
    const prod = buildInvitationRedirectUrl(
      "inv-uuid-1",
      "https://gritinterviewhub.vercel.app"
    );
    expect(prod).toBe(
      "https://gritinterviewhub.vercel.app/auth/callback?next=%2Finvitations%2Faccept%3FinvitationId%3Dinv-uuid-1"
    );

    const local = buildInvitationRedirectUrl("inv-uuid-2", "http://localhost:3000/");
    expect(local).toBe(
      "http://localhost:3000/auth/callback?next=%2Finvitations%2Faccept%3FinvitationId%3Dinv-uuid-2"
    );
  });

  it("dispatches inviteUserByEmail with redirectTo and assessor metadata when adminDb is configured", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        email: "assessor@institution.edu",
        full_name: "Dr. Kavya Nair",
        status: "PENDING",
      },
      error: null,
    });
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: { user: { id: "auth-user-1" } },
      error: null,
    });

    const result = await createInterviewerInvitation(
      { rpc },
      {
        email: "assessor@institution.edu",
        fullName: "Dr. Kavya Nair",
        defaultTimezone: "Asia/Kolkata",
        title: "Staff Reviewer",
        expertiseTags: ["Distributed Systems", "PostgreSQL"],
        expiresInDays: 7,
        idempotencyKey: "22222222-2222-4222-8222-222222222222",
      },
      "https://gritinterviewhub.vercel.app",
      {
        inviterName: "Operations Lead",
        adminDb: { auth: { admin: { inviteUserByEmail } } },
      }
    );

    expect(result.tokenIssued).toBe(true);
    expect(result.emailDelivery).toEqual({
      status: "sent",
      provider: "supabase_auth",
      recipient: "assessor@institution.edu",
      deliveryKind: "invite",
    });
    expect(inviteUserByEmail).toHaveBeenCalledWith(
      "assessor@institution.edu",
      {
        redirectTo:
          "https://gritinterviewhub.vercel.app/auth/callback?next=%2Finvitations%2Faccept%3FinvitationId%3D11111111-1111-4111-8111-111111111111",
        data: {
          full_name: "Dr. Kavya Nair",
          title: "Staff Reviewer",
          default_timezone: "Asia/Kolkata",
          expertise_tags: ["Distributed Systems", "PostgreSQL"],
          expertise_tags_text: "Distributed Systems, PostgreSQL",
          invited_by_name: "Operations Lead",
          invitation_id: "11111111-1111-4111-8111-111111111111",
        },
      }
    );
  });

  it("falls back to signInWithOtp for already-registered Auth users so existing users receive a verification link", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "33333333-3333-4333-8333-333333333333",
        email: "existing.user@institution.edu",
        status: "PENDING",
      },
      error: null,
    });
    const inviteUserByEmail = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "A user with this email address has already been registered" },
    });
    const signInWithOtp = vi.fn().mockResolvedValue({
      data: {},
      error: null,
    });

    const result = await createInterviewerInvitation(
      { rpc },
      {
        email: "existing.user@institution.edu",
        defaultTimezone: "UTC",
        expertiseTags: [],
        expiresInDays: 7,
        idempotencyKey: "44444444-4444-4444-8444-444444444444",
      },
      "http://localhost:3000",
      {
        adminDb: { auth: { admin: { inviteUserByEmail } } },
        otpClient: { auth: { signInWithOtp } },
      }
    );

    expect(result.emailDelivery).toEqual({
      status: "sent",
      provider: "supabase_auth",
      recipient: "existing.user@institution.edu",
      deliveryKind: "magiclink_existing_user",
    });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "existing.user@institution.edu",
      options: {
        emailRedirectTo:
          "http://localhost:3000/auth/callback?next=%2Finvitations%2Faccept%3FinvitationId%3D33333333-3333-4333-8333-333333333333",
        shouldCreateUser: false,
      },
    });
  });

  it("reports not_configured cleanly without throwing when adminDb is omitted", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "55555555-5555-4555-8555-555555555555",
        email: "assessor@institution.edu",
        status: "PENDING",
      },
      error: null,
    });

    const result = await createInterviewerInvitation(
      { rpc },
      {
        email: "assessor@institution.edu",
        defaultTimezone: "UTC",
        expertiseTags: [],
        expiresInDays: 7,
        idempotencyKey: "66666666-6666-4666-8666-666666666666",
      },
      "http://localhost:3000"
    );

    expect(result.emailDelivery?.status).toBe("not_configured");
    expect(result.emailDelivery?.provider).toBe("none");
  });

  it("never sends a duplicate Supabase Auth email on idempotency replay", async () => {
    const inviteUserByEmail = vi.fn();
    const rpc = vi.fn().mockResolvedValue({
      data: {
        id: "inv-existing",
        email: "assessor@institution.edu",
        status: "PENDING",
        token_hash: "original_first_request_hash_different_from_retry",
        expires_at: "2026-12-01T10:00:00Z",
      },
      error: null,
    });

    const result = await createInterviewerInvitation(
      { rpc },
      {
        email: "assessor@institution.edu",
        defaultTimezone: "UTC",
        expertiseTags: ["Systems"],
        expiresInDays: 7,
        idempotencyKey: "77777777-7777-4777-8777-777777777777",
      },
      "https://gritinterviewhub.vercel.app",
      {
        inviterName: "Ops Staff",
        adminDb: { auth: { admin: { inviteUserByEmail } } },
      }
    );

    expect(result.tokenIssued).toBe(false);
    expect(result.emailDelivery).toBeNull();
    expect(inviteUserByEmail).not.toHaveBeenCalled();
  });
});
