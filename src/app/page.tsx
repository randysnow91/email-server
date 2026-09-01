import { redirect } from "next/navigation";

// The public front door is the subscribe page. Admins go straight to
// /admin (or /admin/login). M6 may replace this with a real landing page.
export default function Home() {
  redirect("/subscribe");
}
