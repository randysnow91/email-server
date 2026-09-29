import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { getEmailServerIdForApiKey } from "@/lib/issueAuth";
import { isValidIssuePayload } from "@/lib/issue-schema";
import { computeSendAfter, notifyOperatorOfDraftIssue } from "@/lib/issues";

// Not gated by proxy.ts (not under /api/manager|builder|sender) - this is
// the one endpoint meant for an external caller (the Conductor, eventually;
// by hand for now). Authenticates itself via the per-newsletter API key
// (§4.1 of this repo's R2_BUILD-SPEC.md), never the shared admin cookie.
export async function POST(request: NextRequest) {
  const emailServerId = await getEmailServerIdForApiKey(request.headers.get("x-content-api-key"));
  if (!emailServerId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  if (!isValidIssuePayload(body)) {
    return NextResponse.json(
      { error: "Invalid Issue payload - see docs/CONTENT-PIPELINE-ARCHITECTURE.md §6." },
      { status: 400 }
    );
  }

  const sendAfter = computeSendAfter(body.type, body.reviewerFlags);

  const { data, error } = await supabase
    .from("issues")
    .insert({
      email_server_id: emailServerId,
      type: body.type,
      status: "draft",
      send_after: sendAfter,
      blocks: body.rawHtml ? null : body.blocks,
      raw_html: body.rawHtml ?? null,
      reviewer_flags: body.reviewerFlags ?? [],
      created_by: "api",
    })
    .select("id, status, send_after")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const { data: server } = await supabase
    .from("email_servers")
    .select("name")
    .eq("id", emailServerId)
    .single();

  // Best-effort - doesn't block the response; the Issue is already saved.
  notifyOperatorOfDraftIssue({
    id: data.id as string,
    type: body.type,
    newsletterName: (server?.name as string) ?? "your newsletter",
  });

  return NextResponse.json(data, { status: 201 });
}
