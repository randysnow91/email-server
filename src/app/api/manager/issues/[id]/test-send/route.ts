import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { composeIssueForSend } from "@/lib/issues";
import { logSendHistory } from "@/lib/sendEmail";
import { sendBatch } from "@/lib/mailgun";
import { isValidEmail } from "@/lib/validation";
import { domainCanReceiveEmail } from "@/lib/emailDomain";

// Admin-gated (proxy.ts). The Issues-tab equivalent of /api/sender/test-send -
// composes from this Issue's own content (whatever's currently rendered,
// including any edit override) rather than the manually-edited main_body
// section, so what you test IS what Approve & Send would actually send.
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await request.json().catch(() => ({}));

  if (!isValidEmail(body.test_email)) {
    return NextResponse.json({ error: "A valid test_email is required." }, { status: 400 });
  }
  if (!(await domainCanReceiveEmail(body.test_email))) {
    return NextResponse.json(
      { error: "That email domain can't receive mail - check for a typo." },
      { status: 400 }
    );
  }

  const { data: issue, error: fetchError } = await supabase
    .from("issues")
    .select("id, email_server_id, blocks, raw_html, created_at")
    .eq("id", id)
    .single();

  if (fetchError || !issue) {
    return NextResponse.json({ error: "Issue not found." }, { status: 404 });
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

  // Not a real subscriber, so no name to personalize with - mailgun.ts falls
  // back to "there", same as the manual test-send.
  const result = await sendBatch(
    [{ email: body.test_email, name: null }],
    composed.subject,
    composed.html
  );

  await logSendHistory({
    emailServerId: issue.email_server_id,
    isTest: true,
    result,
    htmlSnapshot: composed.html,
    issueId: issue.id,
  });

  if (result.failedCount > 0) {
    return NextResponse.json(
      { success: false, error: result.errors[0] ?? "Send failed." },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
