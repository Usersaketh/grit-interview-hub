import { describe, expect, it, vi } from "vitest";
import { sendInterviewerInvitationEmail } from "@backend/lib/email/mailer";
import { buildInterviewerInvitationEmail } from "@backend/lib/email/templates";
import { createInterviewerInvitation } from "@backend/modules/invitations/service";

describe("transactional invitation email delivery", () => {
  it("builds HTML and plain-text invitation emails with role, link, and safe HTML escaping", () => {
    const rendered = buildInterviewerInvitationEmail({
      recipientEmail: "assessor@institution.edu",
      recipientName: "Dr. Kavya <Staff>",
      inviterName: "Operations Lead",
      title: "Senior Architect",
      defaultTimezone: "Asia/Kolkata",
      expertiseTags: ["Distributed Systems", "PostgreSQL"],
      expiresAt: "2026-12-01T10:00:00Z",
      inviteUrl: "https://gritinterviewhub.vercel.app/invitations/accept?token=abc_123",
    });

    expect(rendered.subject).toContain("Interviewer");
    expect(rendered.html).toContain("Dr. Kavya &lt;Staff&gt;");
    expect(rendered.html).toContain(
      "https://gritinterviewhub.vercel.app/invitations/accept?token=abc_123"
    );
    expect(rendered.html).toContain("INTERVIEWER");
    expect(rendered.html).toContain("Distributed Systems, PostgreSQL");
    expect(rendered.text).toContain("Operations Lead");
    expect(rendered.text).toContain(
      "https://gritinterviewhub.vercel.app/invitations/accept?token=abc_123"
    );
  });

  it("reports not_configured cleanly without claiming email was sent when provider env vars are missing", async () => {
    const result = await sendInterviewerInvitationEmail(
      {
        recipientEmail: "assessor@institution.edu",
        defaultTimezone: "UTC",
        expertiseTags: [],
        expiresAt: "2026-12-01T10:00:00Z",
        inviteUrl: "http://localhost:3000/invitations/accept?token=tok123",
      },
      { env: {} }
    );

    expect(result.status).toBe("not_configured");
    expect(result.provider).toBe("none");
    expect(result.recipient).toBe("assessor@institution.edu");
    expect(result.error).toContain("EMAIL_PROVIDER_API_KEY");
  });

  it("sends email via Resend when EMAIL_PROVIDER_API_KEY and EMAIL_FROM are set", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: vi.fn().mockResolvedValue({ id: "email_msg_42" }),
    });

    const result = await sendInterviewerInvitationEmail(
      {
        recipientEmail: "assessor@institution.edu",
        recipientName: "Kavya Nair",
        defaultTimezone: "Asia/Kolkata",
        expertiseTags: ["TypeScript"],
        expiresAt: "2026-12-01T10:00:00Z",
        inviteUrl: "https://gritinterviewhub.vercel.app/invitations/accept?token=xyz",
      },
      {
        env: {
          EMAIL_PROVIDER_API_KEY: "re_test_key",
          EMAIL_FROM: "GRIT Interview Hub <noreply@grit.example>",
        },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }
    );

    expect(result).toEqual({
      status: "sent",
      provider: "resend",
      recipient: "assessor@institution.edu",
      messageId: "email_msg_42",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.resend.com/emails");
    const parsedBody = JSON.parse(String(init.body));
    expect(parsedBody.to).toEqual(["assessor@institution.edu"]);
    expect(parsedBody.from).toBe("GRIT Interview Hub <noreply@grit.example>");
  });

  it("returns failed status gracefully without throwing when provider responds with an error", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: vi.fn().mockResolvedValue({ message: "Domain not verified" }),
    });

    const result = await sendInterviewerInvitationEmail(
      {
        recipientEmail: "assessor@institution.edu",
        defaultTimezone: "UTC",
        expertiseTags: [],
        expiresAt: "2026-12-01T10:00:00Z",
        inviteUrl: "https://gritinterviewhub.vercel.app/invitations/accept?token=xyz",
      },
      {
        env: {
          EMAIL_PROVIDER_API_KEY: "re_test_key",
          EMAIL_FROM: "noreply@grit.example",
        },
        fetchImpl: fetchMock as unknown as typeof fetch,
      }
    );

    expect(result.status).toBe("failed");
    expect(result.provider).toBe("resend");
    expect(result.error).toContain("Domain not verified");
  });

  it("never sends a duplicate email or fabricates a token URL on idempotency replay", async () => {
    const sendMock = vi.fn();
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
        idempotencyKey: "11111111-1111-4111-8111-111111111111",
      },
      "https://gritinterviewhub.vercel.app",
      {
        inviterName: "Ops Staff",
        sendEmail: sendMock,
      }
    );

    expect(result.tokenIssued).toBe(false);
    expect(result.inviteUrl).toBeNull();
    expect(result.emailDelivery).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
