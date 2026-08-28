// Pure, framework-agnostic composition logic - no Supabase, no React. Shared
// by the /api/builder/preview route (server) and the builder page's live
// preview (browser), so the two can never drift out of sync, and the
// in-browser preview updates instantly with no network round-trip.

export type SectionType =
  | "subject"
  | "header"
  | "title"
  | "about"
  | "main_body"
  | "ad"
  | "editor"
  | "footer";

export const SECTION_TYPES: { type: SectionType; label: string; multiline: boolean }[] = [
  { type: "subject", label: "Subject", multiline: false },
  { type: "header", label: "Header", multiline: true },
  { type: "title", label: "Title", multiline: false },
  { type: "about", label: "About", multiline: true },
  { type: "main_body", label: "Main Body", multiline: true },
  { type: "ad", label: "Advertisement", multiline: true },
  { type: "editor", label: "Editor's Section", multiline: true },
  { type: "footer", label: "Footer", multiline: true },
];

// Order the HTML body is assembled in - everything except the subject line,
// which is a separate email header field, not part of the body.
const BODY_ORDER: SectionType[] = [
  "header",
  "title",
  "about",
  "main_body",
  "ad",
  "editor",
  "footer",
];

export type SectionContentMap = Partial<Record<SectionType, string>>;

export function composeEmail(sections: SectionContentMap): { subject: string; html: string } {
  const subject = (sections.subject ?? "").trim();

  const html = BODY_ORDER.map((type) => sections[type]?.trim())
    .filter((content): content is string => Boolean(content))
    .join("\n\n");

  return { subject, html };
}
