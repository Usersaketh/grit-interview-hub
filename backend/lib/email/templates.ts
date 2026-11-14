function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function formatExpiryUtc(isoString: string): string {
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return isoString;
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date) + " UTC";
}

export interface InterviewerInvitationEmailInput {
  recipientEmail: string;
  recipientName?: string | null;
  inviterName?: string | null;
  title?: string | null;
  defaultTimezone: string;
  expertiseTags: string[];
  expiresAt: string;
  inviteUrl: string;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function buildInterviewerInvitationEmail(
  input: InterviewerInvitationEmailInput
): RenderedEmail {
  const safeRecipient = escapeHtml(
    input.recipientName?.trim() || input.recipientEmail.trim()
  );
  const safeEmail = escapeHtml(input.recipientEmail.trim());
  const safeInviter = input.inviterName?.trim()
    ? escapeHtml(input.inviterName.trim())
    : "GRIT Operations Team";
  const safeTitle = input.title?.trim() ? escapeHtml(input.title.trim()) : null;
  const safeTimezone = escapeHtml(input.defaultTimezone);
  const safeExpiry = escapeHtml(formatExpiryUtc(input.expiresAt));
  const safeUrl = escapeHtml(input.inviteUrl);
  const safeTags =
    input.expertiseTags.length > 0
      ? input.expertiseTags.map((tag) => escapeHtml(tag)).join(", ")
      : "General Technical Assessment";

  const subject = "Invitation to join GRIT Interview Hub as an Interviewer";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${subject}</title>
  </head>
  <body style="margin:0;padding:0;background-color:#050506;color:#f4f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:#050506;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background-color:#0b0b0e;border:1px solid #222229;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="padding:24px 28px;border-bottom:1px solid #1d1d24;">
                <span style="display:inline-block;font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#9fb0ff;">GRIT INTERVIEW HUB</span>
                <h1 style="margin:10px 0 0 0;font-size:21px;line-height:1.3;font-weight:600;color:#f4f4f6;">
                  You&apos;ve been invited as an Interviewer
                </h1>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 28px;font-size:14px;line-height:1.6;color:#c9cad1;">
                <p style="margin:0 0 16px 0;">Hello ${safeRecipient},</p>
                <p style="margin:0 0 18px 0;">
                  <strong style="color:#f4f4f6;">${safeInviter}</strong> has issued a single-use invitation for you to join <strong style="color:#f4f4f6;">GRIT Interview Hub</strong> as a technical assessor.
                </p>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:0 0 22px 0;background-color:#121216;border:1px solid #23232c;border-radius:8px;">
                  <tr>
                    <td style="padding:14px 16px;font-size:13px;line-height:1.55;">
                      <div style="margin-bottom:6px;"><span style="color:#8c8d98;">Invited email:</span> <strong style="color:#f4f4f6;">${safeEmail}</strong></div>
                      <div style="margin-bottom:6px;"><span style="color:#8c8d98;">Assigned role:</span> <strong style="color:#9fb0ff;">INTERVIEWER</strong></div>
                      ${safeTitle ? `<div style="margin-bottom:6px;"><span style="color:#8c8d98;">Title:</span> <span style="color:#f4f4f6;">${safeTitle}</span></div>` : ""}
                      <div style="margin-bottom:6px;"><span style="color:#8c8d98;">Default timezone:</span> <span style="color:#f4f4f6;">${safeTimezone}</span></div>
                      <div style="margin-bottom:6px;"><span style="color:#8c8d98;">Assessment focus:</span> <span style="color:#f4f4f6;">${safeTags}</span></div>
                      <div><span style="color:#8c8d98;">Expires:</span> <span style="color:#f4f4f6;">${safeExpiry}</span></div>
                    </td>
                  </tr>
                </table>

                <table role="presentation" cellspacing="0" cellpadding="0" style="margin:0 0 22px 0;">
                  <tr>
                    <td style="border-radius:6px;background-color:#4f65f1;">
                      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 20px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
                        Accept Interviewer Invitation
                      </a>
                    </td>
                  </tr>
                </table>

                <p style="margin:0 0 8px 0;font-size:12px;color:#8c8d98;">
                  If the button does not open in your email client, copy and paste this single-use URL into your browser:
                </p>
                <p style="margin:0 0 18px 0;word-break:break-all;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;font-size:12px;color:#9fb0ff;">
                  ${safeUrl}
                </p>

                <p style="margin:0;padding-top:16px;border-top:1px solid #1d1d24;font-size:12px;color:#8c8d98;">
                  This invitation works once and is bound to ${safeEmail}. If the link expires before you accept it, contact your GRIT Operations coordinator to issue a replacement invitation.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    "GRIT Interview Hub — Interviewer Invitation",
    "",
    `Hello ${input.recipientName?.trim() || input.recipientEmail.trim()},`,
    "",
    `${input.inviterName?.trim() || "The GRIT Operations Team"} has invited you to join GRIT Interview Hub as an INTERVIEWER.`,
    "",
    `Invited email: ${input.recipientEmail.trim()}`,
    `Assigned role: INTERVIEWER`,
    ...(input.title?.trim() ? [`Title: ${input.title.trim()}`] : []),
    `Default timezone: ${input.defaultTimezone}`,
    `Assessment focus: ${input.expertiseTags.length > 0 ? input.expertiseTags.join(", ") : "General Technical Assessment"}`,
    `Expires: ${formatExpiryUtc(input.expiresAt)}`,
    "",
    `Accept your invitation: ${input.inviteUrl}`,
    "",
    "This link works once and is bound to your invited email address. If it expires, contact your GRIT Operations coordinator to issue a new invitation.",
  ].join("\n");

  return { subject, html, text };
}
