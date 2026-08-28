import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();

  if (typeof body.content !== "string") {
    return NextResponse.json({ error: "content must be a string." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("email_sections")
    .update({ content: body.content, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select("id, section_type, content, updated_at")
    .single();

  // PGRST116 = "no rows returned" - .single() reports a missing row as an
  // error rather than {data: null} (same gotcha hit in M1's subscriber routes).
  if (error?.code === "PGRST116") {
    return NextResponse.json({ error: "Section not found." }, { status: 404 });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const { error } = await supabase
    .from("email_sections")
    .delete()
    .eq("id", id)
    .select("id")
    .single();

  if (error?.code === "PGRST116") {
    return NextResponse.json({ error: "Section not found." }, { status: 404 });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
