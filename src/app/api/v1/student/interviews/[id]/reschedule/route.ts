import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { rescheduleBookingSchema } from "@backend/validation/schemas";
import { rescheduleStudentBooking } from "@backend/modules/booking/service";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const interviewId = z.string().uuid().parse(id);
    const input = rescheduleBookingSchema.parse(await request.json());
    const { db } = await requireRole("STUDENT");
    const data = await rescheduleStudentBooking(db, interviewId, input);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
