import { supabase } from "@/lib/supabase";
import { composeEmail, type SectionContentMap } from "@/lib/composeEmail";
import { withGreeting, type Recipient, type BatchSendResult } from "@/lib/mailgun";
import { unsubscribeUrl } from "@/lib/appUrl";

// Mailgun fills this token in per recipient from the recipient-variables
// sent with the batch (see sendBatch); composeEmail drops it into the
// footer's unsubscribe link href.
const MAILGUN_UNSUBSCRIBE_TOKEN = "%recipient.unsubscribe_url%";

export class MissingMainBodyError extends Error {}

// Fetches this newsletter's saved sections, composes them (same logic the
// builder's preview uses), validates Main Body exists (FR-2.10), and adds
// the per-recipient greeting. Shared by /send and /test-send so they can't
// drift apart.
export async function composeForSend(
  emailServerId: string
): Promise<{ subject: string; html: string }> {
  const { data: sectionRows, error } = await supabase
    .from("email_sections")
    .select("section_type, content")
    .eq("email_server_id", emailServerId);

  if (error) throw new Error(error.message);

  const sectionMap: SectionContentMap = {};
  for (const row of sectionRows) {
    sectionMap[row.section_type as keyof SectionContentMap] = row.content ?? "";
  }

  if (!sectionMap.main_body?.trim()) {
    throw new MissingMainBodyError(
      "Main Body is empty. Add content in the Email Builder before sending."
    );
  }

  const { subject, html } = composeEmail(sectionMap, {
    unsubscribeUrl: MAILGUN_UNSUBSCRIBE_TOKEN,
  });
  return { subject, html: withGreeting(html) };
}

export async function fetchActiveSubscribers(emailServerId: string): Promise<Recipient[]> {
  const { data, error } = await supabase
    .from("subscribers")
    .select("email, name, unsubscribe_token")
    .eq("email_server_id", emailServerId)
    .eq("unsubscribed", false);

  if (error) throw new Error(error.message);

  return data.map((row) => ({
    email: row.email,
    name: row.name,
    unsubscribeUrl: unsubscribeUrl(row.unsubscribe_token),
  }));
}

export async function logSendHistory(params: {
  emailServerId: string;
  isTest: boolean;
  result: BatchSendResult;
  // R2: the exact HTML that went out, and which Issue (if any) produced it
  // (architecture doc §4.3). Optional so the manual send/test-send flows
  // don't have to change their calls.
  htmlSnapshot?: string;
  issueId?: string;
}): Promise<{ id: string | null; status: "completed" | "failed" }> {
  // "failed" only when nothing at all went out; any partial success still
  // reads as "completed" (with the errors array showing what didn't).
  const status: "completed" | "failed" =
    params.result.recipientCount > 0 && params.result.failedCount === params.result.recipientCount
      ? "failed"
      : "completed";

  const { data, error } = await supabase
    .from("send_history")
    .insert({
      email_server_id: params.emailServerId,
      is_test: params.isTest,
      recipient_count: params.result.recipientCount,
      success_count: params.result.successCount,
      failed_count: params.result.failedCount,
      status,
      error_message: params.result.errors.length ? params.result.errors.join("; ") : null,
      html_snapshot: params.htmlSnapshot ?? null,
      issue_id: params.issueId ?? null,
    })
    .select("id")
    .single();

  if (error) {
    // The send itself already happened - don't fail the response just
    // because writing the history log failed. Log server-side for visibility.
    console.error("Failed to log send_history:", error.message);
    return { id: null, status };
  }

  return { id: data.id as string, status };
}
