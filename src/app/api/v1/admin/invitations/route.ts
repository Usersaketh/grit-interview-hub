import { NextResponse } from "next/server";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
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
    const { db } = await requireRole("OPERATIONS", "ADMIN");
    const input = createInvitationSchema.parse(await request.json());
    const origin = new URL(request.url).origin;
    const data = await createInterviewerInvitation(db, input, origin);
    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
