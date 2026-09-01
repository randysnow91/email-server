import { getDefaultEmailServerName } from "@/lib/emailServer";

// Chrome for the subscriber-facing pages (/subscribe, /unsubscribe).
// Deliberately minimal and completely separate from the admin nav - a
// subscriber never sees admin menus, and there's no link into the admin
// area from here. Mirrors the admin's (protected) group (see §4.9).
export default async function PublicLayout({ children }: { children: React.ReactNode }) {
  const newsletterName = await getDefaultEmailServerName();

  return (
    <div className="flex min-h-screen flex-col bg-gray-50">
      <header className="border-b border-gray-200 bg-white px-4 py-4">
        <p className="mx-auto max-w-lg text-base font-semibold text-gray-900">
          {newsletterName}
        </p>
      </header>
      <main className="flex flex-1 items-start justify-center px-4 py-10">
        <div className="w-full max-w-lg">{children}</div>
      </main>
      <footer className="px-4 py-6 text-center text-xs text-gray-400">
        {newsletterName}
      </footer>
    </div>
  );
}
