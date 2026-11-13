import { NextResponse } from "next/server";
import { errorResponse } from "@backend/lib/errors";
import { resolveRequestOrigin } from "@backend/lib/origin";
import { enforceRateLimit, getClientIp } from "@backend/lib/rateLimit";
import { createSupabaseServerClient } from "@backend/lib/supabase/server";
import { registerStudentAccount } from "@backend/modules/auth/service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const ip = getClientIp(request);
    enforceRateLimit({
      key: `signup:${ip}`,
      limit: 10,
      windowMs: 10 * 60 * 1000,
      message: "Too many signup attempts from this address. Please try again later.",
    });

    const rawBody = await request.json();
    const origin = resolveRequestOrigin(request);
    const emailRedirectTo = `${origin}/auth/callback?next=${encodeURIComponent("/student")}`;
    const db = await createSupabaseServerClient();
    const data = await registerStudentAccount(db, rawBody, emailRedirectTo);

    return NextResponse.json({ data }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
