import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getActiveEmailServerId } from "@/lib/emailServer";

// Counts and recent sends must reflect live data on every visit, not be
// baked in at build time.
export const dynamic = "force-dynamic";

// Server component - reads straight from Supabase (same pattern as the API
// routes), so no self-fetch / cookie-forwarding dance.
async function getDashboardData() {
  try {
    const emailServerId = await getActiveEmailServerId();

    const [account, { count: subscriberCount }, { count: sendCount }, { data: recentSends }] =
      await Promise.all([
        supabase
          .from("email_servers")
          .select("name, description")
          .eq("id", emailServerId)
          .single(),
        supabase
          .from("subscribers")
          .select("id", { count: "exact" })
          .eq("email_server_id", emailServerId)
          .eq("unsubscribed", false),
        supabase
          .from("send_history")
          .select("id", { count: "exact" })
          .eq("email_server_id", emailServerId)
          .eq("is_test", false),
        supabase
          .from("send_history")
          .select("id, sent_date, is_test, recipient_count, success_count, failed_count")
          .eq("email_server_id", emailServerId)
          .order("sent_date", { ascending: false })
          .limit(5),
      ]);

    return {
      accountName: (account.data?.name as string) ?? "Newsletter",
      accountDescription: (account.data?.description as string) ?? null,
      subscriberCount: subscriberCount ?? 0,
      sendCount: sendCount ?? 0,
      recentSends: recentSends ?? [],
      error: null as string | null,
    };
  } catch (err) {
    return {
      accountName: "Newsletter",
      accountDescription: null,
      subscriberCount: 0,
      sendCount: 0,
      recentSends: [],
      error: err instanceof Error ? err.message : "Failed to load dashboard.",
    };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminDashboardPage() {
  const { accountName, accountDescription, subscriberCount, sendCount, recentSends, error } =
    await getDashboardData();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Dashboard</p>
        <h1 className="text-2xl font-semibold text-gray-900">{accountName}</h1>
        {accountDescription && (
          <p className="mt-1 text-sm text-gray-500">{accountDescription}</p>
        )}
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-2xl font-semibold text-gray-900">
            {subscriberCount.toLocaleString()}
          </p>
          <p className="text-xs text-gray-500">
            Active subscriber{subscriberCount === 1 ? "" : "s"}
          </p>
        </div>
        <div className="rounded-lg border border-gray-200 bg-white p-4">
          <p className="text-2xl font-semibold text-gray-900">{sendCount.toLocaleString()}</p>
          <p className="text-xs text-gray-500">Email send{sendCount === 1 ? "" : "s"}</p>
        </div>
      </div>

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
        {recentSends.length === 0 ? (
          <p className="text-sm text-gray-500">No sends yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {recentSends.map((row) => (
              <li
                key={row.id}
                className="flex items-center justify-between gap-3 px-4 py-3 text-sm"
              >
                <p className="text-gray-900">
                  {formatDate(row.sent_date)}
                  {row.is_test && (
                    <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                      Test
                    </span>
                  )}
                </p>
                <p className="text-gray-500">
                  {row.success_count ?? 0} accepted
                  {row.failed_count ? (
                    <span className="text-red-600"> · {row.failed_count} rejected</span>
                  ) : null}
                </p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
