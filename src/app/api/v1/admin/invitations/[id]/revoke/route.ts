import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { revokeInvitationSchema } from "@backend/validation/schemas";
import { revokeInterviewerInvitation } from "@backend/modules/invitations/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const invitationId = z.string().uuid().parse(id);
    const input = revokeInvitationSchema.parse(await request.json());
    const { db } = await requireRole("OPERATIONS", "ADMIN");
    const data = await revokeInterviewerInvitation(db, invitationId, input);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
