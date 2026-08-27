export default function AdminDashboardPage() {
  return (
    <main className="min-h-screen bg-gray-50 px-4 py-10">
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-gray-900">Admin Dashboard</h1>
        <p className="text-gray-600">
          You&apos;re past the admin gate. Subscriber management, the email
          builder, and send history are built in later milestones (M1&ndash;M6).
        </p>
        <form action="/api/admin/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 hover:bg-gray-100"
          >
            Log out
          </button>
        </form>
      </div>
    </main>
  );
}
