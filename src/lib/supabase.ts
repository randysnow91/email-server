import { createClient } from "@supabase/supabase-js";

// Server-side only client. Uses the service role key, which bypasses
// row-level security — never import this file into client components.
export const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY!
);
