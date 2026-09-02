"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Account = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

export default function NewslettersPage() {
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [activeId, setActiveId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [switchingId, setSwitchingId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/manager/accounts");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load newsletters.");
      const data = await res.json();
      setAccounts(data.accounts ?? []);
      setActiveId(data.activeId ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load newsletters.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function handleCreate(e: FormEvent) {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      const res = await fetch("/api/manager/accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, description: description || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to create newsletter.");
      // The new newsletter is now active (the API set the cookie). Full
      // reload so the nav switcher and every other view pick it up.
      window.location.reload();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create newsletter.");
      setCreating(false);
    }
  }

  async function handleSwitch(id: string) {
    setSwitchingId(id);
    try {
      const res = await fetch("/api/manager/accounts/select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to switch newsletter.");
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to switch newsletter.");
      setSwitchingId(null);
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Newsletters</h1>
        <p className="text-sm text-gray-500">
          Each newsletter has its own subscribers, sections, and send history. The
          active one is what every other admin page works on.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : (
        <ul className="space-y-3">
          {accounts.map((account) => {
            const isActive = account.id === activeId;
            return (
              <li
                key={account.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white p-4"
              >
                <div>
                  <p className="font-medium text-gray-900">
                    {account.name}
                    {isActive && (
                      <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700">
                        Active
                      </span>
                    )}
                  </p>
                  {account.description && (
                    <p className="text-sm text-gray-500">{account.description}</p>
                  )}
                  <p className="text-xs text-gray-400">
                    Created {new Date(account.created_at).toLocaleDateString()}
                  </p>
                </div>
                {!isActive && (
                  <button
                    type="button"
                    onClick={() => handleSwitch(account.id)}
                    disabled={switchingId !== null}
                    className="rounded-md border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                  >
                    {switchingId === account.id ? "Switching..." : "Switch to"}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <h2 className="text-sm font-medium text-gray-900">New newsletter</h2>
        <form onSubmit={handleCreate} className="mt-3 space-y-3">
          <input
            type="text"
            required
            value={name}
            disabled={creating}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name (e.g. Dog Rescue)"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none disabled:opacity-50"
          />
          <input
            type="text"
            value={description}
            disabled={creating}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description (optional)"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none disabled:opacity-50"
          />
          {createError && <p className="text-sm text-red-600">{createError}</p>}
          <button
            type="submit"
            disabled={creating || !name.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {creating ? "Creating..." : "Create newsletter"}
          </button>
        </form>
        <p className="mt-3 text-xs text-gray-400">
          Newsletters can&apos;t be edited or deleted from here in V1. The public
          signup form always adds people to the primary (first) newsletter.
        </p>
      </div>
    </div>
  );
}
