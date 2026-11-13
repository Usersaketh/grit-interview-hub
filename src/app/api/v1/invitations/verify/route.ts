import { NextResponse } from "next/server";
import { AppError, errorResponse } from "@backend/lib/errors";
import { enforceRateLimit, getClientIp } from "@backend/lib/rateLimit";
import { createSupabaseAdminClient } from "@backend/lib/supabase/admin";
import { verifyInvitationToken } from "@backend/modules/invitations/service";

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
    const token = url.searchParams.get("token")?.trim() ?? "";
    if (!token) {
      throw new AppError("VALIDATION_ERROR", 422, "Invitation token query parameter is required");
    }

    const adminDb = createSupabaseAdminClient();
    const data = await verifyInvitationToken(adminDb, token);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
