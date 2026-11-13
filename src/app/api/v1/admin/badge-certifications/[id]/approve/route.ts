
import { NextResponse } from "next/server";
import { requireRole } from "@/lib/auth/authorize";
import { errorResponse } from "@/lib/errors";
import { z } from "zod";
import { approveBadgeCertification } from "@/modules/malpractice/service";

const approveBadgeCertificationSchema = z.object({
  idempotencyKey: z.string().uuid(),
});

const badgeAwardIdSchema = z.string().uuid();

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const badgeAwardId = badgeAwardIdSchema.parse(id);

    const input = approveBadgeCertificationSchema.parse(
      await request.json()
    );

    const { db } = await requireRole("OPERATIONS", "ADMIN");

    const award = await approveBadgeCertification(db, {
      badgeAwardId,
      idempotencyKey: input.idempotencyKey,
    });

    return NextResponse.json({ data: award });
  } catch (error) {
    return errorResponse(error);
  }
}
