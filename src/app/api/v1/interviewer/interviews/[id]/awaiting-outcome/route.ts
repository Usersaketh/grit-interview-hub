import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { completeSessionSchema } from "@backend/validation/schemas";
import { completeInterviewSession } from "@backend/modules/evaluations/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const interviewId = z.string().uuid().parse(id);
    const input = completeSessionSchema.parse(await request.json());
    const { db } = await requireRole("INTERVIEWER", "OPERATIONS", "ADMIN");
    const data = await completeInterviewSession(db, interviewId, input);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
