"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { composeEmail, type SectionType } from "@/lib/composeEmail";
import { isValidEmail } from "@/lib/validation";

type SendResult = {
  recipient_count: number;
  success_count: number;
  failed_count: number;
  errors: string[];
  duration_ms?: number;
};

type HistoryRow = {
  id: string;
  sent_date: string;
  is_test: boolean;
  recipient_count: number | null;
  success_count: number | null;
  failed_count: number | null;
  status: string;
};

const TEST_EMAIL_KEY = "emailserver.testSendAddress";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function SendPage() {
  const [content, setContent] = useState<Partial<Record<SectionType, string>>>({});
  const [subscriberCount, setSubscriberCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState<string | null>(null);
  const [result, setResult] = useState<SendResult | null>(null);

  const [history, setHistory] = useState<HistoryRow[]>([]);

  // Restore the last-used test address so it doesn't have to be retyped.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(TEST_EMAIL_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect
      if (saved) setTestEmail(saved);
    } catch {
      // localStorage unavailable (private mode etc.) - just start blank.
    }
  }, []);

  const loadHistory = useCallback(async () => {
    try {
      const res = await fetch("/api/sender/send-history?limit=15");
      if (!res.ok) return;
      const data = await res.json();
      setHistory(data.history ?? []);
    } catch {
      // Non-critical - the page still works without the history list.
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [sectionsRes, subsRes] = await Promise.all([
        fetch("/api/builder/sections"),
        fetch("/api/manager/subscribers?limit=1"),
      ]);

      if (!sectionsRes.ok) {
        throw new Error((await sectionsRes.json()).error ?? "Failed to load email content.");
      }
      const sectionsData = await sectionsRes.json();
      const map: Partial<Record<SectionType, string>> = {};
      for (const row of sectionsData.sections as {
        section_type: SectionType;
        content: string | null;
      }[]) {
        map[row.section_type] = row.content ?? "";
      }
      setContent(map);

      if (subsRes.ok) {
        const subsData = await subsRes.json();
        setSubscriberCount(subsData.total ?? 0);
      } else {
        setSubscriberCount(null);
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load the send page.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    loadHistory();
  }, [load, loadHistory]);

  const preview = useMemo(() => composeEmail(content), [content]);

  const mainBodyEmpty = !content.main_body || content.main_body.trim() === "";

  const previewDoc = useMemo(() => {
    const body = preview.html || '<p style="color:#9ca3af">Nothing to preview yet.</p>';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,sans-serif;padding:16px;margin:0;color:#111827;line-height:1.5;}</style></head><body>${body}</body></html>`;
  }, [preview.html]);

  async function handleTestSend() {
    const address = testEmail.trim();
    if (!isValidEmail(address)) {
      setTestMessage({ ok: false, text: "Enter a valid email address." });
      return;
    }
    setTesting(true);
    setTestMessage(null);
    try {
      localStorage.setItem(TEST_EMAIL_KEY, address);
    } catch {
      // Ignore - not being able to remember the address isn't fatal.
    }
    try {
      const res = await fetch("/api/sender/test-send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_email: address }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error ?? "Test send failed.");
      }
      setTestMessage({
        ok: true,
        text: `Test sent to ${address} — check your inbox (and spam).`,
      });
      loadHistory();
    } catch (err) {
      setTestMessage({
        ok: false,
        text: err instanceof Error ? err.message : "Test send failed.",
      });
    } finally {
      setTesting(false);
    }
  }

  async function handleConfirmSend() {
    setSending(true);
    setSendError(null);
    setResult(null);
    try {
      const res = await fetch("/api/sender/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? "Send failed.");
      }
      setResult(data as SendResult);
      setConfirming(false);
      loadHistory();
    } catch (err) {
      setSendError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Send Email</h1>
        <p className="text-sm text-gray-500">
          Review the email, send yourself a test, then send to your subscribers.{" "}
          <Link href="/admin/builder" className="font-medium text-blue-600 hover:underline">
            Edit content in the Builder
          </Link>
        </p>
      </div>

      {loadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
          {/* Left column: preview */}
          <div className="flex-1">
            <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                  Preview
                </p>
                <p className="mt-1 truncate text-sm font-medium text-gray-900">
                  {preview.subject || <span className="text-gray-400">(no subject)</span>}
                </p>
              </div>
              <iframe
                // Same sandbox as the Builder preview (§7.6): no scripts, no
                // same-origin access; allow-popups so links in the email
                // still open when clicked.
                sandbox="allow-popups allow-popups-to-escape-sandbox"
                srcDoc={previewDoc}
                title="Email preview"
                className="h-[500px] w-full border-0"
              />
            </div>
            <p className="mt-2 text-xs text-gray-400">
              Each subscriber&apos;s copy adds a &ldquo;Hi [name],&rdquo; greeting at the
              top and their own unsubscribe link in the footer.
            </p>
          </div>

          {/* Right column: send controls */}
          <div className="space-y-4 lg:w-[360px] lg:flex-shrink-0">
            {/* Recipient count */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm text-gray-500">Recipients</p>
              <p className="mt-1 text-2xl font-semibold text-gray-900">
                {subscriberCount === null ? "—" : subscriberCount.toLocaleString()}
              </p>
              <p className="text-xs text-gray-400">
                Active subscribers (unsubscribed excluded)
              </p>
            </div>

            {mainBodyEmpty && (
              <p className="rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-800">
                The Main Body section is empty. Add content in the{" "}
                <Link href="/admin/builder" className="font-medium underline">
                  Builder
                </Link>{" "}
                before sending.
              </p>
            )}

            {/* Test send */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm font-medium text-gray-900">Send a test</p>
              <p className="mb-2 text-xs text-gray-500">
                Delivers one copy to this address. Not counted as a real send.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleTestSend();
                }}
              >
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={testing || !testEmail.trim() || mainBodyEmpty}
                  className="mt-2 w-full rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                >
                  {testing ? "Sending test..." : "Send Test"}
                </button>
              </form>
              {testMessage && (
                <p
                  className={`mt-2 text-sm ${
                    testMessage.ok ? "text-green-700" : "text-red-600"
                  }`}
                >
                  {testMessage.text}
                </p>
              )}
            </div>

            {/* Real send */}
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <p className="text-sm font-medium text-gray-900">Send to subscribers</p>

              {!confirming ? (
                <button
                  type="button"
                  onClick={() => {
                    setConfirming(true);
                    setSendError(null);
                    setResult(null);
                  }}
                  disabled={mainBodyEmpty || !subscriberCount}
                  className="mt-2 w-full rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  Send to {subscriberCount ?? 0} subscriber
                  {subscriberCount === 1 ? "" : "s"}
                </button>
              ) : (
                <div className="mt-2 space-y-3 rounded-md border border-gray-300 bg-gray-50 p-3">
                  <p className="text-sm text-gray-800">
                    Send this email to{" "}
                    <span className="font-semibold">
                      {subscriberCount} subscriber{subscriberCount === 1 ? "" : "s"}
                    </span>
                    ? This can&apos;t be undone.
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={handleConfirmSend}
                      disabled={sending}
                      className="flex-1 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {sending ? "Sending..." : "Confirm Send"}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={sending}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {sendError && <p className="mt-2 text-sm text-red-600">{sendError}</p>}

              {result && (
                <div className="mt-3 rounded-md border border-gray-200 bg-white p-3 text-sm">
                  <p className="font-medium text-gray-900">Send complete</p>
                  <p className="text-green-700">{result.success_count} accepted by Mailgun</p>
                  {result.failed_count > 0 && (
                    <p className="text-red-600">{result.failed_count} rejected</p>
                  )}
                  <p className="mt-1 text-xs text-gray-400">
                    &ldquo;Accepted&rdquo; means handed to Mailgun for delivery. A bad
                    address can still bounce afterwards &mdash; bounce tracking isn&apos;t
                    in this version.
                  </p>
                  {result.errors.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-red-600">
                      {result.errors.map((e, i) => (
                        <li key={i}>{e}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Send history */}
      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent sends</h2>
          <Link
            href="/admin/history"
            className="text-sm font-medium text-blue-600 hover:underline"
          >
            View all
          </Link>
        </div>
        {history.length === 0 ? (
          <p className="text-sm text-gray-500">No sends yet.</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                  <th className="px-4 py-2 font-medium">When</th>
                  <th className="px-4 py-2 font-medium">Type</th>
                  <th className="px-4 py-2 font-medium">Recipients</th>
                  <th className="px-4 py-2 font-medium">Accepted</th>
                  <th className="px-4 py-2 font-medium">Rejected</th>
                </tr>
              </thead>
              <tbody>
                {history.map((row) => (
                  <tr key={row.id} className="border-b border-gray-50 last:border-0">
                    <td className="whitespace-nowrap px-4 py-2 text-gray-700">
                      {formatDate(row.sent_date)}
                    </td>
                    <td className="px-4 py-2">
                      {row.is_test ? (
                        <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                          Test
                        </span>
                      ) : (
                        <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
                          Send
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-2 text-gray-700">{row.recipient_count ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-700">{row.success_count ?? "—"}</td>
                    <td className="px-4 py-2 text-gray-700">
                      {row.failed_count ? (
                        <span className="text-red-600">{row.failed_count}</span>
                      ) : (
                        (row.failed_count ?? "—")
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
