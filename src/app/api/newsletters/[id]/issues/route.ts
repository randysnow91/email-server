import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getEmailServerIdForApiKey } from "@/lib/issueAuth";

// Not proxy-gated - for the Conductor's weekly run (architecture doc §8):
// fetch the week's sent daily Issues to hand to Content Builder as
// weekContent. Same per-newsletter key as POST /api/issues.
//
// GET /api/newsletters/:id/issues?type=daily&status=sent&since=2026-09-22
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const emailServerId = await getEmailServerIdForApiKey(request.headers.get("x-content-api-key"));

  if (!emailServerId || emailServerId !== id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const params_ = request.nextUrl.searchParams;
  let query = supabase
    .from("issues")
    .select("id, type, status, blocks, raw_html, created_at")
    .eq("email_server_id", id)
    .order("created_at", { ascending: true });

  const type = params_.get("type");
  if (type === "daily" || type === "weekly") query = query.eq("type", type);

  const status = params_.get("status");
  if (status) query = query.eq("status", status);

  const since = params_.get("since");
  if (since) query = query.gte("created_at", since);

  const { data, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ issues: data });
}
