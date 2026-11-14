import { log } from "@backend/lib/logging";
import {
  buildInterviewerInvitationEmail,
  type InterviewerInvitationEmailInput,
} from "@backend/lib/email/templates";

export interface EmailDeliveryResult {
  status: "sent" | "not_configured" | "failed";
  provider: "resend" | "none";
  recipient: string;
  messageId?: string;
  error?: string;
}

export interface SendTransactionalEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface MailerDeps {
  env?: Record<string, string | undefined>;
  fetchImpl?: typeof fetch;
}

const RESEND_ENDPOINT = "https://api.resend.com/emails";

export async function sendTransactionalEmail(
  input: SendTransactionalEmailInput,
  deps: MailerDeps = {}
): Promise<EmailDeliveryResult> {
  const env = deps.env ?? process.env;
  const apiKey = (
    env.EMAIL_PROVIDER_API_KEY ||
    env.RESEND_API_KEY ||
    ""
  ).trim();
  const fromAddress = (env.EMAIL_FROM || "").trim();

  if (!apiKey || !fromAddress) {
    return {
      status: "not_configured",
      provider: "none",
      recipient: input.to,
      error:
        "Email provider is not configured (set EMAIL_PROVIDER_API_KEY and EMAIL_FROM to send automated invitation emails).",
    };
  }

  const fetchFn = deps.fetchImpl ?? fetch;

  try {
    const response = await fetchFn(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: [input.to],
        subject: input.subject,
        html: input.html,
        text: input.text,
      }),
      signal: AbortSignal.timeout(8000),
    });

    const payload = (await response.json().catch(() => null)) as
      | { id?: string; message?: string; error?: { message?: string } }
      | null;

    if (!response.ok) {
      const errorMessage =
        payload?.error?.message ||
        payload?.message ||
        `Email provider returned HTTP ${response.status}`;

      log("email.delivery_failed", {
        provider: "resend",
        recipient: input.to,
        status: response.status,
        error: errorMessage,
      });

      return {
        status: "failed",
        provider: "resend",
        recipient: input.to,
        error: errorMessage,
      };
    }

    log("email.delivery_sent", {
      provider: "resend",
      recipient: input.to,
      messageId: payload?.id ?? null,
    });

    return {
      status: "sent",
      provider: "resend",
      recipient: input.to,
      ...(payload?.id ? { messageId: payload.id } : {}),
    };
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Failed to reach email provider";

    log("email.delivery_exception", {
      provider: "resend",
      recipient: input.to,
      error: message,
    });

    return {
      status: "failed",
      provider: "resend",
      recipient: input.to,
      error: message,
    };
  }
}

export async function sendInterviewerInvitationEmail(
  input: InterviewerInvitationEmailInput,
  deps: MailerDeps = {}
): Promise<EmailDeliveryResult> {
  const rendered = buildInterviewerInvitationEmail(input);
  return sendTransactionalEmail(
    {
      to: input.recipientEmail.trim().toLowerCase(),
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
    },
    deps
  );
}
