"use client";

import { useCallback, useEffect, useState } from "react";

type HistoryRow = {
  id: string;
  sent_date: string;
  is_test: boolean;
  recipient_count: number | null;
  success_count: number | null;
  failed_count: number | null;
  status: string;
  error_message: string | null;
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default function HistoryPage() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/sender/send-history?limit=50");
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed to load send history.");
      const data = await res.json();
      setRows(data.history ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load send history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  return (
    <div className="mx-auto max-w-4xl space-y-6 px-4 py-8">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Send History</h1>
        <p className="text-sm text-gray-500">
          Every send and test send for the active newsletter, most recent first.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {loading ? (
        <p className="text-sm text-gray-500">Loading...</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-gray-500">No sends yet.</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 text-left text-xs uppercase tracking-wide text-gray-400">
                <th className="px-4 py-2 font-medium">When</th>
                <th className="px-4 py-2 font-medium">Type</th>
                <th className="px-4 py-2 font-medium">Recipients</th>
                <th className="px-4 py-2 font-medium">Delivered</th>
                <th className="px-4 py-2 font-medium">Failed</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-50 align-top last:border-0">
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
                      <span
                        className="text-red-600"
                        title={row.error_message ?? undefined}
                      >
                        {row.failed_count}
                      </span>
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
  );
}
