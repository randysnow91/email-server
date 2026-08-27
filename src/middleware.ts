import { NextRequest, NextResponse } from "next/server";

// Paths that must stay reachable without the admin secret, even though
// they live under a protected prefix below.
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/api/admin/login"];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get("admin_session")?.value;
  const isAuthed = !!cookie && cookie === process.env.ADMIN_ACCESS_SECRET;

  if (isAuthed) {
    return NextResponse.next();
  }

  // API routes get a 401 instead of a redirect - a fetch() call shouldn't
  // silently receive an HTML login page as its "data".
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return NextResponse.redirect(new URL("/admin/login", request.url));
}

// Everything under /admin and the admin API groups is gated. Public routes
// (/subscribe, /api/public/*) are simply not listed here, so middleware
// never runs for them.
export const config = {
  matcher: [
    "/admin/:path*",
    "/api/manager/:path*",
    "/api/builder/:path*",
    "/api/sender/:path*",
    "/api/health",
  ],
};
