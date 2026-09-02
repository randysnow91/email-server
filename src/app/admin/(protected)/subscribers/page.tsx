"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";

type Preference = "daily" | "weekly" | "both";

type Subscriber = {
  id: string;
  email: string;
  name: string | null;
  subscription_preference: Preference;
  created_at: string;
  unsubscribed: boolean;
};

const LIMIT = 50;

type StatusFilter = "active" | "unsubscribed" | "all";
const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "unsubscribed", label: "Unsubscribed" },
  { value: "all", label: "All" },
];

export default function SubscribersPage() {
  const [subscribers, setSubscribers] = useState<Subscriber[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<StatusFilter>("active");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [addError, setAddError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const [origin, setOrigin] = useState("");

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editPreference, setEditPreference] = useState<Preference>("daily");
  const [editError, setEditError] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const loadSubscribers = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const params = new URLSearchParams({
        status,
        limit: String(LIMIT),
        offset: String(offset),
      });
      const res = await fetch(`/api/manager/subscribers?${params}`);
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load subscribers.");
      const data = await res.json();
      setSubscribers(data.subscribers);
      setTotal(data.total);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load subscribers.");
    } finally {
      setLoading(false);
    }
  }, [status, offset]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setOrigin(window.location.origin);
  }, []);

  useEffect(() => {
    // Fetch on mount and whenever the filter/page changes. Safe here:
    // loadSubscribers only sets subscribers/total, neither of which is in
    // its own dependency list, so there's no re-trigger loop.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    loadSubscribers();
  }, [loadSubscribers]);

  async function handleAdd(e: FormEvent) {
    e.preventDefault();
    setAdding(true);
    setAddError(null);
    try {
      const res = await fetch("/api/manager/subscribers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: newEmail, name: newName || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to add subscriber.");
      setNewEmail("");
      setNewName("");
      setOffset(0);
      await loadSubscribers();
    } catch (err) {
      setAddError(err instanceof Error ? err.message : "Failed to add subscriber.");
    } finally {
      setAdding(false);
    }
  }

  function startEdit(subscriber: Subscriber) {
    setEditingId(subscriber.id);
    setEditName(subscriber.name ?? "");
    setEditPreference(subscriber.subscription_preference);
    setEditError(null);
  }

  async function handleSaveEdit(id: string) {
    setSavingEdit(true);
    setEditError(null);
    try {
      const res = await fetch(`/api/manager/subscribers/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: editName || null, subscription_preference: editPreference }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save changes.");
      setEditingId(null);
      await loadSubscribers();
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save changes.");
    } finally {
      setSavingEdit(false);
    }
  }

  async function handleDelete(subscriber: Subscriber) {
    if (!confirm(`Remove ${subscriber.email} from the list? This can't be undone.`)) return;
    setDeletingId(subscriber.id);
    setActionError(null);
    try {
      const res = await fetch(`/api/manager/subscribers/${subscriber.id}`, { method: "DELETE" });
      if (!res.ok) {
        throw new Error((await res.json()).error ?? "Failed to remove subscriber.");
      }
      await loadSubscribers();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Failed to remove subscriber.");
    } finally {
      setDeletingId(null);
    }
  }

  const page = Math.floor(offset / LIMIT) + 1;
  const totalPages = Math.max(1, Math.ceil(total / LIMIT));

  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Subscribers</h1>
        <p className="text-sm text-gray-500">
          {total}{" "}
          {status === "active" ? "active" : status === "unsubscribed" ? "unsubscribed" : "total"}
        </p>
        <p className="mt-2 text-sm text-gray-500">
          Public signup form:{" "}
          {origin ? (
            <a
              href={`${origin}/subscribe`}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-blue-600 hover:underline"
            >
              {origin}/subscribe
            </a>
          ) : (
            <span className="font-medium">/subscribe</span>
          )}
        </p>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white p-4">
        <form onSubmit={handleAdd} className="flex flex-col gap-3 sm:flex-row sm:items-start">
          <div className="flex-1 space-y-1">
            <input
              type="email"
              required
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              placeholder="Email address"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none"
            />
          </div>
          <div className="flex-1 space-y-1">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Name (optional)"
              className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none"
            />
          </div>
          <button
            type="submit"
            disabled={adding || !newEmail.trim()}
            className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {adding ? "Adding..." : "Add Subscriber"}
          </button>
        </form>
        {addError && <p className="mt-2 text-sm text-red-600">{addError}</p>}
      </div>

      <div className="inline-flex rounded-md border border-gray-300 p-0.5 text-sm">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            type="button"
            onClick={() => {
              setStatus(f.value);
              setOffset(0);
            }}
            className={`rounded px-3 py-1.5 font-medium ${
              status === f.value
                ? "bg-gray-900 text-white"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loadError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{loadError}</p>
      )}
      {actionError && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{actionError}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : subscribers.length === 0 ? (
        <p className="text-sm text-gray-500">No subscribers yet.</p>
      ) : (
        <ul className="space-y-3">
          {subscribers.map((subscriber) => (
            <li
              key={subscriber.id}
              className="rounded-lg border border-gray-200 bg-white p-4 shadow-sm"
            >
              {editingId === subscriber.id ? (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{subscriber.email}</p>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Name (optional)"
                      className="mt-2 w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none"
                    />
                  </div>
                  <select
                    value={editPreference}
                    onChange={(e) => setEditPreference(e.target.value as Preference)}
                    className="w-full rounded-md border border-gray-300 px-3 py-2 text-base focus:border-gray-500 focus:outline-none"
                  >
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="both">Both</option>
                  </select>
                  {editError && <p className="text-sm text-red-600">{editError}</p>}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSaveEdit(subscriber.id)}
                      disabled={savingEdit}
                      className="flex-1 rounded-md bg-gray-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
                    >
                      {savingEdit ? "Saving..." : "Save"}
                    </button>
                    <button
                      onClick={() => setEditingId(null)}
                      disabled={savingEdit}
                      className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 disabled:opacity-50"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">
                      {subscriber.email}
                      {status !== "active" &&
                        (subscriber.unsubscribed ? (
                          <span className="ml-2 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                            Unsubscribed
                          </span>
                        ) : (
                          <span className="ml-2 rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                            Active
                          </span>
                        ))}
                    </p>
                    <p className="text-sm text-gray-500">
                      {subscriber.name ? `${subscriber.name} · ` : ""}
                      {subscriber.subscription_preference} ·{" "}
                      {new Date(subscriber.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => startEdit(subscriber)}
                      disabled={deletingId === subscriber.id}
                      className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(subscriber)}
                      disabled={deletingId === subscriber.id}
                      className="rounded-md border border-red-200 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
                    >
                      {deletingId === subscriber.id ? "Removing..." : "Delete"}
                    </button>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            disabled={offset === 0}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 disabled:opacity-40"
          >
            Prev
          </button>
          <span className="text-gray-500">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setOffset(offset + LIMIT)}
            disabled={page >= totalPages}
            className="rounded-md border border-gray-300 px-3 py-1.5 text-gray-700 disabled:opacity-40"
          >
            Next
          </button>
        </div>
      )}
    </div>
  );
}
