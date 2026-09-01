import Link from "next/link";
import { getActiveEmailServerId, listEmailServers } from "@/lib/emailServer";
import AccountSwitcher from "./account-switcher";

// Reads the active newsletter, so every admin page is rendered per-request.
export const dynamic = "force-dynamic";

const NAV_LINKS = [
  { href: "/admin", label: "Dashboard" },
  { href: "/admin/subscribers", label: "Subscribers" },
  { href: "/admin/builder", label: "Builder" },
  { href: "/admin/send", label: "Send" },
  { href: "/admin/history", label: "History" },
  { href: "/admin/newsletters", label: "Newsletters" },
];

// Shared chrome for every logged-in admin page: the nav, the newsletter
// switcher, and log out.
export default async function ProtectedAdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let accounts: Awaited<ReturnType<typeof listEmailServers>> = [];
  let activeId = "";
  try {
    [accounts, activeId] = await Promise.all([listEmailServers(), getActiveEmailServerId()]);
  } catch {
    // A DB hiccup here shouldn't blank the whole admin area - the nav still
    // renders, individual pages surface their own errors.
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <nav className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-200 bg-white px-4 py-3">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link href="/admin" className="text-sm font-semibold text-gray-900">
            Email Server
          </Link>
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              {link.label}
            </Link>
          ))}
        </div>
        <div className="flex items-center gap-3">
          <AccountSwitcher accounts={accounts} activeId={activeId} />
          <form action="/api/admin/logout" method="post">
            <button
              type="submit"
              className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100"
            >
              Log out
            </button>
          </form>
        </div>
      </nav>
      <main>{children}</main>
    </div>
  );
}
