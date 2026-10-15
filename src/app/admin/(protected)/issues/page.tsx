"use client";

import { useCallback, useEffect, useState } from "react";
import { renderIssue } from "@/lib/issueRender";
import { isValidEmail } from "@/lib/validation";
import type { ReviewerFlag } from "@/lib/issue-schema";

type IssueRow = {
  id: string;
  type: "daily" | "weekly";
  status: "draft" | "approved" | "sent" | "skipped";
  send_after: string | null;
  blocks: Parameters<typeof renderIssue>[0]["blocks"];
  raw_html: string | null;
  reviewer_flags: ReviewerFlag[] | null;
  created_at: string;
};

type PreviewData = {
  subject: string;
  html: string;
  archived?: boolean;
  sentDate?: string;
  recipientCount?: number;
  successCount?: number;
  failedCount?: number;
};

type SendResult = {
  recipient_count: number;
  success_count: number;
  failed_count: number;
  errors: string[];
};

const TEST_EMAIL_KEY = "emailserver.testSendAddress";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

const FLAG_LABEL: Record<ReviewerFlag["type"], string> = {
  broken_link: "Broken link",
  inaccurate_summary: "Summary may not match the article",
  practice_alignment: "PM Perspective may not align with a practice",
};

const STATUS_BADGE: Record<IssueRow["status"], string> = {
  draft: "bg-amber-100 text-amber-700",
  approved: "bg-blue-100 text-blue-700",
  sent: "bg-green-100 text-green-700",
  skipped: "bg-gray-100 text-gray-600",
};

export default function IssuesPage() {
  const [issues, setIssues] = useState<IssueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Per Issue type, since a daily and a weekly reach different subscribers
  // (fetchActiveSubscribers / preferencesFor in sendEmail.ts).
  const [subscriberCounts, setSubscriberCounts] = useState<{ daily: number; weekly: number } | null>(
    null
  );

  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);

  const [testEmail, setTestEmail] = useState("");
  const [testing, setTesting] = useState(false);
  const [testMessage, setTestMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [result, setResult] = useState<{ issueId: string; data: SendResult } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [issuesRes, dailyRes, weeklyRes] = await Promise.all([
        fetch("/api/manager/issues"),
        fetch("/api/manager/subscribers?limit=1&issue_type=daily"),
        fetch("/api/manager/subscribers?limit=1&issue_type=weekly"),
      ]);
      if (!issuesRes.ok) throw new Error((await issuesRes.json()).error ?? "Failed to load issues.");
      const issuesData = await issuesRes.json();
      setIssues(issuesData.issues ?? []);

      if (dailyRes.ok && weeklyRes.ok) {
        const [dailyData, weeklyData] = await Promise.all([dailyRes.json(), weeklyRes.json()]);
        setSubscriberCounts({ daily: dailyData.total ?? 0, weekly: weeklyData.total ?? 0 });
      }
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load issues.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
    try {
      const saved = localStorage.getItem(TEST_EMAIL_KEY);
      if (saved) setTestEmail(saved);
    } catch {
      // localStorage unavailable - just start blank.
    }
  }, [load]);

  async function loadPreview(id: string) {
    setPreview(null);
    setPreviewError(null);
    setPreviewLoading(true);
    try {
      const res = await fetch(`/api/manager/issues/${id}/preview`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to build preview.");
      setPreview(data);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to build preview.");
    } finally {
      setPreviewLoading(false);
    }
  }

  function toggleExpand(issue: IssueRow) {
    if (expandedId === issue.id) {
      setExpandedId(null);
      setEditing(false);
      return;
    }
    setExpandedId(issue.id);
    setEditing(false);
    setTestMessage(null);
    loadPreview(issue.id);
  }

  function openEdit(issue: IssueRow) {
    setEditValue(renderIssue({ blocks: issue.blocks, rawHtml: issue.raw_html }));
    setEditError(null);
    setEditing(true);
  }

  async function handleSaveEdit(id: string) {
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/manager/issues/${id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawHtml: editValue }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save edit.");
      setEditing(false);
      await load();
      await loadPreview(id);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save edit.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleRevert(id: string) {
    if (!confirm("Discard your edits and go back to the originally generated content?")) return;
    setEditSaving(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/manager/issues/${id}/edit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawHtml: null }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to revert.");
      setEditing(false);
      await load();
      await loadPreview(id);
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to revert.");
    } finally {
      setEditSaving(false);
    }
  }

  async function handleTestSend(id: string) {
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
      // Ignore.
    }
    try {
      const res = await fetch(`/api/manager/issues/${id}/test-send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ test_email: address }),
      });
      const data = await res.json();
      if (!res.ok || data.success === false) {
        throw new Error(data.error ?? "Test send failed.");
      }
      setTestMessage({ ok: true, text: `Test sent to ${address} — check your inbox (and spam).` });
    } catch (err) {
      setTestMessage({ ok: false, text: err instanceof Error ? err.message : "Test send failed." });
    } finally {
      setTesting(false);
    }
  }

  async function handleSend(id: string) {
    setActingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/manager/issues/${id}/send`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Send failed.");
      setResult({ issueId: id, data });
      setConfirmingId(null);
      await load();
      await loadPreview(id);
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Send failed.");
    } finally {
      setActingId(null);
    }
  }

  async function handleSkip(id: string) {
    if (!confirm("Skip this draft? It won't be sent.")) return;
    setActingId(id);
    setActionError(null);
    try {
      const res = await fetch(`/api/manager/issues/${id}/skip`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to skip.");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to skip.");
    } finally {
      setActingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Issues</h1>
        <p className="text-sm text-gray-500">
          Content generated by Content Builder lands here as a draft. Review, edit
          if needed, send yourself a test, then approve to send. Every issue —
          sent or skipped too — stays here to look back on.
        </p>
      </div>

      {loadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      )}
      {actionError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : issues.length === 0 ? (
        <p className="text-sm text-gray-500">No issues yet.</p>
      ) : (
        <ul className="space-y-3">
          {issues.map((issue) => {
            const flags = issue.reviewer_flags ?? [];
            const isExpanded = expandedId === issue.id;
            const isDraft = issue.status === "draft";
            const isConfirming = confirmingId === issue.id;
            const isActing = actingId === issue.id;
            const hasOverride = Boolean(issue.raw_html);
            const subscriberCount = subscriberCounts?.[issue.type] ?? null;

            return (
              <li
                key={issue.id}
                className="overflow-hidden rounded-lg border border-gray-200 bg-white"
              >
                <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {issue.type === "daily" ? "Daily" : "Weekly"}
                      <span
                        className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_BADGE[issue.status]}`}
                      >
                        {issue.status}
                      </span>
                      {flags.length > 0 && (
                        <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                          {flags.length} flag{flags.length === 1 ? "" : "s"}
                        </span>
                      )}
                      {hasOverride && (
                        <span className="ml-2 rounded-full bg-purple-100 px-2 py-0.5 text-xs font-medium text-purple-700">
                          Edited
                        </span>
                      )}
                    </p>
                    <p className="text-sm text-gray-500">
                      Created {formatDate(issue.created_at)}
                      {isDraft && issue.send_after && (
                        <> · auto-sends {formatDate(issue.send_after)} if not reviewed</>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleExpand(issue)}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
                  >
                    {isExpanded ? "Hide" : isDraft ? "Review" : "View"}
                  </button>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 px-4 py-4">
                    {flags.length > 0 && (
                      <div className="mb-4 rounded-md bg-red-50 p-3">
                        <p className="mb-1 text-sm font-medium text-red-800">Reviewer flags</p>
                        <ul className="list-disc space-y-1 pl-5 text-sm text-red-700">
                          {flags.map((flag, i) => (
                            <li key={i}>
                              <strong>{FLAG_LABEL[flag.type] ?? flag.type}:</strong> {flag.message}{" "}
                              <a
                                href={flag.articleUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="underline"
                              >
                                (article)
                              </a>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {previewLoading ? (
                      <p className="text-sm text-gray-500">Building preview...</p>
                    ) : previewError ? (
                      <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">
                        {previewError}
                      </p>
                    ) : preview ? (
                      <>
                        {preview.archived ? (
                          <p className="mb-2 text-xs text-gray-500">
                            Archived copy of what was actually sent{" "}
                            {preview.sentDate && `on ${formatDate(preview.sentDate)}`} —{" "}
                            {preview.successCount}/{preview.recipientCount} delivered. The
                            greeting and unsubscribe link show as placeholders here; Mailgun
                            filled those in per recipient at send time.
                          </p>
                        ) : (
                          <p className="mb-2 text-xs text-gray-500">
                            Live preview, composed from the current template.
                          </p>
                        )}
                        <div className="overflow-hidden rounded-lg border border-gray-200">
                          <div className="border-b border-gray-100 bg-gray-50 px-3 py-2">
                            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                              Preview
                            </p>
                            <p className="truncate text-sm font-medium text-gray-900">
                              {preview.subject}
                            </p>
                          </div>
                          <iframe
                            sandbox="allow-popups allow-popups-to-escape-sandbox"
                            srcDoc={`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font-family:system-ui,sans-serif;padding:16px;margin:0;color:#111827;line-height:1.5;}</style></head><body>${preview.html}</body></html>`}
                            title="Issue preview"
                            className="h-[500px] w-full border-0"
                          />
                        </div>
                      </>
                    ) : null}

                    {isDraft && (
                      <div className="mt-4 space-y-4">
                        {/* Edit */}
                        {!editing ? (
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              onClick={() => openEdit(issue)}
                              className="text-sm font-medium text-blue-600 hover:underline"
                            >
                              Edit before sending
                            </button>
                            {hasOverride && (
                              <button
                                type="button"
                                onClick={() => handleRevert(issue.id)}
                                disabled={editSaving}
                                className="text-sm font-medium text-gray-500 hover:underline disabled:opacity-50"
                              >
                                Revert to generated content
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="space-y-2 rounded-md border border-gray-200 bg-gray-50 p-3">
                            <label className="text-xs text-gray-500">
                              Edit the HTML for this issue&apos;s content, then save.
                            </label>
                            <textarea
                              value={editValue}
                              onChange={(e) => setEditValue(e.target.value)}
                              rows={10}
                              className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-xs focus:border-gray-500 focus:outline-none"
                            />
                            {editError && <p className="text-sm text-red-600">{editError}</p>}
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => handleSaveEdit(issue.id)}
                                disabled={editSaving}
                                className="rounded-md bg-gray-900 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                              >
                                {editSaving ? "Saving..." : "Save Edit"}
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditing(false)}
                                disabled={editSaving}
                                className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}

                        {/* Test send */}
                        <div className="rounded-md border border-gray-200 p-3">
                          <p className="mb-2 text-sm font-medium text-gray-900">Send a test</p>
                          <form
                            onSubmit={(e) => {
                              e.preventDefault();
                              handleTestSend(issue.id);
                            }}
                            className="flex flex-col gap-2 sm:flex-row"
                          >
                            <input
                              type="email"
                              value={testEmail}
                              onChange={(e) => setTestEmail(e.target.value)}
                              placeholder="you@example.com"
                              className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none"
                            />
                            <button
                              type="submit"
                              disabled={testing || !testEmail.trim()}
                              className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
                            >
                              {testing ? "Sending..." : "Send Test"}
                            </button>
                          </form>
                          {testMessage && (
                            <p
                              className={`mt-2 text-sm ${testMessage.ok ? "text-green-700" : "text-red-600"}`}
                            >
                              {testMessage.text}
                            </p>
                          )}
                        </div>

                        {/* Approve & send / skip */}
                        <div className="flex flex-wrap items-center gap-3">
                          {!isConfirming ? (
                            <>
                              <button
                                type="button"
                                onClick={() => setConfirmingId(issue.id)}
                                disabled={isActing}
                                className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                              >
                                Approve &amp; Send to {subscriberCount ?? 0} subscriber
                                {subscriberCount === 1 ? "" : "s"}
                              </button>
                              <button
                                type="button"
                                onClick={() => handleSkip(issue.id)}
                                disabled={isActing}
                                className="rounded-md border border-red-200 px-4 py-2 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                {isActing ? "Working..." : "Skip"}
                              </button>
                            </>
                          ) : (
                            <div className="w-full space-y-3 rounded-md border border-gray-300 bg-gray-50 p-3">
                              <p className="text-sm text-gray-800">
                                Send this to{" "}
                                <span className="font-semibold">
                                  {subscriberCount ?? 0} subscriber
                                  {subscriberCount === 1 ? "" : "s"}
                                </span>
                                ? This can&apos;t be undone.
                              </p>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleSend(issue.id)}
                                  disabled={isActing}
                                  className="flex-1 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                                >
                                  {isActing ? "Sending..." : "Confirm Send"}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setConfirmingId(null)}
                                  disabled={isActing}
                                  className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700"
                                >
                                  Cancel
                                </button>
                              </div>
                            </div>
                          )}
                        </div>

                        {result && result.issueId === issue.id && (
                          <div className="rounded-md border border-gray-200 bg-white p-3 text-sm">
                            <p className="font-medium text-gray-900">Send complete</p>
                            <p className="text-green-700">
                              {result.data.success_count} accepted by Mailgun
                            </p>
                            {result.data.failed_count > 0 && (
                              <p className="text-red-600">{result.data.failed_count} rejected</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
