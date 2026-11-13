import { describe, expect, it, vi } from "vitest";
import { evaluateEligibility, getEligibility } from "@backend/modules/eligibility/service";
import { AppError } from "@backend/lib/errors";

const fixedNow = new Date("2026-06-15T12:00:00Z");

describe("evaluateEligibility", () => {
  it("requires every skill to be verified at the required level", () => {
    expect(
      evaluateEligibility(
        [{ skillId: "a", requiredLevel: 2 }, { skillId: "b", requiredLevel: 1 }],
        [{ skillId: "a", achievedLevel: 2, verifiedAt: "2026-01-01T00:00:00Z" }, { skillId: "b", achievedLevel: 1, verifiedAt: null }],
        fixedNow
      ).eligible
    ).toBe(false);
  });

  it("allows fully verified requirements", () => {
    expect(
      evaluateEligibility(
        [{ skillId: "a", requiredLevel: 1 }],
        [{ skillId: "a", achievedLevel: 1, verifiedAt: "2026-01-01T00:00:00Z" }],
        fixedNow
      ).state
    ).toBe("ELIGIBLE");
  });

  it("returns NOT_ELIGIBLE when skill progress is missing", () => {
    const result = evaluateEligibility(
      [{ skillId: "a", requiredLevel: 1 }],
      [],
      fixedNow
    );
    expect(result.eligible).toBe(false);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.unmetSkillIds).toContain("a");
  });

  it("returns NOT_ELIGIBLE when progress is unverified", () => {
    const result = evaluateEligibility(
      [{ skillId: "a", requiredLevel: 1 }],
      [{ skillId: "a", achievedLevel: 2, verifiedAt: null }],
      fixedNow
    );
    expect(result.eligible).toBe(false);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.unmetSkillIds).toContain("a");
  });

  it("returns NOT_ELIGIBLE when achieved level is insufficient", () => {
    const result = evaluateEligibility(
      [{ skillId: "a", requiredLevel: 3 }],
      [{ skillId: "a", achievedLevel: 2, verifiedAt: "2026-01-01T00:00:00Z" }],
      fixedNow
    );
    expect(result.eligible).toBe(false);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.unmetSkillIds).toContain("a");
  });

  it("returns NOT_ELIGIBLE when verification timestamp is in the future", () => {
    const result = evaluateEligibility(
      [{ skillId: "a", requiredLevel: 1 }],
      [{ skillId: "a", achievedLevel: 1, verifiedAt: "2027-01-01T00:00:00Z" }],
      fixedNow
    );
    expect(result.eligible).toBe(false);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.unmetSkillIds).toContain("a");
  });

  it("returns NOT_ELIGIBLE when requirements are empty", () => {
    const result = evaluateEligibility([], [], fixedNow);
    expect(result.eligible).toBe(false);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.unmetSkillIds).toEqual([]);
    expect(result.reason).toBe("Badge has no required skills");
  });
});

describe("getEligibility", () => {
  const createMockDb = (badgeData: any, requirementsData: any, progressData: any) => {
    const badgeChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue(badgeData),
    };
    const reqChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve(requirementsData)),
    };
    const progChain = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      then: vi.fn((resolve) => resolve(progressData)),
    };
    const from = vi.fn((table: string) => {
      if (table === "badges") return badgeChain;
      if (table === "badge_required_skills") return reqChain;
      if (table === "skill_progress") return progChain;
      return { select: vi.fn().mockReturnThis(), eq: vi.fn().mockReturnThis(), single: vi.fn(), then: vi.fn() };
    });
    return { from };
  };

  it("returns ELIGIBLE when all skills verified and levels sufficient", async () => {
    const mockDb = createMockDb(
      { data: { id: "badge-1", is_active: true }, error: null },
      { data: [{ skill_id: "skill-1", required_level: 2 }], error: null },
      { data: [{ skill_id: "skill-1", achieved_level: 2, verified_at: "2026-01-01T00:00:00Z" }], error: null }
    );

    const result = await getEligibility(mockDb, "student-1", "badge-1");
    expect(result.eligible).toBe(true);
    expect(result.state).toBe("ELIGIBLE");
    expect(result.unmetSkillIds).toEqual([]);
  });

  it("returns NOT_ELIGIBLE when skill progress is missing", async () => {
    const mockDb = createMockDb(
      { data: { id: "badge-1", is_active: true }, error: null },
      { data: [{ skill_id: "skill-1", required_level: 1 }], error: null },
      { data: [], error: null }
    );

    const result = await getEligibility(mockDb, "student-1", "badge-1");
    expect(result.eligible).toBe(false);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.unmetSkillIds).toContain("skill-1");
  });

  it("returns NOT_ELIGIBLE when progress is unverified", async () => {
    const mockDb = createMockDb(
      { data: { id: "badge-1", is_active: true }, error: null },
      { data: [{ skill_id: "skill-1", required_level: 1 }], error: null },
      { data: [{ skill_id: "skill-1", achieved_level: 1, verified_at: null }], error: null }
    );

    const result = await getEligibility(mockDb, "student-1", "badge-1");
    expect(result.eligible).toBe(false);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.unmetSkillIds).toContain("skill-1");
  });

  it("returns NOT_ELIGIBLE when achieved level is insufficient", async () => {
    const mockDb = createMockDb(
      { data: { id: "badge-1", is_active: true }, error: null },
      { data: [{ skill_id: "skill-1", required_level: 3 }], error: null },
      { data: [{ skill_id: "skill-1", achieved_level: 2, verified_at: "2026-01-01T00:00:00Z" }], error: null }
    );

    const result = await getEligibility(mockDb, "student-1", "badge-1");
    expect(result.eligible).toBe(false);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.unmetSkillIds).toContain("skill-1");
  });

  it("returns NOT_ELIGIBLE when verification timestamp is in the future", async () => {
    const mockDb = createMockDb(
      { data: { id: "badge-1", is_active: true }, error: null },
      { data: [{ skill_id: "skill-1", required_level: 1 }], error: null },
      { data: [{ skill_id: "skill-1", achieved_level: 1, verified_at: "2027-01-01T00:00:00Z" }], error: null }
    );

    const result = await getEligibility(mockDb, "student-1", "badge-1");
    expect(result.eligible).toBe(false);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.unmetSkillIds).toContain("skill-1");
  });

  it("returns NOT_ELIGIBLE when badge has zero required skills", async () => {
    const mockDb = createMockDb(
      { data: { id: "badge-1", is_active: true }, error: null },
      { data: [], error: null },
      { data: [], error: null }
    );

    const result = await getEligibility(mockDb, "student-1", "badge-1");
    expect(result.eligible).toBe(false);
    expect(result.state).toBe("NOT_ELIGIBLE");
    expect(result.unmetSkillIds).toEqual([]);
    expect(result.reason).toBe("Badge has no required skills");
  });

  it("throws BADGE_NOT_FOUND when badge does not exist", async () => {
    const mockDb = createMockDb(
      { data: null, error: { code: "PGRST116", message: "Not found" } },
      { data: [], error: null },
      { data: [], error: null }
    );

    await expect(getEligibility(mockDb, "student-1", "badge-1")).rejects.toThrow(AppError);
    await expect(getEligibility(mockDb, "student-1", "badge-1")).rejects.toMatchObject({ code: "BADGE_NOT_FOUND", status: 404 });
  });

  it("throws BADGE_INACTIVE when badge is inactive", async () => {
    const mockDb = createMockDb(
      { data: { id: "badge-1", is_active: false }, error: null },
      { data: [], error: null },
      { data: [], error: null }
    );

    await expect(getEligibility(mockDb, "student-1", "badge-1")).rejects.toThrow(AppError);
    await expect(getEligibility(mockDb, "student-1", "badge-1")).rejects.toMatchObject({ code: "BADGE_INACTIVE", status: 409 });
  });

  it("does not expose unrelated student progress", async () => {
    const mockDb = createMockDb(
      { data: { id: "badge-1", is_active: true }, error: null },
      { data: [{ skill_id: "skill-1", required_level: 1 }], error: null },
      {
        data: [
          { skill_id: "skill-1", achieved_level: 1, verified_at: "2026-01-01T00:00:00Z" },
          { skill_id: "unrelated-skill", achieved_level: 5, verified_at: "2026-01-01T00:00:00Z" },
        ],
        error: null,
      }
    );

    const result = await getEligibility(mockDb, "student-1", "badge-1");
    expect(result.eligible).toBe(true);
    expect(result.unmetSkillIds).toEqual([]);
  });
});