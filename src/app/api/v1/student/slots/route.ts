import { NextResponse } from "next/server";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { slotsQuerySchema } from "@backend/validation/schemas";
import { discoverBookableSlots } from "@backend/modules/booking/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db } = await requireRole("STUDENT", "OPERATIONS", "ADMIN");
    const url = new URL(request.url);
    const params = slotsQuerySchema.parse({
      badgeId: url.searchParams.get("badgeId") ?? "",
      interviewerId: url.searchParams.get("interviewerId") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      excludeInterviewId: url.searchParams.get("excludeInterviewId") || undefined,
      durationMinutes: url.searchParams.get("durationMinutes") ?? undefined,
    });

    const data = await discoverBookableSlots(db, params);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
