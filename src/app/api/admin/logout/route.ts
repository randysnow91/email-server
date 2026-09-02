import { NextResponse } from "next/server";
import { appOrigin } from "@/lib/appUrl";

export async function POST() {
  // Redirect against appOrigin(), not request.url: behind Render's proxy the
  // latter is the internal address (localhost:10000), so the browser would
  // be sent to the wrong host. 303 so the browser follows it with GET.
  const response = NextResponse.redirect(new URL("/admin/login", appOrigin()), 303);
  response.cookies.delete("admin_session");
  return response;
}
