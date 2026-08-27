import { redirect } from "next/navigation";

// Nothing lives at the root yet - M5 adds the public /subscribe page, and
// M6 may turn this into a real landing page. Until then, send visitors
// somewhere real instead of leaving the unedited create-next-app template up.
export default function Home() {
  redirect("/admin");
}
