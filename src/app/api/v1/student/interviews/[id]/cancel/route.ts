import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { cancelBookingSchema } from "@backend/validation/schemas";
import { cancelStudentBooking } from "@backend/modules/booking/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const interviewId = z.string().uuid().parse(id);
    const input = cancelBookingSchema.parse(await request.json());
    const { db } = await requireRole("STUDENT");
    const data = await cancelStudentBooking(db, interviewId, input);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
