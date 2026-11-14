import { NextResponse } from "next/server";
import { requireRole } from "@backend/lib/auth/authorize";
import { AppError, errorResponse } from "@backend/lib/errors";

export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const { db } = await requireRole("STUDENT");
    const { id } = await context.params;

    if (!id || !UUID_REGEX.test(id)) {
      throw new AppError("VALIDATION_ERROR", 422, "Valid notification ID is required");
    }

    const { data, error } = await db.rpc("mark_student_notification_read", {
      p_notification_id: id,
    });

    if (error) {
      const msg = (error.message ?? "").toLowerCase();
      if (msg.includes("notification_not_found")) {
        throw new AppError("NOT_FOUND", 404, "Notification not found");
      }
      throw error;
    }

    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
