import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

// Gated diagnostic route: proves the app can reach Supabase and the M0
// schema exists. Not part of the permanent API surface - later milestones
// add the real /api/manager, /api/builder, /api/sender routes.
export async function GET() {
  const { count, error } = await supabase
    .from("email_servers")
    .select("*", { count: "exact", head: true });

  if (error) {
    return NextResponse.json(
      { database: "error", message: error.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ database: "connected", email_servers_count: count });
}
