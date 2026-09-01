import { cookies } from "next/headers";
import { supabase } from "@/lib/supabase";

// The first newsletter is auto-created the first time it's needed (§4.7),
// so subscriber management never has to wait on an account-creation UI.
// M6 adds that UI plus a switcher; the id-based contract here didn't change.
const DEFAULT_EMAIL_SERVER_NAME = "AI PM Perspective";

// Cookie that remembers which newsletter the admin is currently working in.
// Read by getActiveEmailServerId() from both server components and route
// handlers. httpOnly - only the server ever needs it.
export const ACTIVE_EMAIL_SERVER_COOKIE = "email_server_id";

export type EmailServer = {
  id: string;
  name: string;
  description: string | null;
  created_at: string;
};

let cachedDefaultId: string | null = null;

export async function getDefaultEmailServerId(): Promise<string> {
  if (cachedDefaultId) return cachedDefaultId;

  const { data: existing, error: fetchError } = await supabase
    .from("email_servers")
    .select("id")
    .order("created_at", { ascending: true })
    .limit(1);

  if (fetchError) throw new Error(fetchError.message);

  if (existing && existing.length > 0) {
    cachedDefaultId = existing[0].id as string;
    return cachedDefaultId;
  }

  const { data: created, error: insertError } = await supabase
    .from("email_servers")
    .insert({ name: DEFAULT_EMAIL_SERVER_NAME })
    .select("id")
    .single();

  if (insertError) throw new Error(insertError.message);

  cachedDefaultId = created.id as string;
  return cachedDefaultId;
}

// The newsletter's display name, for public-page chrome. Falls back to the
// default name if the lookup fails, so a transient DB hiccup never leaves
// a public page without a title.
export async function getDefaultEmailServerName(): Promise<string> {
  try {
    const id = await getDefaultEmailServerId();
    const { data } = await supabase
      .from("email_servers")
      .select("name")
      .eq("id", id)
      .single();
    return (data?.name as string) || DEFAULT_EMAIL_SERVER_NAME;
  } catch {
    return DEFAULT_EMAIL_SERVER_NAME;
  }
}

// Which newsletter the admin is currently working in: the cookie value if
// it's set AND still points at a real newsletter, otherwise the default.
// Admin routes and admin server components use this; the public
// subscribe/unsubscribe routes deliberately stay on the default (§4.14).
export async function getActiveEmailServerId(): Promise<string> {
  const cookieStore = await cookies();
  const picked = cookieStore.get(ACTIVE_EMAIL_SERVER_COOKIE)?.value;

  if (picked) {
    const { data } = await supabase
      .from("email_servers")
      .select("id")
      .eq("id", picked)
      .maybeSingle();
    if (data) return data.id as string;
  }

  return getDefaultEmailServerId();
}

// All newsletters, oldest first (the oldest is the default/primary).
export async function listEmailServers(): Promise<EmailServer[]> {
  // Make sure the default row exists before we list - otherwise a brand-new
  // database would show an empty switcher.
  await getDefaultEmailServerId();

  const { data, error } = await supabase
    .from("email_servers")
    .select("id, name, description, created_at")
    .order("created_at", { ascending: true });

  if (error) throw new Error(error.message);
  return (data ?? []) as EmailServer[];
}
