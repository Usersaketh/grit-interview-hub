import { NextResponse } from "next/server";
import { errorResponse } from "@backend/lib/errors";
import { enforceRateLimit, getClientIp } from "@backend/lib/rateLimit";
import { createSupabaseAdminClient } from "@backend/lib/supabase/admin";
import { createSupabaseServerClient } from "@backend/lib/supabase/server";
import { acceptInvitationSchema } from "@backend/validation/schemas";
import { acceptInterviewerInvitation } from "@backend/modules/invitations/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    enforceRateLimit({
      key: `inv-accept:${ip}`,
      limit: 15,
      windowMs: 10 * 60 * 1000,
    });

    const input = acceptInvitationSchema.parse(await request.json());
    const userDb = await createSupabaseServerClient();
    const adminDb = createSupabaseAdminClient();
    const data = await acceptInterviewerInvitation(userDb, adminDb, input);

    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
