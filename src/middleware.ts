import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { getConfig } from "@backend/lib/config";

function hasSupabaseAuthCookie(request: NextRequest): boolean {
  return request.cookies
    .getAll()
    .some((cookie) => cookie.name.startsWith("sb-") && cookie.value.length > 0);
}

export async function middleware(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  // API routes handle authentication and cookie reads directly via requireUser/requireRole.
  // Unauthenticated visitors with no sb-* cookie do not need a blocking remote auth round-trip.
  if (pathname.startsWith("/api/") || !hasSupabaseAuthCookie(request)) {
    return NextResponse.next({ request });
  }

  let config;
  try {
    config = getConfig();
  } catch {
    return NextResponse.next({ request });
  }

  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    config.NEXT_PUBLIC_SUPABASE_URL,
    config.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[]
        ) {
          cookiesToSet.forEach(({ name, value }) => {
            request.cookies.set(name, value);
          });

          response = NextResponse.next({ request });

          cookiesToSet.forEach(({ name, value, options }) => {
            response.cookies.set(name, value, options);
          });
        },
      },
    }
  );

  try {
    await supabase.auth.getUser();
  } catch {
    // Allow routes to render even if Supabase auth refresh is temporarily unreachable
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
