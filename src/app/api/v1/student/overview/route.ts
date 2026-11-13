import { NextResponse } from "next/server";
import { requireRole } from "@backend/lib/auth/authorize";
import { AppError, errorResponse } from "@backend/lib/errors";
import {
  evaluateEligibility,
  type EligibilityDecision,
} from "@backend/modules/eligibility/service";
import { getStudentMalpracticeStatus } from "@backend/modules/malpractice/service";

export const runtime = "nodejs";

/**
 * Aggregated single-round-trip student workspace bootstrap endpoint.
 * Preserves RLS + student role enforcement while eliminating sequential client waterfalls
 * and per-badge eligibility N+1 HTTP requests.
 */
export async function GET() {
  try {
    const { db, user } = await requireRole("STUDENT");

    const { data: student, error: studentError } = await db
      .from("students")
      .select("id, user_id, external_student_id, campus_ref, created_at")
      .eq("user_id", user.id)
      .single();

    if (studentError || !student) {
      throw new AppError("FORBIDDEN", 403, "Student profile is required");
    }

    const [
      badgesResult,
      requiredSkillsResult,
      skillProgressResult,
      interviewsResult,
      malpracticeRecords,
    ] = await Promise.all([
      db
        .from("badges")
        .select("id, track_id, external_id, name, level, is_active")
        .order("name", { ascending: true }),
      db
        .from("badge_required_skills")
        .select("badge_id, skill_id, required_level"),
      db
        .from("skill_progress")
        .select("skill_id, achieved_level, verified_at, source_updated_at")
        .eq("student_id", student.id),
      db
        .from("interviews")
        .select("*, badges(name, level), interview_results(*)")
        .eq("student_id", student.id)
        .order("starts_at", { ascending: false }),
      getStudentMalpracticeStatus(db),
    ]);

    if (badgesResult.error) throw badgesResult.error;
    if (requiredSkillsResult.error) throw requiredSkillsResult.error;
    if (skillProgressResult.error) throw skillProgressResult.error;
    if (interviewsResult.error) throw interviewsResult.error;

    const badges = badgesResult.data ?? [];
    const requiredSkills = requiredSkillsResult.data ?? [];
    const skillProgress = skillProgressResult.data ?? [];
    const interviews = interviewsResult.data ?? [];

    const reqsByBadge = new Map<string, Array<{ skillId: string; requiredLevel: number }>>();
    for (const req of requiredSkills) {
      const list = reqsByBadge.get(req.badge_id) ?? [];
      list.push({ skillId: req.skill_id, requiredLevel: req.required_level });
      reqsByBadge.set(req.badge_id, list);
    }

    const mappedProgress = skillProgress.map((p) => ({
      skillId: p.skill_id,
      achievedLevel: p.achieved_level,
      verifiedAt: p.verified_at,
    }));

    const eligibilities: Record<string, EligibilityDecision> = {};
    for (const badge of badges) {
      if (!badge.is_active) {
        eligibilities[badge.id] = {
          eligible: false,
          state: "NOT_ELIGIBLE",
          unmetSkillIds: [],
          reason: "Badge is inactive",
        };
      } else {
        eligibilities[badge.id] = evaluateEligibility(
          reqsByBadge.get(badge.id) ?? [],
          mappedProgress
        );
      }
    }

    return NextResponse.json({
      data: {
        student,
        badges,
        requiredSkills,
        skillProgress,
        eligibilities,
        interviews,
        malpracticeStatus: {
          studentId: student.id,
          records: malpracticeRecords ?? [],
        },
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}
