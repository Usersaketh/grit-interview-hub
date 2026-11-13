import { AppError } from "@backend/lib/errors";
import { createSupabaseServerClient } from "@backend/lib/supabase/server";
export type Role = "STUDENT" | "INTERVIEWER" | "OPERATIONS" | "ADMIN";
export async function requireUser() { const db = await createSupabaseServerClient(); const { data: { user }, error } = await db.auth.getUser(); if (error || !user) throw new AppError("UNAUTHENTICATED", 401, "Authentication is required"); return { db, user }; }
export async function requireRole(...roles: Role[]) { const { db, user } = await requireUser(); const { data, error } = await db.from("user_roles").select("role").eq("user_id", user.id).in("role", roles); if (error || !data?.length) throw new AppError("FORBIDDEN", 403, "You do not have permission to perform this action"); return { db, user, role: data[0].role as Role }; }
