import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { ACTIVE_EMAIL_SERVER_COOKIE } from "@/lib/emailServer";

// Sets the active-newsletter cookie after validating the id is real.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" ? body.id : "";

  if (!id) {
    return NextResponse.json({ error: "A newsletter id is required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("email_servers")
    .select("id")
    .eq("id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: "That newsletter doesn't exist." }, { status: 404 });
  }

  const res = NextResponse.json({ success: true, activeId: id });
  res.cookies.set(ACTIVE_EMAIL_SERVER_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
