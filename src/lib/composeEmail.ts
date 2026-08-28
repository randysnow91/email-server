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

// Inline styles only (no external stylesheet / <style> block) - most email
// clients strip or ignore those, so inline is the safe, standard way to
// style HTML email. Gives each section type a distinct default look instead
// of every section reading as one undifferentiated block of text.
const SECTION_STYLES: Record<SectionType, string> = {
  subject: "",
  header:
    "font-weight:600;font-size:13px;line-height:1.4;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em;",
  title: "font-weight:700;font-size:24px;line-height:1.3;color:#111827;",
  about: "font-size:15px;line-height:1.6;color:#374151;",
  main_body: "font-size:16px;line-height:1.6;color:#111827;",
  ad: "font-size:14px;line-height:1.5;color:#374151;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;",
  editor:
    "font-size:14px;line-height:1.6;color:#374151;font-style:italic;border-left:3px solid #e5e7eb;padding-left:12px;",
  footer:
    "font-size:12px;line-height:1.5;color:#9ca3af;border-top:1px solid #e5e7eb;padding-top:16px;",
};

export type SectionContentMap = Partial<Record<SectionType, string>>;

export function composeEmail(sections: SectionContentMap): { subject: string; html: string } {
  const subject = (sections.subject ?? "").trim();

  const html = BODY_ORDER.map((type) => {
    const content = sections[type]?.trim();
    if (!content) return null;
    // white-space:pre-wrap preserves line breaks typed as plain text
    // (without it, consecutive sections/lines visually run together,
    // since HTML collapses bare newlines by default) while still letting
    // hand-written HTML tags (e.g. from Insert Link) render normally.
    return `<div style="margin-bottom:24px;white-space:pre-wrap;${SECTION_STYLES[type]}">${content}</div>`;
  })
    .filter((chunk): chunk is string => Boolean(chunk))
    .join("\n");

  return { subject, html };
}
