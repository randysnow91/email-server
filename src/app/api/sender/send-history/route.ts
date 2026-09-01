import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveEmailServerId } from "@/lib/emailServer";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const emailServerId = params.get("email_server_id") ?? (await getActiveEmailServerId());
  const limit = Math.min(Number(params.get("limit")) || DEFAULT_LIMIT, MAX_LIMIT);

  const { data, error } = await supabase
    .from("send_history")
    .select("id, sent_date, is_test, recipient_count, success_count, failed_count, status, error_message")
    .eq("email_server_id", emailServerId)
    .order("sent_date", { ascending: false })
    .limit(limit);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ history: data });
}
