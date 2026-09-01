import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { getDefaultEmailServerId } from "@/lib/emailServer";

// Counts and recent sends must reflect live data on every visit, not be
// baked in at build time.
export const dynamic = "force-dynamic";

// Server component - reads straight from Supabase (same pattern as the API
// routes), so no self-fetch / cookie-forwarding dance.
async function getDashboardData() {
  try {
    const emailServerId = await getDefaultEmailServerId();

    const [{ count: subscriberCount }, { data: recentSends }] = await Promise.all([
      supabase
        .from("subscribers")
        .select("id", { count: "exact" })
        .eq("email_server_id", emailServerId)
        .eq("unsubscribed", false),
      supabase
        .from("send_history")
        .select("id, sent_date, is_test, recipient_count, success_count, failed_count")
        .eq("email_server_id", emailServerId)
        .order("sent_date", { ascending: false })
        .limit(5),
    ]);

    return {
      subscriberCount: subscriberCount ?? 0,
      recentSends: recentSends ?? [],
      error: null as string | null,
    };
  } catch (err) {
    return {
      subscriberCount: 0,
      recentSends: [],
      error: err instanceof Error ? err.message : "Failed to load dashboard.",
    };
  }
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

export default async function AdminDashboardPage() {
  const { subscriberCount, recentSends, error } = await getDashboardData();

  return (
    <div className="mx-auto max-w-2xl space-y-6 px-4 py-10">
      <div>
        <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">
          {subscriberCount.toLocaleString()} active subscriber
          {subscriberCount === 1 ? "" : "s"}.
        </p>
      </div>

      {error && (
        <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/send"
          className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Send Email
        </Link>
        <Link
          href="/admin/builder"
          className="inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          Email Builder
        </Link>
        <Link
          href="/admin/subscribers"
          className="inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          Manage Subscribers
        </Link>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Recent sends</h2>
          <Link href="/admin/send" className="text-sm font-medium text-blue-600 hover:underline">
            View all
          </Link>
        </div>
        {recentSends.length === 0 ? (
          <p className="text-sm text-gray-500">No sends yet.</p>
        ) : (
          <ul className="divide-y divide-gray-100 rounded-lg border border-gray-200 bg-white">
            {recentSends.map((row) => (
              <li key={row.id} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <div>
                  <p className="text-gray-900">
                    {formatDate(row.sent_date)}
                    {row.is_test && (
                      <span className="ml-2 rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                        Test
                      </span>
                    )}
                  </p>
                </div>
                <p className="text-gray-500">
                  {row.success_count ?? 0} delivered
                  {row.failed_count ? (
                    <span className="text-red-600"> · {row.failed_count} failed</span>
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
