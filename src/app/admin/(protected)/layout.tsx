import Link from "next/link";

// Shared chrome for every logged-in admin page. Deliberately minimal -
// M6 replaces this with the full dashboard/nav; this is just enough to
// move between /admin and /admin/subscribers without dead ends.
export default function ProtectedAdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-4">
          <Link href="/admin" className="text-sm font-semibold text-gray-900">
            Email Server
          </Link>
          <Link href="/admin/subscribers" className="text-sm text-gray-600 hover:text-gray-900">
            Subscribers
          </Link>
          <Link href="/admin/builder" className="text-sm text-gray-600 hover:text-gray-900">
            Builder
          </Link>
        </div>
        <form action="/api/admin/logout" method="post">
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
          >
            Log out
          </button>
        </form>
      </nav>
      <main>{children}</main>
    </div>
  );
}
