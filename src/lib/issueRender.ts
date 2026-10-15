// Turns an Issue's structured blocks (issue-schema.ts) into the HTML that
// goes into the email's main body - the piece the architecture doc always
// said EmailServer owns (§5, §6.2), and the reason Content Builder's JSON
// output can't just be pasted into the Builder's Main Body textarea anymore.
//
// Pure and framework-agnostic, like composeEmail.ts - no Supabase, no
// React - so the same render can run in a server route (the actual send)
// and in the admin UI's preview with no risk of the two drifting apart.

import type { ArticleCardBlock, Block, ClosingThoughtBlock, TextBlock } from "@/lib/issue-schema";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// [title](url) with an http(s) URL only. Matched against the already-escaped
// text, so the title and URL can't carry raw HTML, and a quote in the URL is
// already &quot; and can't break out of href. Anything else - javascript:,
// mailto:, a relative path, a URL containing a space or ")" - doesn't match
// and stays visible as plain escaped text rather than becoming a link.
const LINK_PATTERN = /\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/gi;

// Minimal markdown: **bold** and [links](https://...), plus preserved line
// breaks via the caller's white-space:pre-wrap. No markdown library for
// what's currently just the occasional weekly "text" block (§6.2) - a real
// one is easy to add later if a richer format is ever needed.
function renderMarkdownLite(body: string): string {
  return (
    escapeHtml(body)
      .replace(LINK_PATTERN, (_match, title: string, url: string) => {
        // "*" as &#42; in the href (same URL once the browser decodes it) so
        // the bold pass below can't pair up asterisks inside a URL.
        const href = url.replace(/\*/g, "&#42;");
        return `<a href="${href}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;">${title}</a>`;
      })
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
  );
}

// What the per-article "Disagree with this take?" link needs (architecture
// doc §11.3-11.4). Passed in rather than read from process.env here, because
// this renderer also runs in the browser (the admin Issues page's editor),
// where server env vars don't exist. No feedbackEmail = no Disagree link.
export type RenderOptions = {
  feedbackEmail?: string | null;
  issueDate?: string; // e.g. "2026-10-15"
};

// mailto: with the article's identity pre-filled so the reader only types
// their reason. The body opens with blank lines because mail clients put
// the cursor at the very top - the reader just starts typing - and the
// article details (for the operator, not the reader) sit below a divider.
// The subject alone still identifies the article if they delete those.
// encodeURIComponent turns spaces into %20 and newlines into %0A, which
// mail clients expect in mailto (a "+" would show up literally); the whole
// href is then HTML-escaped like any other attribute.
function disagreeMailto(block: ArticleCardBlock, options: RenderOptions): string {
  const subject = `Disagree: ${block.title}`;
  const body =
    `\n\n\n\n` +
    `— Please write above this line —\n` +
    `Article: ${block.title}\n` +
    (options.issueDate ? `Issue date: ${options.issueDate}\n` : "") +
    `Link: ${block.url}\n`;
  return (
    `mailto:${options.feedbackEmail}` +
    `?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  );
}

function renderArticleCard(block: ArticleCardBlock, options: RenderOptions): string {
  const disagreeLink = options.feedbackEmail
    ? ` &middot; <a href="${escapeHtml(disagreeMailto(block, options))}" style="color:#6b7280;">Disagree with this take?</a>`
    : "";
  const copyrightLine = block.copyright
    ? `<p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">${escapeHtml(block.copyright)}</p>`
    : "";

  return (
    `<div style="margin-bottom:28px;padding-bottom:24px;border-bottom:1px solid #e5e7eb;">` +
    `<h3 style="margin:0 0 8px;font-size:18px;line-height:1.35;color:#111827;">${escapeHtml(block.emoji)} ${escapeHtml(block.title)}</h3>` +
    `<p style="margin:0 0 10px;font-size:13px;color:#6b7280;"><strong>Source:</strong> ${escapeHtml(block.source)}</p>` +
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;"><strong>Summary:</strong> ${escapeHtml(block.summary)}</p>` +
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;font-style:italic;border-left:3px solid #e5e7eb;padding-left:12px;"><strong>PM Perspective:</strong> ${escapeHtml(block.pmPerspective)}</p>` +
    `<p style="margin:0;font-size:14px;"><a href="${escapeHtml(block.url)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;">Read full article &rarr;</a>${disagreeLink}</p>` +
    copyrightLine +
    `</div>`
  );
}

function renderTextBlock(block: TextBlock): string {
  const heading = block.heading
    ? `<p style="margin:0 0 8px;font-weight:600;font-size:16px;color:#111827;">${escapeHtml(block.heading)}</p>`
    : "";
  return (
    `<div style="margin-bottom:24px;font-size:15px;line-height:1.6;color:#374151;white-space:pre-wrap;">` +
    heading +
    renderMarkdownLite(block.body) +
    `</div>`
  );
}

function renderClosingThought(block: ClosingThoughtBlock): string {
  return (
    `<div style="margin-top:8px;padding:16px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;white-space:pre-wrap;">` +
    `<p style="margin:0 0 8px;font-weight:600;font-size:15px;color:#111827;">${escapeHtml(block.heading)}</p>` +
    `<p style="margin:0;font-size:14px;line-height:1.6;color:#374151;">${renderMarkdownLite(block.body)}</p>` +
    `</div>`
  );
}

function renderBlock(block: Block, options: RenderOptions): string {
  switch (block.kind) {
    case "article_card":
      return renderArticleCard(block, options);
    case "text":
      return renderTextBlock(block);
    case "closing_thought":
      return renderClosingThought(block);
  }
}

// A mailto: link does nothing visible (or opens a blank tab) on a device
// with no mail app set up - common for webmail in a desktop browser - and
// nothing in an email can detect that: mail clients strip scripts, and
// browsers don't reveal whether a mailto handler exists. So the address is
// also shown as plain text, once, after the last article card, for anyone
// whose click goes nowhere to copy.
function renderFeedbackFallback(feedbackEmail: string): string {
  const address = escapeHtml(feedbackEmail);
  return (
    `<p style="margin:0 0 28px;font-size:12px;line-height:1.5;color:#9ca3af;">` +
    `Disagree link not opening your email app? Write to ` +
    `<a href="mailto:${address}" style="color:#6b7280;">${address}</a> and mention the article title.` +
    `</p>`
  );
}

export function renderIssueBlocks(blocks: Block[], options: RenderOptions = {}): string {
  const lastCardIndex = blocks.map((block) => block.kind).lastIndexOf("article_card");
  return blocks
    .map((block, index) => {
      const html = renderBlock(block, options);
      return index === lastCardIndex && options.feedbackEmail
        ? html + renderFeedbackFallback(options.feedbackEmail)
        : html;
    })
    .join("\n");
}

// Handles the raw_html escape hatch (§6.3): if set, it's used verbatim
// instead of rendering blocks - so a hand-edited Issue keeps whatever
// Disagree links (or none) its HTML had when it was edited.
export function renderIssue(
  issue: { blocks?: Block[] | null; rawHtml?: string | null },
  options: RenderOptions = {}
): string {
  if (issue.rawHtml) return issue.rawHtml;
  return renderIssueBlocks(issue.blocks ?? [], options);
}

// The date shown in the Disagree email: the day the Issue was filed (UTC).
// Content Builder's own payload date isn't stored, but the Conductor files
// each Issue the morning of its send, so created_at's date is the same day.
export function issueDateFrom(createdAt: string): string {
  return createdAt.slice(0, 10);
}
