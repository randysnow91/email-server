import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Admin-gated (proxy.ts). Lets the operator fix something before sending -
// a bad link, a Reviewer-flagged line - without needing a structured
// block editor. Reuses the raw_html escape hatch (architecture doc §6.3):
// once set, renderIssue() uses it verbatim instead of the generated
// blocks. The original blocks are left untouched in the row, so "Revert
// to generated" (rawHtml: null) always recovers the original.
//
// Body: { rawHtml: string | null }
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (body.rawHtml !== null && typeof body.rawHtml !== "string") {
    return NextResponse.json(
      { error: "rawHtml must be a string, or null to revert to the generated content." },
      { status: 400 }
    );
  }

  const { data: issue, error: fetchError } = await supabase
    .from("issues")
    .select("id, status")
    .eq("id", id)
    .single();

  if (fetchError || !issue) {
    return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  }
  if (issue.status !== "draft") {
    return NextResponse.json(
      { error: "Only a draft Issue can be edited." },
      { status: 409 }
    );
  }

  const { error } = await supabase
    .from("issues")
    .update({ raw_html: body.rawHtml })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
