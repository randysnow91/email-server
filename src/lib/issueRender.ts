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

// Minimal markdown: **bold** only, plus preserved line breaks via the
// caller's white-space:pre-wrap. No markdown library for what's currently
// just the occasional weekly "text" block (§6.2) - a real one is easy to
// add later if a richer format is ever needed.
function renderMarkdownLite(body: string): string {
  return escapeHtml(body).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
}

function renderArticleCard(block: ArticleCardBlock): string {
  const copyrightLine = block.copyright
    ? `<p style="margin:6px 0 0;font-size:11px;color:#9ca3af;">${escapeHtml(block.copyright)}</p>`
    : "";

  return (
    `<div style="margin-bottom:28px;padding-bottom:24px;border-bottom:1px solid #e5e7eb;">` +
    `<h3 style="margin:0 0 8px;font-size:18px;line-height:1.35;color:#111827;">${escapeHtml(block.emoji)} ${escapeHtml(block.title)}</h3>` +
    `<p style="margin:0 0 10px;font-size:13px;color:#6b7280;"><strong>Source:</strong> ${escapeHtml(block.source)}</p>` +
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;"><strong>Summary:</strong> ${escapeHtml(block.summary)}</p>` +
    `<p style="margin:0 0 12px;font-size:15px;line-height:1.6;color:#374151;font-style:italic;border-left:3px solid #e5e7eb;padding-left:12px;"><strong>Why This Matters:</strong> ${escapeHtml(block.pmPerspective)}</p>` +
    `<p style="margin:0;font-size:14px;"><a href="${escapeHtml(block.url)}" target="_blank" rel="noopener noreferrer" style="color:#2563eb;">Read full article &rarr;</a></p>` +
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

function renderBlock(block: Block): string {
  switch (block.kind) {
    case "article_card":
      return renderArticleCard(block);
    case "text":
      return renderTextBlock(block);
    case "closing_thought":
      return renderClosingThought(block);
  }
}

export function renderIssueBlocks(blocks: Block[]): string {
  return blocks.map(renderBlock).join("\n");
}

// Handles the raw_html escape hatch (§6.3): if set, it's used verbatim
// instead of rendering blocks.
export function renderIssue(issue: { blocks?: Block[] | null; rawHtml?: string | null }): string {
  if (issue.rawHtml) return issue.rawHtml;
  return renderIssueBlocks(issue.blocks ?? []);
}
