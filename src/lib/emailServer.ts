import { supabase } from "@/lib/supabase";

// V1 has no account-management UI yet (that's M6). Rather than block
// subscriber management on building one, we transparently use a single
// "default" email_server, auto-created the first time it's needed.
// Multi-account support (multiple newsletters under one admin) plugs in
// later without changing this contract - callers just get back an id.
const DEFAULT_EMAIL_SERVER_NAME = "AI PM Perspective";

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
