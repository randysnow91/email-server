import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

const VALID_PREFERENCES = ["daily", "weekly", "both"];

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const body = await request.json();
  const update: Record<string, string | null> = {};

  if ("name" in body) {
    update.name = typeof body.name === "string" && body.name.trim() ? body.name.trim() : null;
  }

  if ("subscription_preference" in body) {
    if (!VALID_PREFERENCES.includes(body.subscription_preference)) {
      return NextResponse.json(
        { error: `subscription_preference must be one of: ${VALID_PREFERENCES.join(", ")}` },
        { status: 400 }
      );
    }
    update.subscription_preference = body.subscription_preference;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("subscribers")
    .update(update)
    .eq("id", id)
    .select("id, email, name, subscription_preference, created_at, unsubscribed")
    .single();

  // PGRST116 = "no rows returned" - .single() reports a missing row as an
  // error rather than {data: null}, so it needs its own 404 branch.
  if (error?.code === "PGRST116") {
    return NextResponse.json({ error: "Subscriber not found." }, { status: 404 });
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
    .from("subscribers")
    .delete()
    .eq("id", id)
    .select("id")
    .single();

  if (error?.code === "PGRST116") {
    return NextResponse.json({ error: "Subscriber not found." }, { status: 404 });
  }

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
