import Link from "next/link";

export default function AdminDashboardPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-10">
      <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
      <p className="text-gray-600">
        Subscriber management and the email builder are ready. Sending and
        send history are built in later milestones.
      </p>
      <div className="flex flex-wrap gap-3">
        <Link
          href="/admin/subscribers"
          className="inline-block rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
        >
          Manage Subscribers
        </Link>
        <Link
          href="/admin/builder"
          className="inline-block rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700"
        >
          Email Builder
        </Link>
      </div>
    </div>
  );
}
