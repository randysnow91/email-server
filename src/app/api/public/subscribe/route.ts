import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getDefaultEmailServerId } from "@/lib/emailServer";
import { isValidEmail } from "@/lib/validation";

// Public, unauthenticated (not listed in proxy.ts's matcher). Handles the
// /subscribe form. Deliberately returns no subscriber data - just a
// success flag and a message to show.
export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const { email, name } = body;

  if (!isValidEmail(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email address." },
      { status: 400 }
    );
  }

  const cleanEmail = email.trim();
  const cleanName = typeof name === "string" && name.trim() ? name.trim() : null;
  const emailServerId = await getDefaultEmailServerId();

  const { error } = await supabase.from("subscribers").insert({
    email_server_id: emailServerId,
    email: cleanEmail,
    name: cleanName,
  });

  if (!error) {
    return NextResponse.json({ success: true, message: "Thanks for subscribing!" });
  }

  // 23505 = unique_violation on (email_server_id, email): this address is
  // already on the list. If they'd previously unsubscribed, treat this as
  // a re-subscribe rather than an error.
  if (error.code === "23505") {
    const { data: existing } = await supabase
      .from("subscribers")
      .select("id, unsubscribed")
      .eq("email_server_id", emailServerId)
      .eq("email", cleanEmail)
      .single();

    if (existing?.unsubscribed) {
      const { error: reErr } = await supabase
        .from("subscribers")
        .update({ unsubscribed: false, name: cleanName })
        .eq("id", existing.id);

      if (reErr) {
        return NextResponse.json({ error: "Something went wrong. Please try again." }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        message: "Welcome back! Your subscription has been reactivated.",
      });
    }

    return NextResponse.json(
      { error: "That email address is already subscribed." },
      { status: 409 }
    );
  }

  return NextResponse.json(
    { error: "Something went wrong. Please try again." },
    { status: 500 }
  );
}
