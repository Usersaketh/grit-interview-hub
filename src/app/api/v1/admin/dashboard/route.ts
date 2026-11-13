import { NextResponse } from "next/server";
import { requireRole } from "@backend/lib/auth/authorize";
import { errorResponse } from "@backend/lib/errors";

export const runtime = "nodejs";

export async function GET() {
  try {
    const { db } = await requireRole("OPERATIONS", "ADMIN");
    const [
      { count: interviews },
      { count: pending },
      { count: results },
      pendingCertsResult,
      invitationsResult,
    ] = await Promise.all([
      db.from("interviews").select("id", { count: "exact", head: true }),
      db
        .from("interviews")
        .select("id", { count: "exact", head: true })
        .eq("status", "AWAITING_OUTCOME"),
      db.from("interview_results").select("id", { count: "exact", head: true }),
      db.rpc("list_badge_certifications", {
        p_status: "CERTIFICATION_PENDING",
        p_search: null,
      }),
      db.rpc("list_interviewer_invitations"),
    ]);

    const pendingCertifications = Array.isArray(pendingCertsResult.data)
      ? pendingCertsResult.data.length
      : 0;

    const pendingInvitations = Array.isArray(invitationsResult.data)
      ? invitationsResult.data.filter((inv: { status?: string }) => inv.status === "PENDING").length
      : 0;

    return NextResponse.json({
      data: {
        totalInterviews: interviews ?? 0,
        pendingEvaluations: pending ?? 0,
        evaluated: results ?? 0,
        pendingCertifications,
        pendingInvitations,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
