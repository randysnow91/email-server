import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import {
  ACTIVE_EMAIL_SERVER_COOKIE,
  getActiveEmailServerId,
  listEmailServers,
} from "@/lib/emailServer";

// Admin-gated (proxy.ts covers /api/manager/*). Newsletters = the
// email_servers table. V1 supports listing, creating, and switching the
// active one - no edit/delete/activate (§4.14).

export async function GET() {
  try {
    const [accounts, activeId] = await Promise.all([
      listEmailServers(),
      getActiveEmailServerId(),
    ]);
    return NextResponse.json({ accounts, activeId });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load newsletters." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" && body.description.trim()
      ? body.description.trim()
      : null;

  if (!name) {
    return NextResponse.json({ error: "A newsletter name is required." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("email_servers")
    .insert({ name, description })
    .select("id, name, description, created_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Switch to the newsletter you just created - that's almost always what
  // you want next.
  const res = NextResponse.json(data, { status: 201 });
  res.cookies.set(ACTIVE_EMAIL_SERVER_COOKIE, data.id as string, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  return res;
}
