// Talks to Mailgun's REST API directly (a plain fetch call, not their SDK -
// this is one endpoint, not worth a new dependency). Handles the actual
// email delivery for both /api/sender/send and /api/sender/test-send.

import { unsubscribePageUrl } from "@/lib/appUrl";

// Mailgun's own hard limit on a single batch call. Chunking at this size
// keeps sendBatch() correct even if the subscriber list ever grows past it,
// without needing a rewrite later.
const MAILGUN_BATCH_LIMIT = 1000;

export type Recipient = {
  email: string;
  name?: string | null;
  // Absolute URL to this subscriber's unsubscribe page. Omitted for test
  // sends (no real subscriber, so no token) - those get a generic link.
  unsubscribeUrl?: string | null;
};

export type BatchSendResult = {
  recipientCount: number;
  successCount: number;
  failedCount: number;
  errors: string[];
};

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

type RecipientVars = { name: string; unsubscribe_url: string };

async function callMailgun(params: {
  to: string[];
  subject: string;
  html: string;
  recipientVariables: Record<string, RecipientVars>;
}): Promise<void> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const domain = process.env.MAILGUN_DOMAIN;
  const from = process.env.MAILGUN_FROM_EMAIL;
  const baseUrl = process.env.MAILGUN_API_BASE_URL || "https://api.mailgun.net";

  if (!apiKey || !domain || !from) {
    throw new Error(
      "Mailgun is not configured (MAILGUN_API_KEY, MAILGUN_DOMAIN, MAILGUN_FROM_EMAIL)."
    );
  }

  const body = new URLSearchParams();
  body.set("from", from);
  body.set("to", params.to.join(","));
  body.set("subject", params.subject);
  body.set("html", params.html);
  body.set("recipient-variables", JSON.stringify(params.recipientVariables));

  const res = await fetch(`${baseUrl}/v3/${domain}/messages`, {
    method: "POST",
    headers: {
      // Mailgun uses HTTP Basic auth with the literal username "api".
      Authorization: `Basic ${Buffer.from(`api:${apiKey}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Mailgun ${res.status}: ${text || res.statusText}`);
  }
}

// Sends one email to every recipient in one (or a few, if over Mailgun's
// per-call limit) batch API calls. Each recipient's copy shows only their
// own address - Mailgun's batch sending never exposes the "to" list between
// recipients, satisfying the privacy requirement in the same mechanism that
// satisfies the performance one.
export async function sendBatch(
  recipients: Recipient[],
  subject: string,
  html: string
): Promise<BatchSendResult> {
  if (recipients.length === 0) {
    return { recipientCount: 0, successCount: 0, failedCount: 0, errors: [] };
  }

  const batches = chunk(recipients, MAILGUN_BATCH_LIMIT);

  const results = await Promise.all(
    batches.map(async (batch) => {
      const recipientVariables: Record<string, RecipientVars> = {};
      for (const r of batch) {
        recipientVariables[r.email] = {
          name: r.name?.trim() || "there",
          unsubscribe_url: r.unsubscribeUrl?.trim() || unsubscribePageUrl(),
        };
      }

      try {
        await callMailgun({
          to: batch.map((r) => r.email),
          subject,
          html,
          recipientVariables,
        });
        return { count: batch.length, ok: true, error: null as string | null };
      } catch (err) {
        return {
          count: batch.length,
          ok: false,
          error: err instanceof Error ? err.message : "Unknown Mailgun error",
        };
      }
    })
  );

  const successCount = results.filter((r) => r.ok).reduce((sum, r) => sum + r.count, 0);
  const failedCount = results.filter((r) => !r.ok).reduce((sum, r) => sum + r.count, 0);
  const errors = results.filter((r) => r.error).map((r) => r.error as string);

  return { recipientCount: recipients.length, successCount, failedCount, errors };
}

// The greeting line prepended to every send - not part of composeEmail()'s
// output, since that's shared with the preview which has no subscriber to
// personalize for. %recipient.name% is Mailgun's own template syntax,
// filled in per-recipient from the recipient-variables sent with the batch.
export function withGreeting(html: string): string {
  const greeting =
    '<div style="margin-bottom:24px;font-size:16px;color:#111827;">Hi %recipient.name%,</div>';
  return `${greeting}\n${html}`;
}

// The unsubscribe line appended to every send. Like the greeting, it's
// added at send time (not in composeEmail()) and uses a per-recipient
// Mailgun variable so each subscriber gets a link carrying only their own
// token. Required in any real bulk email - both for compliance and so
// people who want out don't mark the mail as spam instead.
export function withUnsubscribeFooter(html: string): string {
  const footer =
    '<div style="margin-top:32px;padding-top:16px;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#9ca3af;">' +
    "You're receiving this because you subscribed. " +
    '<a href="%recipient.unsubscribe_url%" style="color:#9ca3af;">Unsubscribe</a>.' +
    "</div>";
  return `${html}\n${footer}`;
}
