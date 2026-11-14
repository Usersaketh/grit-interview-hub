import { NextResponse } from "next/server";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { db, user } = await requireRole("STUDENT");

    const { data, error } = await db
      .from("notifications")
      .select(
        "id, user_id, type, template_key, delivery_channel, delivery_status, payload, sent_at, read_at, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) {
      throw error;
    }

    return NextResponse.json({ data: data ?? [] });
  } catch (error) {
    return errorResponse(error);
  }
}
