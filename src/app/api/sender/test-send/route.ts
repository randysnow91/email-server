import { NextRequest, NextResponse } from "next/server";
import { getActiveEmailServerId } from "@/lib/emailServer";
import { composeForSend, logSendHistory, MissingMainBodyError } from "@/lib/sendEmail";
import { sendBatch } from "@/lib/mailgun";
import { isValidEmail } from "@/lib/validation";
import { domainCanReceiveEmail } from "@/lib/emailDomain";

export async function POST(request: NextRequest) {
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

  const emailServerId = body.email_server_id ?? (await getActiveEmailServerId());

  let composed;
  try {
    composed = await composeForSend(emailServerId);
  } catch (err) {
    if (err instanceof MissingMainBodyError) {
      return NextResponse.json({ error: err.message }, { status: 400 });
    }
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to compose email." },
      { status: 500 }
    );
  }

  // Not a real subscriber, so no name to personalize with - mailgun.ts falls
  // back to "there" the same way it would for a subscriber with no name set.
  const result = await sendBatch(
    [{ email: body.test_email, name: null }],
    composed.subject,
    composed.html
  );

  await logSendHistory({ emailServerId, isTest: true, result });

  if (result.failedCount > 0) {
    return NextResponse.json(
      { success: false, error: result.errors[0] ?? "Send failed." },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true });
}
