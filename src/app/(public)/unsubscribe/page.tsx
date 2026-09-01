import { supabase } from "@/lib/supabase";
import UnsubscribeConfirm from "./unsubscribe-confirm";

// Server component: resolves the token from the link to an email address
// before rendering, so no public GET endpoint is needed and the address
// is shown without an extra round-trip. The actual unsubscribe happens on
// a button click (see UnsubscribeConfirm), not on page load - email link
// scanners and prefetchers hit every URL, and we don't want them opting
// people out.
export const dynamic = "force-dynamic";

function Message({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-6 text-center shadow-sm">
      <p className="text-lg font-semibold text-gray-900">{title}</p>
      <p className="mt-2 text-sm text-gray-600">{body}</p>
    </div>
  );
}

export default async function UnsubscribePage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  if (!token) {
    return (
      <Message
        title="This link is missing its code"
        body="Use the unsubscribe link from one of the newsletter emails."
      />
    );
  }

  const { data: subscriber } = await supabase
    .from("subscribers")
    .select("email, unsubscribed")
    .eq("unsubscribe_token", token)
    .single();

  if (!subscriber) {
    return (
      <Message
        title="This unsubscribe link isn't valid"
        body="It may have already been used or the address was removed. Use the link from a recent newsletter email."
      />
    );
  }

  return (
    <UnsubscribeConfirm
      token={token}
      email={subscriber.email}
      alreadyUnsubscribed={subscriber.unsubscribed}
    />
  );
}
