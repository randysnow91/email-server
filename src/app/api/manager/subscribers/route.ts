import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getDefaultEmailServerId } from "@/lib/emailServer";
import { isValidEmail } from "@/lib/validation";

const DEFAULT_LIMIT = 50;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const includeUnsubscribed = params.get("unsubscribed") === "true";
  const limit = Math.min(Number(params.get("limit")) || DEFAULT_LIMIT, DEFAULT_LIMIT);
  const offset = Math.max(Number(params.get("offset")) || 0, 0);

  const emailServerId = params.get("email_server_id") ?? (await getDefaultEmailServerId());

  let query = supabase
    .from("subscribers")
    .select("id, email, name, subscription_preference, created_at, unsubscribed", {
      count: "exact",
    })
    .eq("email_server_id", emailServerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (!includeUnsubscribed) {
    query = query.eq("unsubscribed", false);
  }

  const { data, error, count } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ subscribers: data, total: count ?? 0, limit, offset });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { email, name } = body;

  if (!isValidEmail(email)) {
    return NextResponse.json({ error: "A valid email address is required." }, { status: 400 });
  }

  const emailServerId = body.email_server_id ?? (await getDefaultEmailServerId());

  const { data, error } = await supabase
    .from("subscribers")
    .insert({
      email_server_id: emailServerId,
      email: email.trim(),
      name: typeof name === "string" && name.trim() ? name.trim() : null,
    })
    .select("id, email, name, subscription_preference, created_at, unsubscribed")
    .single();

  if (error) {
    // 23505 = Postgres unique_violation - this email is already on the list.
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "That email is already subscribed." },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data, { status: 201 });
}
