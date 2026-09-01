import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveEmailServerId } from "@/lib/emailServer";
import { SECTION_TYPES, type SectionType } from "@/lib/composeEmail";

const VALID_SECTION_TYPES = SECTION_TYPES.map((s) => s.type);

export async function GET(request: NextRequest) {
  const emailServerId =
    request.nextUrl.searchParams.get("email_server_id") ?? (await getActiveEmailServerId());

  const { data, error } = await supabase
    .from("email_sections")
    .select("id, section_type, content, updated_at")
    .eq("email_server_id", emailServerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ sections: data });
}

export async function POST(request: NextRequest) {
  const body = await request.json();
  const { section_type, content } = body;

  if (!VALID_SECTION_TYPES.includes(section_type as SectionType)) {
    return NextResponse.json(
      { error: `section_type must be one of: ${VALID_SECTION_TYPES.join(", ")}` },
      { status: 400 }
    );
  }

  const emailServerId = body.email_server_id ?? (await getActiveEmailServerId());

  // Upsert on (email_server_id, section_type): "Save" always means create-or-
  // update this section, never a duplicate row (schema.sql has a matching
  // unique constraint).
  const { data, error } = await supabase
    .from("email_sections")
    .upsert(
      {
        email_server_id: emailServerId,
        section_type,
        content: typeof content === "string" ? content : "",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "email_server_id,section_type" }
    )
    .select("id, section_type, content, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}
