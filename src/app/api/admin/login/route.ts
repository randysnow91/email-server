import { NextRequest, NextResponse } from "next/server";
import { constantTimeEqual } from "@/lib/adminAuth";
import { checkRateLimit, registerFailure, clearRateLimit } from "@/lib/rateLimit";

// Failed-login lockout: after this many wrong guesses from one IP inside the
// window, further attempts are refused until it expires. A real admin logs
// in a handful of times a day; a brute-force script hits this immediately.
// The secret itself is 256 bits of randomness, so this is defense in depth -
// it also just stops the endpoint being used to hammer the server.
const LOGIN_RATE_LIMIT = { limit: 10, windowMs: 10 * 60 * 1000 };

function clientIp(request: NextRequest): string {
  // Render (like most proxies) puts the real client IP first in this header.
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  const key = `admin-login:${clientIp(request)}`;

  const limit = checkRateLimit(key, LOGIN_RATE_LIMIT);
  if (!limit.allowed) {
    return NextResponse.json(
      { error: "Too many attempts. Please wait a few minutes and try again." },
      { status: 429, headers: { "Retry-After": String(limit.retryAfterSeconds) } }
    );
  }

  const body = await request.json().catch(() => ({}));
  const secret = typeof body.secret === "string" ? body.secret : "";
  const expected = process.env.ADMIN_ACCESS_SECRET ?? "";

  const valid = expected.length > 0 && constantTimeEqual(secret, expected);

  if (!valid) {
    registerFailure(key, LOGIN_RATE_LIMIT);
    return NextResponse.json({ error: "Incorrect secret." }, { status: 401 });
  }

  // Successful login - don't leave the person rate-limited over earlier typos.
  clearRateLimit(key);

  const response = NextResponse.json({ success: true });
  response.cookies.set("admin_session", expected, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 7, // 7 days
  });
  return response;
}
