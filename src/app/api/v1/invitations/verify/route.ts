import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@backend/lib/errors";
import { enforceRateLimit, getClientIp } from "@backend/lib/rateLimit";
import { createSupabaseAdminClient } from "@backend/lib/supabase/admin";
import { createSupabaseServerClient } from "@backend/lib/supabase/server";
import { verifyInvitationForSession } from "@backend/modules/invitations/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const ip = getClientIp(request);
    enforceRateLimit({
      key: `inv-verify:${ip}`,
      limit: 30,
      windowMs: 5 * 60 * 1000,
    });

    const url = new URL(request.url);
    const invitationId = url.searchParams.get("invitationId")?.trim() ?? "";
    if (!invitationId) {
      throw new AppError(
        "VALIDATION_ERROR",
        422,
        "invitationId query parameter is required"
      );
    }

    const userDb = await createSupabaseServerClient();
    const adminDb = createSupabaseAdminClient();
    const data = await verifyInvitationForSession(userDb, adminDb, invitationId);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
