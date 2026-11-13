import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getConfig } from "@backend/lib/config";

export async function createSupabaseServerClient() {
  const config = getConfig();
  const cookieStore = await cookies();

  return createServerClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // Server Components cannot modify cookies.
            // Middleware handles session refresh and response cookie persistence.
          }
        }
      }
    }
  );
}
