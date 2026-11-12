export type Requirement = { skillId: string; requiredLevel: number };
export type Progress = { skillId: string; achievedLevel: number; verifiedAt: string | null };
export type EligibilityDecision = { eligible: boolean; state: "ELIGIBLE" | "NOT_ELIGIBLE"; unmetSkillIds: string[]; reason: string };
export function evaluateEligibility(requirements: Requirement[], progress: Progress[], now = new Date()): EligibilityDecision {
  if (requirements.length === 0) return { eligible: false, state: "NOT_ELIGIBLE", unmetSkillIds: [], reason: "Badge has no required skills" };
  const map = new Map(progress.map((item) => [item.skillId, item]));
  const unmetSkillIds = requirements.filter((r) => { const p = map.get(r.skillId); return !p?.verifiedAt || new Date(p.verifiedAt) > now || p.achievedLevel < r.requiredLevel; }).map((r) => r.skillId);
  return unmetSkillIds.length ? { eligible: false, state: "NOT_ELIGIBLE", unmetSkillIds, reason: "One or more required skills are incomplete or unverified" } : { eligible: true, state: "ELIGIBLE", unmetSkillIds: [], reason: "All required skills are verified" };
}
export async function getEligibility(db: any, studentId: string, badgeId: string): Promise<EligibilityDecision> {
  const { data: badge, error: badgeError } = await db.from("badges").select("id, is_active").eq("id", badgeId).single();
  if (badgeError) {
    if (badgeError.code === "PGRST116") throw new (await import("@/lib/errors")).AppError("BADGE_NOT_FOUND", 404, "Badge not found");
    throw badgeError;
  }
  if (!badge) throw new (await import("@/lib/errors")).AppError("BADGE_NOT_FOUND", 404, "Badge not found");
  if (!badge.is_active) throw new (await import("@/lib/errors")).AppError("BADGE_INACTIVE", 409, "Badge is inactive");
  const [{ data: requirements, error: reqError }, { data: progress, error: progressError }] = await Promise.all([db.from("badge_required_skills").select("skill_id, required_level").eq("badge_id", badgeId), db.from("skill_progress").select("skill_id, achieved_level, verified_at").eq("student_id", studentId)]);
  if (reqError) throw reqError;
  if (progressError) throw progressError;
  const reqs = (requirements ?? []).map((r: any) => ({ skillId: r.skill_id, requiredLevel: r.required_level }));
  if (reqs.length === 0) return { eligible: false, state: "NOT_ELIGIBLE", unmetSkillIds: [], reason: "Badge has no required skills" };
  return evaluateEligibility(reqs, (progress ?? []).map((p: any) => ({ skillId: p.skill_id, achievedLevel: p.achieved_level, verifiedAt: p.verified_at })));
}
