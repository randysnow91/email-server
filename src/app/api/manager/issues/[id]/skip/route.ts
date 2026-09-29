import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Admin-gated (proxy.ts). Marks a draft Issue as skipped - it won't be
// offered for auto-send and drops out of the review list's pending view.
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data, error } = await supabase
    .from("issues")
    .update({ status: "skipped", send_after: null })
    .eq("id", id)
    .select("id")
    .single();

  if (error?.code === "PGRST116") {
    return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  }
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: data.id });
}
