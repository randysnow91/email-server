import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getActiveEmailServerId } from "@/lib/emailServer";
import { composeEmail, type SectionContentMap } from "@/lib/composeEmail";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const emailServerId = body.email_server_id ?? (await getActiveEmailServerId());

  const { data, error } = await supabase
    .from("email_sections")
    .select("section_type, content")
    .eq("email_server_id", emailServerId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const sections: SectionContentMap = {};
  for (const row of data) {
    sections[row.section_type as keyof SectionContentMap] = row.content ?? "";
  }

  return NextResponse.json(composeEmail(sections));
}
