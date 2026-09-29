import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { composeIssueForSend } from "@/lib/issues";
import { fetchActiveSubscribers, logSendHistory } from "@/lib/sendEmail";
import { sendBatch } from "@/lib/mailgun";

// Admin-gated (proxy.ts). "Approve & Send" for one Issue - the operator's
// equivalent of /api/sender/send, but composing from an Issue's blocks
// instead of the manually-edited main_body section.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: issue, error: fetchError } = await supabase
    .from("issues")
    .select("id, email_server_id, status, blocks, raw_html")
    .eq("id", id)
    .single();

  if (fetchError || !issue) {
    return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  }
  if (issue.status === "sent") {
    return NextResponse.json({ error: "This Issue has already been sent." }, { status: 409 });
  }

  let composed;
  try {
    composed = await composeIssueForSend(issue.email_server_id, issue);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compose email." },
      { status: 500 }
    );
  }

  let subscribers;
  try {
    subscribers = await fetchActiveSubscribers(issue.email_server_id);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch subscribers." },
      { status: 500 }
    );
  }

  const result = await sendBatch(subscribers, composed.subject, composed.html);

  const history = await logSendHistory({
    emailServerId: issue.email_server_id,
    isTest: false,
    result,
    htmlSnapshot: composed.html,
    issueId: issue.id,
  });

  await supabase.from("issues").update({ status: "sent" }).eq("id", issue.id);

  return NextResponse.json({
    send_id: history.id,
    status: history.status,
    recipient_count: result.recipientCount,
    success_count: result.successCount,
    failed_count: result.failedCount,
    errors: result.errors,
  });
}
