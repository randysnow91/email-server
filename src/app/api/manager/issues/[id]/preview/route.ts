import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { composeIssuePreview } from "@/lib/issues";

// Admin-gated (proxy.ts). Composes Template + this Issue for the review
// page's iframe preview - the same composeEmail() the real send uses, just
// without a real recipient's unsubscribe token (mirrors /api/builder/preview).
//
// For a *sent* Issue, returns the archived html_snapshot from send_history
// instead of re-composing live - that's the exact bytes that actually went
// out, which can differ from a live re-compose if the Template (header,
// footer, etc.) changed since. Falls back to a live compose if no snapshot
// is found (e.g. an old row from before html_snapshot existed).
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const { data: issue, error } = await supabase
    .from("issues")
    .select("email_server_id, blocks, raw_html, status")
    .eq("id", id)
    .single();

  if (error || !issue) {
    return NextResponse.json({ error: "Issue not found." }, { status: 404 });
  }

  try {
    const composed = await composeIssuePreview(issue.email_server_id, issue);

    if (issue.status === "sent") {
      const { data: sendRow } = await supabase
        .from("send_history")
        .select("html_snapshot, sent_date, recipient_count, success_count, failed_count")
        .eq("issue_id", id)
        .order("sent_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (sendRow?.html_snapshot) {
        return NextResponse.json({
          subject: composed.subject,
          html: sendRow.html_snapshot,
          archived: true,
          sentDate: sendRow.sent_date,
          recipientCount: sendRow.recipient_count,
          successCount: sendRow.success_count,
          failedCount: sendRow.failed_count,
        });
      }
    }

    return NextResponse.json({ ...composed, archived: false });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compose preview." },
      { status: 500 }
    );
  }
}
