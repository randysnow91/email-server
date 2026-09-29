import { supabase } from "@/lib/supabase";

// Resolves the x-content-api-key header to the one newsletter it's scoped
// to (architecture doc §12) - deliberately not the shared ADMIN_ACCESS_SECRET
// (§4.1 of the R2 build spec here): EmailServer hosts multiple newsletters,
// so a leaked key should only compromise the one it belongs to. The route
// derives which newsletter an Issue is for entirely from this key - never
// from a caller-supplied id - so there's no way to post an Issue for a
// newsletter you don't hold the key to.
export async function getEmailServerIdForApiKey(key: string | null): Promise<string | null> {
  if (!key) return null;

  const { data } = await supabase
    .from("email_servers")
    .select("id")
    .eq("content_api_key", key)
    .maybeSingle();

  return (data?.id as string) ?? null;
}
