# Content Pipeline Architecture — Daily & Weekly Newsletter Automation

**Status:** Design document. Not yet a build spec — no milestones or acceptance
criteria. It captures the architecture agreed in the 2026-09-08 design
discussion, to be turned into an `R2_BUILD-SPEC.md` (with milestones) when
build starts.

**Covers:** SRD R2 (Content Builder app, Conductor/orchestrator, scheduled
sends) and the R3 weekly-email + subscription-preference work, which the
pipeline pulls forward because a live weekly makes `subscription_preference`
real.

**Builds on:** `V1_BUILD-SPEC.md` (V1 complete, v1.8). EmailServer already
exists and is deployed.

| Version | Date | Summary |
|---------|------|---------|
| v0.1 | 2026-09-08 | Initial architecture from the design discussion. |

---

## 1. Goal

Send a **daily** AI-news email (article cards, each with a PM perspective,
plus a closing thought) and a **weekly** email (a summary/roundup of the
week), with a **human review-and-approve step** before anything goes out.
Build it as **multiple cooperating agents with one orchestrator** — this is a
deliberate learning / portfolio goal, not only a functional one.

**Scale:** 1–2 users (the operator plus maybe one other newsletter owner).
Not a SaaS. No billing, signup, or org model — see §12.

---

## 2. The three services

| Service | New? | Owns | Runs as |
|---|---|---|---|
| **EmailServer** | exists (V1) | System of record: newsletters, subscribers, templates, **Issues**, send history, the review/approve lifecycle, rendering, sending. | Render web service |
| **Content Builder** | new (R2) | Generating an Issue's content: web search → curate → summarize → PM perspective → closing thought. **Stateless.** | Render service calling the Anthropic API (§11) |
| **Conductor** | new (R2) | Orchestration: the schedule, sequencing the pipeline, the service-to-service handoffs, failure handling. **Never waits on a human.** | Render cron / scheduled job |

### What each service does NOT do

- **EmailServer** does not generate content and does not know Content Builder
  exists. It exposes an endpoint to receive an Issue; it does not care whether
  the caller is the Conductor, a teammate's script, or a person.
- **Content Builder** does not talk to EmailServer, does not hold content
  history, does not know about subscribers or sending.
- **Conductor** does not generate content and does not render or send email. It
  calls the other two in order and passes data between them.

---

## 3. Core principles

1. **EmailServer is content-source-agnostic.** One endpoint: "here is an Issue
   for newsletter X." Anything can call it. This is what keeps EmailServer
   simple and is exactly what a future multi-tenant story needs.

2. **The Conductor is the only coordinator.** Content Builder and EmailServer
   never call each other. Conductor calls Content Builder, gets an Issue back,
   posts it to EmailServer. This is the orchestrator pattern and the part
   that's worth talking about on a resume.

3. **Content Builder is stateless.** "Generate for newsletter X" in, a
   structured Issue out. The Issue **history lives in EmailServer** (the Issue
   table). One source of truth; no cross-service sync.
   *(Revised from an earlier idea that Content Builder keep its own store —
   with the Issue model and 1–2 users, that's unnecessary.)*

4. **The human approval gate lives in EmailServer, not as a pause in the
   Conductor.** A scheduled job can't sit waiting for hours for a click. So the
   Conductor's last step is "create a draft Issue and trigger a notification,"
   then it exits. Approval happens later, in EmailServer's existing preview /
   send UI. "Pending approval" is a durable row, not a suspended process.

5. **Format experiments happen in Content Builder, not EmailServer.** EmailServer
   renders a fixed, small set of content **blocks** (§6). Content Builder
   decides which blocks, in what order, with what content. Changing the weekly
   format is a Content Builder change; EmailServer doesn't redeploy.

---

## 4. Data model changes to EmailServer

V1's model is "the `email_sections` rows *are* the email — Send sends whatever
is in them right now." There's no separation between the parts that never
change, today's content, and what actually went out last Tuesday. The pipeline
needs all three.

### 4.1 Template (the frame)

The stable parts of a newsletter: header, footer, about, the standing ad,
default styling. Roughly what `email_sections` becomes, but understood as "the
frame around the content." Edited by hand, rarely. One per newsletter.

### 4.2 Issue (the content) — new

One record per **newsletter × date × type**. The daily body or the weekly body.

- `type`: `daily` | `weekly`
- `status`: `draft` → `approved` → `sent` (or `skipped`)
- `send_after`: timestamp — the auto-send deadline (§9)
- `blocks`: the ordered content blocks (§6), as JSON
- `raw_html` (optional): an escape hatch — finished HTML that bypasses block
  rendering, for one-off experiments (§6.3)
- timestamps, who/what created it

The Conductor creates Issues as `draft`. The operator (or the auto-send
timer) moves them to `sent`. The Issue table **is** the generation history the
weekly reads from.

### 4.3 Send record (`send_history`) — enriched

On send, store the **composed HTML snapshot** — the exact bytes handed to
Mailgun. Immutable. This is "what subscribers actually received" (which can
differ from the Issue if the operator edited it before approving).

### 4.4 Subscription preference — finally used

`subscribers.subscription_preference` (`daily` | `weekly` | `both`) already
exists but is unused (everyone is `daily`; §4.4 of the build spec). The
pipeline makes it real — see §10.

---

## 5. Rendering: Template + Issue → email

At **preview and send time**, EmailServer composes:

```
Template (header, about, ad, footer)
  + Issue blocks rendered to HTML
  + the auto-added greeting ("Hi %recipient.name%,") and unsubscribe footer
  = the final email
```

The Issue is **never written into `email_sections.main_body`**. "Pull it into
the main body" happens here, at compose time. That's what allows staged drafts
and history.

---

## 6. The block model

### 6.1 An Issue is an ordered list of typed blocks

```json
{
  "type": "weekly",
  "date": "2026-09-12",
  "blocks": [
    {
      "kind": "text",
      "heading": "This week's throughline",
      "body": "Every big story this week was about **distribution**, not capability..."
    },
    {
      "kind": "article_card",
      "emoji": "🏥",
      "title": "ChatGPT Health Adds Epic Integration for Clinicians",
      "source": "TechCrunch",
      "copyright": "© 2026 TechCrunch",
      "summary": "OpenAI integrated ChatGPT Health directly into Epic's EHR system...",
      "pmPerspective": "This is a watershed moment for AI in enterprise software...",
      "url": "https://techcrunch.com/2026/09/01/chatgpt-health-adds-epic-integration/"
    },
    {
      "kind": "closing_thought",
      "heading": "💡 Useful Thought for Today",
      "body": "The companies winning right now aren't just building better AI..."
    }
  ]
}
```

### 6.2 EmailServer renders three block kinds

| Kind | Fields | Renders as |
|---|---|---|
| `article_card` | `emoji`, `title`, `source`, `copyright`, `summary`, `pmPerspective`, `url` | The `h3` + **Source** / **Summary** / **Why This Matters** / **Read full article** layout the Skill already produces |
| `text` | `heading?`, `body` (markdown) | A heading + a prose paragraph or two |
| `closing_thought` | `heading`, `body` | A visually distinct closing block |

Roughly three small render functions plus
`renderIssue(issue) = issue.blocks.map(renderBlock).join("")`.

With just these three kinds:

- **Daily** → `[article_card × N, closing_thought]`
- **Weekly "best of the week"** → `[article_card × 7, closing_thought]` (same shape)
- **Weekly "trends"** → `[text × 3, closing_thought]`
- **Weekly hybrid** → `[text (intro), article_card × 5, closing_thought]`

New block kinds get added only if a format genuinely needs one.

### 6.3 Escape hatch: `raw_html`

If an Issue has `raw_html`, EmailServer uses it verbatim instead of rendering
blocks. For trying something completely off-script for a single issue. Loses
the "restyle every issue from one template" benefit for that issue. Once a
format proves out with readers, formalize it as a block arrangement and drop
the raw HTML.

---

## 7. The daily pipeline

```
Conductor (scheduled, ~6:00 AM)
  │
  ├─▶ EmailServer:  GET newsletter config for X  (topics, voice, schedule)
  │
  ├─▶ Content Builder:  "generate a daily Issue for newsletter X"
  │       │  web search for recent, PM-relevant AI articles
  │       │  curate to the best 3–7, dedupe, relevance filter
  │       │  per article: summary + PM perspective
  │       │  write the closing thought
  │       ◀─ returns  { type: "daily", blocks: [...] }   (JSON, not HTML)
  │
  ├─▶ EmailServer:  POST Issue as draft   (status: draft, send_after: 9:00 AM)
  │       └─ EmailServer emails the operator a review link
  │
  └─ Conductor exits.  No waiting.

Operator (some time before 9:00 AM)          ── normal path
  └─▶ EmailServer: review (preview = Template + Issue)
        ├─ edit blocks if needed
        └─ Approve  ──▶ send ──▶ snapshot saved ──▶ Issue: sent

Auto-send cron (every ~15 min)               ── abnormal path
  └─ any Issue where status = draft AND send_after < now AND not skipped
        └─▶ send ──▶ snapshot ──▶ Issue: sent
```

Send filtering: subscribers with preference `daily` or `both` (§10).

---

## 8. The weekly pipeline

```
Conductor (scheduled, Friday ~2:00 PM)
  │
  ├─▶ EmailServer:  GET the week's sent daily Issues for newsletter X
  │                 (and/or their send snapshots — what actually went out)
  │
  ├─▶ Content Builder:  "build a weekly Issue for newsletter X from this week's content"
  │       │  synthesize — format is Content Builder's call (best-of / trends / hybrid)
  │       ◀─ returns  { type: "weekly", blocks: [...] }
  │
  ├─▶ EmailServer:  POST Issue as draft   (status: draft — NO send_after; §9)
  │       └─ EmailServer emails the operator a review link
  │
  └─ Conductor exits.

Operator
  └─▶ review ──▶ Approve ──▶ send   (weekly is always manually approved)
```

Send filtering: subscribers with preference `weekly` or `both`.

**Friday:** a `both` subscriber receives the daily (AM) **and** the weekly
(PM). Two separate Issues, two sends, two approvals. No dedup or replace logic
— this is the intended behavior.

---

## 9. Human-in-the-loop & auto-send

- **Approval lives in EmailServer** (§3, principle 4). The operator reviews the
  composed preview and clicks Approve / Edit / Skip.
- **Notification:** when EmailServer receives a draft Issue, it emails the
  operator a review link. EmailServer already has Mailgun; the Conductor
  doesn't need to know how the operator is reached.
- **Auto-send applies to the daily only.** Issue gets a `send_after` (e.g.
  generated 6:00 AM, `send_after` 9:00 AM — a 3-hour review window). A cron
  check sends any `draft` past its `send_after` that isn't `skipped`.
- **The weekly is always manually approved** — lower frequency, higher stakes,
  no `send_after`.
- **Guardrails:**
  - A broken or empty generation (no articles, empty blocks) is created
    **without** a `send_after` — it can't auto-send, it forces review.
  - Consider requiring the first N real daily sends be hand-approved before
    trusting auto-send.
  - The auto-send cron should log loudly and be easy to pause.

---

## 10. Subscription preferences & send filtering

| Send | Recipients |
|---|---|
| Daily Issue | `subscription_preference IN ('daily', 'both')` |
| Weekly Issue | `subscription_preference IN ('weekly', 'both')` |

- **No self-service preferences page needed to launch.** The admin subscriber
  **edit form already has a daily / weekly / both dropdown** (built in M1). At
  1–2 users the operator sets it by hand.
- The public `/preferences` page (build spec §4.4, R3) becomes worthwhile when
  the list is large enough that manual management is annoying. It reuses the
  `unsubscribe_token` mechanism from M5.
- The subscribe form could gain a daily/weekly/both choice at the same time.

---

## 11. Content Builder internals — the multi-agent shape

Content Builder is where the "multiple agents" learning goal is realised. Built
as a **service that calls the Anthropic API** (Messages API with the web-search
tool, or the Agent SDK) — not as a scheduled Claude Code skill. This is the
more portable resume story and gives full control over the pipeline.

Suggested agents (each a distinct responsibility; whether they are genuinely
separate API calls/contexts coordinated by a small local orchestrator, or
tools in one loop, is a build-time call — separate is more instructive):

| Agent | Job |
|---|---|
| **Research** | Given the newsletter's topic config, web-search for recent, relevant articles. Return candidates with source + URL. |
| **Curator** | Pick the best 3–7, dedupe, filter for genuine PM relevance, rank. |
| **Writer** | Per article: a tight summary and a PM perspective in the newsletter's voice. Write the closing thought. |
| **Editor** | Read the whole draft: tighten, cut fluff, verify every link resolves, check the voice is consistent. |

The Conductor orchestrates *across services* (schedule, handoffs). Content
Builder orchestrates *within itself* (Research → Curator → Writer → Editor).

The existing Claude **Skill** is the proof of concept and the baseline for the
prompts — the daily Skill already produces the target card format, and the
weekly Skill shows one weekly format. Port the approach, don't run the Skill
in production.

---

## 12. Service-to-service auth

- The content-ingestion endpoint on EmailServer is protected by a
  **per-newsletter API key**, not the shared `ADMIN_ACCESS_SECRET`. A newsletter
  owner (or the Conductor acting for them) holds a key scoped to that one
  newsletter.
- The Conductor holds the key(s) and the Content Builder endpoint URL.
- Content Builder needs only its Anthropic API key and (if the Conductor
  passes the week's content rather than Content Builder fetching it) nothing
  from EmailServer at all.

---

## 13. Deployment shape

- **EmailServer** — unchanged (Render web service).
- **Content Builder** — a second Render service (~$7/mo) exposing one endpoint,
  or a Render background worker. Calls the Anthropic API.
- **Conductor** — a Render cron job (or a scheduled function). Small.
- No new Supabase project required — Content Builder is stateless; everything
  persists in EmailServer's existing database (plus new `issues` and template
  changes).

---

## 14. Out of scope (for R2/R3)

- **SaaS mechanics** — billing, self-serve signup, organisations, tiers. A
  newsletter is provisioned by creating an `email_servers` row and issuing an
  API key.
- **Real delivery / bounce tracking** — the send still counts what Mailgun
  *accepted*. Bounce/delivered/complained tracking needs Mailgun webhooks
  (build spec §4.15, §11) — a separate piece of R3 work.
- **Per-user Content Builder** — Content Builder is the operator's tooling for
  the operator's newsletters. Other users import content by calling the
  ingestion endpoint from their own tools, or by composing in the UI.

---

## 15. Open questions — decide at build time

1. **Weekly format** — best-of-the-week vs. trends vs. hybrid. Deliberately
   left flexible (the block model, §6). Decide by trying formats and getting
   reader feedback; it's a Content Builder change each time, not an EmailServer
   one.
2. **If the operator never approves a daily by `send_after`** — current design:
   it auto-sends. Alternative: it skips that day. Revisit once auto-send has a
   track record.
3. **Does the Conductor pass the week's content to Content Builder, or does
   Content Builder pull it from EmailServer?** Leaning: Conductor passes it, so
   Content Builder stays fully decoupled from EmailServer.
4. **Newsletter config** — where topic/voice/schedule config for generation
   lives. Leaning: on the `email_servers` row (or a linked table) in
   EmailServer, so a newsletter's identity isn't split across services.
5. **How separate are Content Builder's internal agents** — genuinely separate
   API calls/contexts vs. one loop with tools. Separate is the better learning
   outcome; decide based on how much complexity is worth it.
6. **Notification channel** — start with an email from EmailServer to the
   operator; consider Slack/push later.

---

## 16. Relationship to the SRD and a future build spec

- SRD **R2** ("Content Automation & Scheduling"): this document is its detailed
  design. R2's "Content Builder app", "Conductor agent", "Scheduled sends",
  and "Message queuing" all map here.
- SRD **R3** ("Weekly & Subscriber Features"): the weekly email and the
  subscription-preference send filtering are designed here because a live
  weekly forces them. The self-service `/preferences` page and Mailgun-webhook
  engagement tracking remain later R3 work.
- Next step when build starts: turn this into `docs/R2_BUILD-SPEC.md` with
  milestones and acceptance criteria, the same way `V1_BUILD-SPEC.md` was
  derived from the SRD.

*End of Content Pipeline Architecture v0.1*
