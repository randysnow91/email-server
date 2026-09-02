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

// Order the HTML body is assembled in - everything except the subject line
// (a separate email header field) and the footer (always rendered last, and
// it carries the required unsubscribe line - see composeEmail).
const BODY_ORDER: SectionType[] = [
  "header",
  "title",
  "about",
  "main_body",
  "ad",
  "editor",
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

export type ComposeOptions = {
  // The href for the unsubscribe link. The live preview leaves this unset
  // (renders "#" - there's no subscriber to unsubscribe). The real send
  // passes Mailgun's "%recipient.unsubscribe_url%" token, which Mailgun
  // fills in per recipient.
  unsubscribeUrl?: string;
};

// The footer region: the admin's Footer section content (if any) followed by
// the unsubscribe line, all inside one bordered block so there's a single
// separator, not two. The unsubscribe line is centered and always present -
// every real send needs a working opt-out regardless of what footer the
// admin wrote.
function footerBlock(footerContent: string | undefined, unsubscribeUrl: string): string {
  const unsubscribe =
    `<div style="text-align:center;margin-top:16px;">` +
    "You&rsquo;re receiving this because you subscribed. " +
    `<a href="${unsubscribeUrl}" style="color:inherit;text-decoration:underline;">Unsubscribe</a>.` +
    `</div>`;

  const inner = footerContent
    ? `<div style="white-space:pre-wrap;">${footerContent}</div>${unsubscribe}`
    : unsubscribe;

  return `<div style="margin-bottom:24px;${SECTION_STYLES.footer}">${inner}</div>`;
}

export function composeEmail(
  sections: SectionContentMap,
  opts: ComposeOptions = {}
): { subject: string; html: string } {
  const subject = (sections.subject ?? "").trim();

  const blocks = BODY_ORDER.map((type) => {
    const content = sections[type]?.trim();
    if (!content) return null;
    // white-space:pre-wrap preserves line breaks typed as plain text
    // (without it, consecutive sections/lines visually run together,
    // since HTML collapses bare newlines by default) while still letting
    // hand-written HTML tags (e.g. from Insert Link) render normally.
    return `<div style="margin-bottom:24px;white-space:pre-wrap;${SECTION_STYLES[type]}">${content}</div>`;
  }).filter((chunk): chunk is string => Boolean(chunk));

  blocks.push(footerBlock(sections.footer?.trim() || undefined, opts.unsubscribeUrl || "#"));

  return { subject, html: blocks.join("\n") };
}
