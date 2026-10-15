import { supabase } from "@/lib/supabase";
import { composeEmail, type SectionContentMap } from "@/lib/composeEmail";
import { renderIssue, issueDateFrom } from "@/lib/issueRender";
import { withGreeting, sendNotification } from "@/lib/mailgun";
import { appOrigin } from "@/lib/appUrl";
import type { IssuePayload, ReviewerFlag } from "@/lib/issue-schema";

// Mailgun fills this token in per recipient from the recipient-variables
// sent with the batch (see mailgun.ts's sendBatch); composeEmail drops it
// into the footer's unsubscribe link href. Mirrors sendEmail.ts's own
// composeForSend - both need the exact same token.
const MAILGUN_UNSUBSCRIBE_TOKEN = "%recipient.unsubscribe_url%";

export type IssueRow = {
  id: string;
  email_server_id: string;
  type: "daily" | "weekly";
  status: "draft" | "approved" | "sent" | "skipped";
  send_after: string | null;
  blocks: IssuePayload["blocks"] | null;
  raw_html: string | null;
  reviewer_flags: ReviewerFlag[] | null;
  created_at: string;
  created_by: string | null;
};

// A daily Issue with no unresolved Reviewer flags gets a send_after 4 hours
// out - "if it hasn't gone out by then, send it" (architecture doc §9). A
// weekly, or any Issue carrying flags, gets none: always requires a human.
const AUTO_SEND_WINDOW_MS = 4 * 60 * 60 * 1000;

export function computeSendAfter(
  type: "daily" | "weekly",
  reviewerFlags: ReviewerFlag[] | undefined
): string | null {
  if (type !== "daily") return null;
  if (reviewerFlags && reviewerFlags.length > 0) return null;
  return new Date(Date.now() + AUTO_SEND_WINDOW_MS).toISOString();
}

// Where each article card's "Disagree with this take?" mailto goes
// (architecture doc §11.3, V1 of the feedback loop). Its own setting
// because, unlike OPERATOR_EMAIL, it's shown to every subscriber; falls
// back to OPERATOR_EMAIL so the link still works if it isn't set. null =
// neither set, and the renderer leaves the Disagree link off.
export function feedbackEmail(): string | null {
  return process.env.FEEDBACK_EMAIL || process.env.OPERATOR_EMAIL || null;
}

// Composes Template (existing email_sections, minus main_body) + this
// Issue's rendered blocks into the final email - the same composeEmail()
// the manual Builder/Send flow uses, just with main_body substituted for
// the Issue's HTML instead of a hand-typed section. This is the whole
// integration: composeEmail() doesn't need to know or care where its
// main_body string came from.
export async function composeIssueForSend(
  emailServerId: string,
  issue: Pick<IssueRow, "blocks" | "raw_html" | "created_at">
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

  sectionMap.main_body = renderIssue(
    { blocks: issue.blocks, rawHtml: issue.raw_html },
    { feedbackEmail: feedbackEmail(), issueDate: issueDateFrom(issue.created_at) }
  );

  const { subject, html } = composeEmail(sectionMap, {
    unsubscribeUrl: MAILGUN_UNSUBSCRIBE_TOKEN,
  });
  return { subject, html: withGreeting(html) };
}

// Same composition, but for the admin preview - no per-recipient token,
// just "#" (composeEmail's own default), matching how the Builder/Send
// pages preview a manual send.
export async function composeIssuePreview(
  emailServerId: string,
  issue: Pick<IssueRow, "blocks" | "raw_html" | "created_at">
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

  sectionMap.main_body = renderIssue(
    { blocks: issue.blocks, rawHtml: issue.raw_html },
    { feedbackEmail: feedbackEmail(), issueDate: issueDateFrom(issue.created_at) }
  );

  return composeEmail(sectionMap);
}

// "A draft Issue is ready to review" - sent once, on ingestion (architecture
// doc §9). Best-effort: a notification failure shouldn't fail the ingestion
// itself, since the Issue is already safely stored either way.
export async function notifyOperatorOfDraftIssue(issue: {
  id: string;
  type: "daily" | "weekly";
  newsletterName: string;
}): Promise<void> {
  const operatorEmail = process.env.OPERATOR_EMAIL;
  if (!operatorEmail) {
    console.error("OPERATOR_EMAIL is not set - skipping draft Issue notification.");
    return;
  }

  const reviewUrl = `${appOrigin()}/admin/issues`;
  const subject = `${issue.newsletterName}: a ${issue.type} draft is ready to review`;
  const html =
    `<p>A new ${issue.type} draft is ready for ${issue.newsletterName}.</p>` +
    `<p><a href="${reviewUrl}">Review it in the admin</a>.</p>`;

  try {
    await sendNotification(operatorEmail, subject, html);
  } catch (err) {
    console.error("Failed to send draft-Issue notification:", err);
  }
}
