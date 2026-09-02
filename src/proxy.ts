import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/adminAuth";
import { appOrigin } from "@/lib/appUrl";

// Paths that must stay reachable without the admin secret, even though
// they live under a protected prefix below.
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/api/admin/login"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_ADMIN_PATHS.includes(pathname)) {
    return NextResponse.next();
  }

  const cookie = request.cookies.get("admin_session")?.value;
  const secret = process.env.ADMIN_ACCESS_SECRET ?? "";
  const isAuthed = !!cookie && secret.length > 0 && constantTimeEqual(cookie, secret);

  if (isAuthed) {
    return NextResponse.next();
  }

  // API routes get a 401 instead of a redirect - a fetch() call shouldn't
  // silently receive an HTML login page as its "data".
  if (pathname.startsWith("/api/")) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Redirect against appOrigin(), not request.url: behind Render's proxy the
  // latter is the internal address (localhost:10000). Middleware requires an
  // absolute Location, so a relative path won't do here.
  return NextResponse.redirect(new URL("/admin/login", appOrigin()));
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
