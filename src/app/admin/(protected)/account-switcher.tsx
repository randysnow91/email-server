"use client";

import { useState } from "react";
import type { EmailServer } from "@/lib/emailServer";

// The newsletter picker in the admin nav. Switching does a full page reload
// (not just router.refresh()) so that client-rendered pages - Subscribers,
// Builder, Send, History - re-fetch against the newly-active newsletter too,
// not only the server components.
export default function AccountSwitcher({
  accounts,
  activeId,
}: {
  accounts: EmailServer[];
  activeId: string;
}) {
  const [switching, setSwitching] = useState(false);

  if (accounts.length <= 1) {
    // Nothing to switch between - just show which newsletter you're in.
    return (
      <span className="text-sm text-gray-500">
        {accounts[0]?.name ?? "AI PM Perspective"}
      </span>
    );
  }

  async function handleChange(id: string) {
    if (id === activeId) return;
    setSwitching(true);
    try {
      await fetch("/api/manager/accounts/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      window.location.reload();
    } catch {
      setSwitching(false);
    }
  }

  return (
    <select
      value={activeId}
      disabled={switching}
      onChange={(e) => handleChange(e.target.value)}
      aria-label="Active newsletter"
      className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm text-gray-800 focus:border-gray-500 focus:outline-none disabled:opacity-50"
    >
      {accounts.map((a) => (
        <option key={a.id} value={a.id}>
          {a.name}
        </option>
      ))}
    </select>
  );
}
