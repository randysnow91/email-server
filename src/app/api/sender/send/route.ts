import { NextRequest, NextResponse } from "next/server";
import { getActiveEmailServerId } from "@/lib/emailServer";
import {
  composeForSend,
  fetchActiveSubscribers,
  logSendHistory,
  MissingMainBodyError,
} from "@/lib/sendEmail";
import { sendBatch } from "@/lib/mailgun";

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
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

  let subscribers;
  try {
    subscribers = await fetchActiveSubscribers(emailServerId);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to fetch subscribers." },
      { status: 500 }
    );
  }

  const startedAt = Date.now();
  const result = await sendBatch(subscribers, composed.subject, composed.html);
  const durationMs = Date.now() - startedAt;

  const history = await logSendHistory({ emailServerId, isTest: false, result });

  return NextResponse.json({
    send_id: history.id,
    status: history.status,
    recipient_count: result.recipientCount,
    success_count: result.successCount,
    failed_count: result.failedCount,
    errors: result.errors,
    duration_ms: durationMs,
  });
}
