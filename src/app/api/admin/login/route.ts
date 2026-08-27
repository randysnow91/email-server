import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";

export async function POST(request: NextRequest) {
  const { secret } = await request.json();
  const expected = process.env.ADMIN_ACCESS_SECRET ?? "";

  const provided = Buffer.from(secret ?? "");
  const known = Buffer.from(expected);

  // Length check first: timingSafeEqual throws on mismatched buffer lengths.
  const valid =
    provided.length === known.length && crypto.timingSafeEqual(provided, known);

  if (!valid) {
    return NextResponse.json({ error: "Incorrect secret" }, { status: 401 });
  }

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
