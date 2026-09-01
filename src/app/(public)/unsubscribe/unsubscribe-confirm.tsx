"use client";

import { useState } from "react";

type View = "idle" | "unsubscribed" | "resubscribed";

export default function UnsubscribeConfirm({
  token,
  email,
  alreadyUnsubscribed,
}: {
  token: string;
  email: string;
  alreadyUnsubscribed: boolean;
}) {
  const [view, setView] = useState<View>(alreadyUnsubscribed ? "unsubscribed" : "idle");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function call(action: "unsubscribe" | "resubscribe") {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/public/unsubscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Something went wrong. Please try again.");
      setView(action === "resubscribe" ? "resubscribed" : "unsubscribed");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  if (view === "resubscribed") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-gray-900">You&apos;re subscribed again</p>
        <p className="mt-2 text-sm text-gray-600">
          {email} will keep receiving the newsletter.
        </p>
      </div>
    );
  }

  if (view === "unsubscribed") {
    return (
      <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
        <p className="text-lg font-semibold text-gray-900">You&apos;ve been unsubscribed</p>
        <p className="mt-2 text-sm text-gray-600">
          {email} will no longer receive the newsletter.
        </p>
        <p className="mt-4 text-sm text-gray-500">Changed your mind?</p>
        <button
          type="button"
          onClick={() => call("resubscribe")}
          disabled={busy}
          className="mt-2 rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          {busy ? "Working..." : "Resubscribe"}
        </button>
        {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
      <h1 className="text-xl font-semibold text-gray-900">Unsubscribe</h1>
      <p className="mt-2 text-sm text-gray-600">
        Stop sending the newsletter to <span className="font-medium">{email}</span>?
      </p>
      <button
        type="button"
        onClick={() => call("unsubscribe")}
        disabled={busy}
        className="mt-5 w-full rounded-md bg-gray-900 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-50"
      >
        {busy ? "Unsubscribing..." : "Unsubscribe"}
      </button>
      {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
    </div>
  );
}
