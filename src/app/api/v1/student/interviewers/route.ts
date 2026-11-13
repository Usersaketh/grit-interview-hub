import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { listBookableInterviewers } from "@backend/modules/booking/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db } = await requireRole("STUDENT", "OPERATIONS", "ADMIN");
    const url = new URL(request.url);
    const badgeIdParam = url.searchParams.get("badgeId")?.trim();
    const badgeId = badgeIdParam ? z.string().uuid().parse(badgeIdParam) : undefined;
    const data = await listBookableInterviewers(db, badgeId);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
