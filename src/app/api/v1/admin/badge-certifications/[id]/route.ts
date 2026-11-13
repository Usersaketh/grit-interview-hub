import { NextResponse } from "next/server";
import { z } from "zod";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { getBadgeCertificationDetail } from "@backend/modules/malpractice/service";

export const runtime = "nodejs";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const awardId = z.string().uuid().parse(id);
    const { db } = await requireRole("OPERATIONS", "ADMIN");
    const data = await getBadgeCertificationDetail(db, awardId);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
