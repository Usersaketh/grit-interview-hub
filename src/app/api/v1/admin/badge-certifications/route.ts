import { NextResponse } from "next/server";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { certificationListQuerySchema } from "@backend/validation/schemas";
import { listBadgeCertifications } from "@backend/modules/malpractice/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db } = await requireRole("OPERATIONS", "ADMIN");
    const url = new URL(request.url);
    const query = certificationListQuerySchema.parse({
      status: url.searchParams.get("status") || undefined,
      search: url.searchParams.get("search") || undefined,
    });
    const data = await listBadgeCertifications(db, query);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
