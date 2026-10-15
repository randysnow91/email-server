import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveEmailServerId } from "@/lib/emailServer";
import { feedbackEmail } from "@/lib/issues";

// Admin-gated (proxy.ts covers /api/manager/*). Lists Issues for the active
// newsletter, most recent first, for the /admin/issues review page.
export async function GET() {
  const emailServerId = await getActiveEmailServerId();

  const { data, error } = await supabase
    .from("issues")
    .select("id, type, status, send_after, blocks, raw_html, reviewer_flags, created_at")
    .eq("email_server_id", emailServerId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // feedback_email: the admin page renders an Issue in the browser to seed
  // its editor, where FEEDBACK_EMAIL isn't available - without this, a
  // hand-edit would silently drop every card's Disagree link.
  return NextResponse.json({ issues: data, feedback_email: feedbackEmail() });
}
