import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getEmailServerIdForApiKey } from "@/lib/issueAuth";

// Not proxy-gated - for the Conductor (architecture doc §7's "GET newsletter
// config"). Same per-newsletter key as POST /api/issues; the :id in the URL
// must match what the key resolves to, so a key can't be used to read a
// different newsletter's config.
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const emailServerId = await getEmailServerIdForApiKey(request.headers.get("x-content-api-key"));

  if (!emailServerId || emailServerId !== id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase
    .from("email_servers")
    .select("topics, voice")
    .eq("id", id)
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
