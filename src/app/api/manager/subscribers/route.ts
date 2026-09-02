import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveEmailServerId } from "@/lib/emailServer";
import { isValidEmail } from "@/lib/validation";
import { domainCanReceiveEmail } from "@/lib/emailDomain";

const DEFAULT_LIMIT = 50;

// active = only current subscribers (default), unsubscribed = only people
// who have left, all = both. Replaces the old additive "unsubscribed=true"
// flag, which showed active + unsubscribed together with no way to see
// unsubscribed on their own.
const VALID_STATUSES = ["active", "unsubscribed", "all"] as const;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const statusParam = params.get("status");
  const status = VALID_STATUSES.includes(statusParam as (typeof VALID_STATUSES)[number])
    ? (statusParam as (typeof VALID_STATUSES)[number])
    : "active";
  const limit = Math.min(Number(params.get("limit")) || DEFAULT_LIMIT, DEFAULT_LIMIT);
  const offset = Math.max(Number(params.get("offset")) || 0, 0);

  const emailServerId = params.get("email_server_id") ?? (await getActiveEmailServerId());

  let query = supabase
    .from("subscribers")
    .select("id, email, name, subscription_preference, created_at, unsubscribed", {
      count: "exact",
    })
    .eq("email_server_id", emailServerId)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (status === "active") {
    query = query.eq("unsubscribed", false);
  } else if (status === "unsubscribed") {
    query = query.eq("unsubscribed", true);
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

  if (!(await domainCanReceiveEmail(email))) {
    return NextResponse.json(
      { error: "That email domain can't receive mail - check for a typo." },
      { status: 400 }
    );
  }

  const emailServerId = body.email_server_id ?? (await getActiveEmailServerId());

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
