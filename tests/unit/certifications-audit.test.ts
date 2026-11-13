import { describe, expect, it, vi } from "vitest";
import {
  getBadgeCertificationDetail,
  listAuditLogs,
  listBadgeCertifications,
} from "@backend/modules/malpractice/service";

describe("badge certifications queue and audit logs", () => {
  it("lists certifications with optional status and search filters", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "award-1",
          status: "CERTIFICATION_PENDING",
          student_name: "Aarav Mehta",
          badge_name: "Backend Systems I",
        },
      ],
      error: null,
    });

    const items = await listBadgeCertifications(
      { rpc },
      { status: "CERTIFICATION_PENDING", search: "Aarav" }
    );
    expect(items).toHaveLength(1);
    expect(rpc).toHaveBeenCalledWith("list_badge_certifications", {
      p_status: "CERTIFICATION_PENDING",
      p_search: "Aarav",
    });
  });

  it("fetches single badge certification detail and maps forbidden errors", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: { id: "award-1", status: "CERTIFICATION_PENDING" },
      error: null,
    });
    const detail = await getBadgeCertificationDetail({ rpc }, "award-1");
    expect(detail.id).toBe("award-1");

    const forbiddenRpc = vi.fn().mockResolvedValue({
      data: null,
      error: { message: "staff_role_required" },
    });
    await expect(
      getBadgeCertificationDetail({ rpc: forbiddenRpc }, "award-1")
    ).rejects.toMatchObject({ status: 403, code: "FORBIDDEN" });
  });

  it("lists paginated audit logs mapped to camelCase with totalCount", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: [
        {
          id: "log-1",
          actor_id: "u-1",
          actor_name: "Ops User",
          actor_email: "ops@example.com",
          entity_type: "interviewer_invitation",
          entity_id: "inv-1",
          action: "INVITATION_CREATED",
          previous_value: null,
          new_value: { status: "PENDING" },
          reason: null,
          created_at: "2026-11-14T10:00:00Z",
          total_count: 14,
        },
      ],
      error: null,
    });

    const page = await listAuditLogs(
      { rpc },
      { entityType: "interviewer_invitation", limit: 25, offset: 0 }
    );

    expect(page.totalCount).toBe(14);
    expect(page.limit).toBe(25);
    expect(page.items[0]).toEqual({
      id: "log-1",
      actorId: "u-1",
      actorName: "Ops User",
      actorEmail: "ops@example.com",
      entityType: "interviewer_invitation",
      entityId: "inv-1",
      action: "INVITATION_CREATED",
      previousValue: null,
      newValue: { status: "PENDING" },
      reason: null,
      createdAt: "2026-11-14T10:00:00Z",
    });
  });
});
