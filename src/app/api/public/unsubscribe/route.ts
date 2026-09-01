import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Public, unauthenticated. Backs the /unsubscribe page's Confirm and
// Resubscribe buttons. Identifies the subscriber purely by the token from
// the link - no login, no other identifying info.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const token = typeof body.token === "string" ? body.token.trim() : "";
  const resubscribe = body.action === "resubscribe";

  if (!token) {
    return NextResponse.json({ error: "This link is missing its code." }, { status: 400 });
  }

  const { data: subscriber, error: lookupError } = await supabase
    .from("subscribers")
    .select("id, email")
    .eq("unsubscribe_token", token)
    .single();

  if (lookupError || !subscriber) {
    return NextResponse.json({ error: "This unsubscribe link isn't valid." }, { status: 404 });
  }

  const { error: updateError } = await supabase
    .from("subscribers")
    .update({ unsubscribed: !resubscribe })
    .eq("id", subscriber.id);

  if (updateError) {
    return NextResponse.json(
      { error: "Something went wrong. Please try again." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    email: subscriber.email,
    unsubscribed: !resubscribe,
  });
}
