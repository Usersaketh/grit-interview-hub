import { createClient } from "@supabase/supabase-js";
import { getConfig } from "@backend/lib/config";

export function createSupabaseAdminClient() {
  const c = getConfig();
  if (!c.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is required for this operation");
  }
  return createClient(c.NEXT_PUBLIC_SUPABASE_URL, c.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

export function createSupabaseOtpClient() {
  const c = getConfig();
  return createClient(c.NEXT_PUBLIC_SUPABASE_URL, c.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
