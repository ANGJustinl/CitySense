import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

const PROTECTED = ["/submit-place", "/my-submissions", "/admin"];

export async function proxy(request: NextRequest) {
  const response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return response;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value));
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      }
    }
  });
  const { data } = await supabase.auth.getUser();
  const protectedPath = PROTECTED.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`));
  if (protectedPath && !data.user) {
    const login = request.nextUrl.clone();
    login.pathname = "/login";
    login.searchParams.set("next", `${request.nextUrl.pathname}${request.nextUrl.search}`);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|icon.svg|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"]
};
