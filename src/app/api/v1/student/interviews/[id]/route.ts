import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { getInterviewWorkspaceDetail } from "@backend/modules/evaluations/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const interviewId = z.string().uuid().parse(id);
    const { db } = await requireRole("STUDENT", "OPERATIONS", "ADMIN");
    const data = await getInterviewWorkspaceDetail(db, interviewId);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
