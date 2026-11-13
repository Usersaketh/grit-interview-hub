import { NextResponse } from "next/server";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";
import { auditLogsQuerySchema } from "@backend/validation/schemas";
import { listAuditLogs } from "@backend/modules/malpractice/service";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const { db } = await requireRole("OPERATIONS", "ADMIN");
    const url = new URL(request.url);
    const filters = auditLogsQuerySchema.parse({
      actorId: url.searchParams.get("actorId") || undefined,
      entityType: url.searchParams.get("entityType") || undefined,
      entityId: url.searchParams.get("entityId") || undefined,
      action: url.searchParams.get("action") || undefined,
      search: url.searchParams.get("search") || undefined,
      from: url.searchParams.get("from") || undefined,
      to: url.searchParams.get("to") || undefined,
      limit: url.searchParams.get("limit") ?? undefined,
      offset: url.searchParams.get("offset") ?? undefined,
    });
    const data = await listAuditLogs(db, filters);
    return NextResponse.json({ data });
  } catch (error) {
    return errorResponse(error);
  }
}
