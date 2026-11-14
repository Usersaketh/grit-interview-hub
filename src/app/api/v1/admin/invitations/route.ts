import { NextResponse } from "next/server";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { resolveRequestOrigin } from "@backend/lib/origin";
import {
  createSupabaseAdminClient,
  createSupabaseOtpClient,
} from "@backend/lib/supabase/admin";
import { createInvitationSchema } from "@backend/validation/schemas";
import {
  createInterviewerInvitation,
  listInterviewerInvitations,
} from "@backend/modules/invitations/service";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { db } = await requireRole("OPERATIONS", "ADMIN");
    const data = await listInterviewerInvitations(db);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const { db, user } = await requireRole("OPERATIONS", "ADMIN");
    const input = createInvitationSchema.parse(await request.json());
    const origin = resolveRequestOrigin(request);
    const { data: inviterProfile } = await db
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    let adminDb: ReturnType<typeof createSupabaseAdminClient> | undefined;
    let otpClient: ReturnType<typeof createSupabaseOtpClient> | undefined;
    try {
      adminDb = createSupabaseAdminClient();
      otpClient = createSupabaseOtpClient();
    } catch {
      adminDb = undefined;
      otpClient = undefined;
    }

    const data = await createInterviewerInvitation(db, input, origin, {
      inviterName: inviterProfile?.full_name ?? user.email ?? null,
      adminDb,
      otpClient,
    });
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
