# Claude Code Build Spec — EmailServer (R2)

**Status:** v1.3 — M1 and M2 built and verified, except the auto-send cron
(deferred, see §8's M1 notes and §10). M3 (the "Disagree with this take?"
feedback link) built; awaiting verification in a real send.
**Derived from:** `CONTENT-PIPELINE-ARCHITECTURE.md` (the cross-repo design —
read it first, especially §4, §6, §9, §12) + planning discussion (2026-09-15).
**Scope:** EmailServer's own R2 work only. Content Builder and Conductor each
have their **own** `R2_BUILD-SPEC.md` in their own repos — see the
architecture doc §16.5 for why this isn't one shared document anymore
(v0.4's changelog explains what went wrong with the first attempt).

| Version | Date | Summary |
|---------|------|---------|
| v1.0 | 2026-09-15 | Split out of the original cross-repo `R2_BUILD-SPEC.md` (commit `ed92913`) into a doc scoped to EmailServer alone. Content unchanged from that version's M1 section, reorganized as this repo's own spec. |
| v1.1 | 2026-09-29 | M1 built and verified against a hand-crafted `IssuePayload` (no Content Builder/Conductor needed yet), then re-verified end-to-end against Content Builder's real output. Three review-UI gaps found in real use — an editor, a per-Issue test-send, and a read-only view of sent/skipped Issues — turned out to need their own small routes; see §6 and §8. Auto-send cron not built; drafts past `send_after` currently just wait for manual approval (§8, §10). |
| v1.2 | 2026-10-15 | M2's verification found a real gap: Issue sends ignored `subscription_preference` and went to every active subscriber. Fixed (commit `ee3d746`) — Issue sends now filter by type, and the Issues page's confirm count uses the same rule. Also added `[title](url)` links to text blocks for Content Builder's weekly "Articles by Day" list (§7.3). Verified end-to-end with a real Conductor → Content Builder → EmailServer weekly run. |
| v1.3 | 2026-10-15 | Added M3: the EmailServer side of Content Builder's M4 — a `mailto:` "Disagree with this take?" link on every article card, to a new `FEEDBACK_EMAIL` (§5.2, §7.5). Decided with the operator to keep feedback human-filtered for launch rather than feeding it to the Reviewer automatically (M3 notes). |

> **How to use this document.** The architecture doc says *what* and *why*,
> across all three services. This spec says *how, with what, and in what
> order* — for EmailServer specifically — the same relationship
> `V1_BUILD-SPEC.md` has to the SRD. Work through the milestones (§8) one at
> a time, verifying each against its acceptance checks before moving on.
>
> **Implementation ownership.** Where this document shows schemas, route
> shapes, or code snippets, treat them as one valid illustration of the
> intent, not a required implementation.
>
> **This repo doesn't need an M0.** EmailServer's scaffolding, admin gate,
> and deploy already happened in V1 (`V1_BUILD-SPEC.md`). R2 milestones here
> start at M1.

---

## 1. Build Instructions (ground rules for every session)

Same ground rules as `V1_BUILD-SPEC.md` §1 — explain before doing, surface
constraints rather than working around them silently, test on mobile where
it's admin UI. One addition specific to R2:

### 1.1 Stateless-elsewhere is the point

EmailServer is the **only** service that holds newsletter business data
(architecture doc §16.2) — newsletters, subscribers, templates, Issues, send
history. Content Builder and Conductor call in, but nothing about their
internal state lives here, and EmailServer never reaches into their
databases either (Content Builder's RAG corpus, when it exists, is entirely
its own concern). If a milestone here seems to need to know something about
*how* an Issue was generated rather than *what* it contains, that's a sign
the boundary is being crossed — stop and flag it.

---

## 2. Tech Stack

Unchanged from V1 — Next.js (App Router), TypeScript, Supabase, Mailgun,
Tailwind, deployed on Render. R2 adds no new EmailServer dependencies; see
§4.3 for why validation doesn't get a new library either.

---

## 3. Architecture at a Glance (EmailServer's slice)

Full picture: `CONTENT-PIPELINE-ARCHITECTURE.md` §2–§11. EmailServer's part
of it:

```
Conductor ──▶ GET  /api/newsletters/:id/config        (topics, voice)
Conductor ──▶ GET  /api/newsletters/:id/issues?...     (the week's sent dailies, for weekly synthesis)
Conductor ──▶ POST /api/issues                          (a new draft Issue; per-newsletter key)
                └─ EmailServer emails the operator a review link
Operator  ──▶ existing admin UI, extended to preview/approve/send an Issue
Auto-send cron (existing pattern, extended) ──▶ sends any draft daily Issue past send_after
```

EmailServer never calls Content Builder or Conductor. It only ever receives.

---

## 4. Architecture Decisions Called Out

### 4.1 Issue ingestion validates with hand-rolled guards, not zod

**Decision:** `POST /api/issues` validates incoming payloads with
`isValidIssuePayload()` from `src/lib/issue-schema.ts`, not a new `zod`
dependency.

**Why:** The architecture doc (§16.4) floated "zod or similar," but
`issue-schema.ts` was already written hand-rolled, matching this project's
existing convention (`isValidEmail` in `src/lib/validation.ts`). No reason to
introduce a new dependency for a shape this size when the existing style
already covers it.

### 4.2 Newsletter generation config: new columns, not a new table

**Decision:** Topics/voice/schedule (architecture doc §15, decision 3) are
added as columns directly on `email_servers`, not a separate table.

**Why:** One newsletter has exactly one config; a join table would be
unjustified indirection for a 1:1 relationship. Revisit only if a newsletter
ever needs *versioned* config history.

### 4.3 Two different auth mechanisms, on purpose

**Decision:** `POST /api/issues` is protected by a **per-newsletter API key**
(`content_api_key` on `email_servers`), not the shared `ADMIN_ACCESS_SECRET`.

**Why:** EmailServer hosts multiple newsletters; a leaked key should only
compromise one of them. This is deliberately different from Content
Builder's own `/generate` gate (a single shared secret, since Content Builder
has exactly one legitimate caller and no per-newsletter scoping need) — see
that repo's own `R2_BUILD-SPEC.md` §4.1. Don't conflate the two schemes.

---

## 5. Data Model & Environment Variables

### 5.1 Migration

```sql
-- New columns on email_servers: generation config + per-newsletter API key
ALTER TABLE email_servers
  ADD COLUMN topics TEXT,              -- e.g. "AI product news, PM-relevant"
  ADD COLUMN voice TEXT,               -- tone/style guidance for the Writer agent
  ADD COLUMN content_api_key UUID DEFAULT gen_random_uuid();
  -- the Conductor authenticates POST /api/issues with this, scoped to one newsletter

-- Template: the stable frame (architecture doc §4.1) — starts as
-- email_sections renamed/reused; exact migration path (rename vs. new
-- table) is Claude Code's call at build time.

-- Issues: one row per newsletter x date x type (architecture doc §4.2)
CREATE TABLE issues (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_server_id UUID NOT NULL REFERENCES email_servers(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('daily', 'weekly')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'skipped')),
  send_after TIMESTAMP,          -- NULL = no auto-send (§9's guardrails in the architecture doc)
  blocks JSONB,                  -- ordered content blocks (architecture doc §6); NULL if raw_html is set
  raw_html TEXT,                 -- escape hatch (architecture doc §6.3)
  reviewer_flags JSONB,          -- unresolved Reviewer findings, if any; NULL = clean
  created_at TIMESTAMP DEFAULT NOW(),
  created_by TEXT                -- e.g. "conductor"
);
-- Indexes: email_server_id, status, send_after (for the auto-send cron query)

-- send_history: add the composed HTML snapshot (architecture doc §4.3)
ALTER TABLE send_history
  ADD COLUMN html_snapshot TEXT,   -- exact bytes handed to Mailgun; immutable
  ADD COLUMN issue_id UUID REFERENCES issues(id);
```

### 5.2 Environment Variables

`content_api_key` values live in the database (§5.1), not in Render's
environment. One env var added in M3:

| Variable | Purpose |
|---|---|
| `FEEDBACK_EMAIL` | Where each article card's "Disagree with this take?" `mailto:` goes (§7.5). Shown to every subscriber, so a dedicated address (`pmfeedback@randy-snow.com`), not the operator's personal one. Falls back to `OPERATOR_EMAIL`; with neither set, the link is left off. |

---

## 6. API Routes (Specification)

Illustrative shapes — exact payloads may evolve as long as the underlying
capability is there.

**GET /api/newsletters/:id/config** *(service auth — the newsletter's
`content_api_key`)*
- Returns `{ topics, voice }` for the Conductor to pass to Content Builder.

**GET /api/newsletters/:id/issues?type=daily&status=sent&since=...**
- Returns the week's sent daily Issues (send snapshots) for the weekly
  pipeline (architecture doc §8) — the Conductor fetches these and passes
  them to Content Builder as `weekContent`.

**POST /api/issues** *(protected by the newsletter's `content_api_key`)*
- Body: an `IssuePayload` (`src/lib/issue-schema.ts`), validated with
  `isValidIssuePayload()` (§4.1)
- Creates a `draft` Issue row; `send_after` is set to +4h **only** for
  `type: "daily"` **and** empty `reviewer_flags` — `weekly`, or any flagged
  Issue, gets `send_after = NULL` (architecture doc §9's guardrails)
- Triggers the existing operator-notification email with a review link
- Returns `{ id, status, send_after }`
- A `400` on an invalid payload — never a broken email

*(Preview/approve/send UI changes needed to actually review an Issue were
scoped inside M1 below, not spelled out route-by-route in the original v1.0
of this doc. In practice a new `/admin/issues` page turned out to fit better
than extending Builder/Send — see the routes it actually calls below.)*

**Admin-gated routes actually built for `/admin/issues`** *(proxy.ts's
`/api/manager/*` gate, not the `content_api_key`)*:

- `GET /api/manager/issues` — lists Issues for the active newsletter.
- `GET /api/manager/issues/:id/preview` — composes Template + Issue for the
  review iframe. For a `sent` Issue, returns the archived `html_snapshot`
  from `send_history` instead of recomposing live (`archived: true`, plus
  `sentDate`/`recipientCount`/`successCount`/`failedCount`) — that's the
  exact bytes that went out, which can differ from a fresh compose if the
  Template changed since. Falls back to a live compose (`archived: false`)
  for `draft`/`approved`/`skipped`, or if no snapshot is found.
- `POST /api/manager/issues/:id/send`, `.../skip` — approve & send, or skip.
  The send reaches only subscribers whose preference covers the Issue's
  type (§7.4).
- `GET /api/manager/subscribers?issue_type=daily|weekly` — the existing
  subscriber list route, with an optional filter added in M2 so the Issues
  page's "Send this to N subscribers?" count matches who the send will
  actually reach.
- `POST /api/manager/issues/:id/test-send` — send a test copy to one address,
  composed from the Issue's *current* content (including any edit override).
  Added after real review turned up that the existing `/api/sender/test-send`
  only covered the manually-edited main body, not an Issue.
- `POST /api/manager/issues/:id/edit` — body `{ rawHtml: string | null }`.
  Lets the operator fix something (a bad link, a Reviewer-flagged line)
  before sending, by setting the Issue's `raw_html` escape hatch (architecture
  doc §6.3) directly — deliberately not a structured block editor. `null`
  reverts to the originally generated blocks. `409` if the Issue is no longer
  `draft`.

---

## 7. Key Implementation Notes

### 7.1 Reviewer flags block auto-send, not just review

An Issue with a non-empty `reviewer_flags` gets `send_after = NULL` on
ingestion, same as a `weekly` Issue — it can still be approved and sent
manually, it just can't auto-send unattended (architecture doc §9, §11.5).
EmailServer doesn't interpret *what's* in `reviewer_flags`, just whether it's
empty.

### 7.2 EmailServer never calls out

Every interaction in this spec is EmailServer being called *by* the
Conductor. EmailServer has no knowledge of Content Builder's existence, its
agents, or its RAG corpus — the ingestion endpoint is content-source-agnostic
by design (architecture doc §3, principle 1).

### 7.3 Text blocks support bold and links — nothing else

`text` and `closing_thought` bodies go through `renderMarkdownLite`
(`src/lib/issueRender.ts`): `**bold**`, `[title](url)`, and line breaks.
Everything is HTML-escaped first; a link only renders for an `http`/`https`
URL, so `javascript:`, relative paths and other schemes stay visible as
plain text, and a quote in a URL can't break out of `href`. A URL containing
a space or `)` won't match either — Content Builder should percent-encode
those (`%20`, `%29`). Still deliberately not a markdown library.

### 7.4 Send filtering lives in one rule

`preferencesFor(type)` in `src/lib/sendEmail.ts` — a daily Issue reaches
`daily`/`both`, a weekly reaches `weekly`/`both`. Both the Issue send
(`fetchActiveSubscribers`) and the Issues page's subscriber count use it, so
the number the operator confirms can't drift from who actually gets the
email. The manual Builder/Send flow passes no type and still reaches every
active subscriber.

### 7.5 The Disagree link is rendered, not stored

The renderer (`renderIssue` in `src/lib/issueRender.ts`) takes the feedback
address and Issue date as parameters instead of reading `process.env`,
because it also runs in the browser — the admin Issues page uses it to seed
the hand-edit box. `GET /api/manager/issues` returns `feedback_email` for
that, so a hand-edit starts from HTML that already has every card's link.

Consequences worth knowing:
- The link is added at render time, so an Issue filed *before* M3 gets it
  too when sent now. An Issue that was hand-edited is stored as finished
  HTML (`raw_html`) and keeps exactly the links it had when edited —
  including none, if edited before M3.
- The "issue date" in the pre-filled email is `created_at`'s UTC date.
  Content Builder's own payload `date` isn't stored; the Conductor files
  each Issue the morning of its send, so it's the same day.
- A `mailto:` does nothing useful on a device with no mail app set up —
  found in testing: webmail in a desktop browser opened a blank tab, while
  the iPhone Mail app worked. Nothing in an email can detect this (mail
  clients strip scripts; browsers don't expose whether a mailto handler
  exists), so the address is also shown once as plain text after the last
  article card, for the reader to copy. A friendlier "looks like your email
  isn't set up" experience would need the link to go to an EmailServer page
  instead — effectively the V2 feedback page (§9).
- `FEEDBACK_EMAIL` is server-wide, not per newsletter. Fine while AI PM
  Perspective is the only newsletter on the content pipeline; a second one
  would need its own address (a column on `email_servers`).

---

## 8. Milestones & Acceptance Criteria

### M1: Issue/Template Data Model + Ingestion Endpoint

**Status: built and verified 2026-09-29**, except the auto-send cron task
(#5) — not built; see the acceptance criteria below and §10.

**Goals:** EmailServer can receive and store an Issue, and the operator can
review/approve/send it, before Content Builder or Conductor exist to produce
one for real (test with a hand-crafted payload).

**Tasks:**
1. ✅ Migration: `issues` table, `email_servers` additions, `send_history`
   additions (§5.1).
2. ✅ `POST /api/issues` (§6) — validated, per-newsletter `content_api_key`
   auth, sets `send_after` per the guardrails, triggers the existing
   operator-notification email.
3. ✅ `GET /api/newsletters/:id/config` and `GET /api/newsletters/:id/issues`
   (§6) — built for the future Conductor to call; not yet exercised by a real
   caller since Conductor doesn't exist yet.
4. ✅ Extend the admin UI: a new `/admin/issues` page to preview, edit,
   test-send, approve/send, skip, and (after the fact) review any Issue
   regardless of status — see §6 for the routes it added. Went beyond the
   original wording of this task: a hands-on review pass surfaced that
   "preview/approve/send" alone wasn't enough (no way to fix a flagged Issue,
   no way to test an Issue specifically, no way to look back at what actually
   sent) — the editor, per-Issue test-send, and archived read-only view were
   added in response.
5. ❌ **Not done.** Extend the auto-send cron to also pick up `draft` Issues
   past `send_after`. A draft's `send_after` is computed and stored
   correctly, but nothing currently acts on it — every Issue, daily or
   weekly, flagged or clean, waits for manual Approve & Send. See §10.
6. ✅ Tested end-to-end twice: first with a hand-crafted `IssuePayload` via
   PowerShell, then against Content Builder's real generated output.

**Acceptance Criteria:**
- [x] `POST /api/issues` accepts a valid payload, rejects an invalid one with
      a `400` (never a broken email). Verified against 7 malformed-payload
      shapes (missing/invalid `type`, missing `date`, empty `blocks`, unknown
      block kind, a block missing a required field, a malformed
      `reviewerFlags` entry) plus a missing/garbage `content_api_key` (`401`)
      — all rejected, none created a row. The `rawHtml`-only payload (no
      `blocks`) still succeeds, confirming the escape hatch isn't broken by
      the same validation.
- [x] A posted daily Issue with no Reviewer flags gets `send_after` = +4h; a
      weekly Issue, or one with flags, gets `send_after = NULL`. Verified
      directly against a live-posted Issue's row.
- [x] The operator receives a review-link email when a draft Issue is created.
- [x] The operator can preview (Template + Issue composed), edit, approve,
      and send an Issue from the admin UI. Verified by hand end-to-end.
- [x] On send, the composed HTML snapshot is saved to `send_history`.
- [ ] The auto-send cron sends any `draft` daily Issue past its `send_after`.
      **Not built** — deferred (§10).
- [x] `content_api_key` correctly scopes `POST /api/issues` to one newsletter
      — a key for newsletter A cannot create an Issue for newsletter B.
      Verified with two real newsletters: posting with newsletter B's key
      while newsletter A was the active admin session still filed the Issue
      under B, and the admin Issues list only showed it once B was made
      active.

---

### M2: Weekly Send Filtering — Verification (not new build)

**Goals:** Confirm the existing `subscription_preference` mechanics (V1 M1)
actually support R2's weekly Issues correctly — this is a verification pass,
only becoming real build work if a gap is found.

**Tasks:**
1. Confirm send filtering for a weekly Issue reaches only
   `weekly`/`both` subscribers, and a daily Issue reaches only
   `daily`/`both` (architecture doc §10).
2. Confirm the Friday both-subscriber case: two separate Issues, two sends,
   two approvals, no dedup — intended behavior, not a bug (architecture doc
   §8).

**What verification found:** a real gap. The Issue send route called
`fetchActiveSubscribers()` with no notion of type, so *every* Issue — daily
or weekly — went to every active subscriber. A weekly would have reached
daily-only subscribers, and every daily sent so far had also reached anyone
set to weekly-only. Fixed by filtering on the Issue's type (§7.4). A second,
smaller gap surfaced in testing: the Issues page's confirm prompt showed the
overall active total regardless of type ("Send this to 4" for a daily that
actually went to 3) — now a per-type count from the same rule.

**Acceptance Criteria:**
- [x] Sending a weekly Issue reaches only `weekly`/`both` subscribers;
      sending a daily reaches only `daily`/`both` — verified with at least
      one subscriber in each preference bucket. Verified 2026-10-15 with 2
      daily, 1 weekly, 1 both: the daily went to 3 (the weekly-only
      subscriber confirmed it didn't arrive), the weekly went to 2.
- [x] A `both` subscriber on a Friday receives both emails as separate sends.
      Verified 2026-10-15 (a Thursday, same mechanics): the `both`
      subscriber received the daily and the weekly as two separate sends,
      two approvals, no dedup.
- [x] *(Added during M2)* Text-block links render in a real weekly — the
      "📅 Articles by Day" list from a real Conductor-triggered weekly run
      arrived with working links.

---

### M3: "Disagree with this take?" Feedback Link

**Goals:** The EmailServer side of Content Builder's M4 (architecture doc
§11.3 "V1 of the feedback loop", §11.4): every article card carries a
second small link next to "Read full article" — `Read full article ·
Disagree with this take?` — a `mailto:` pre-filled with the article's
identity so the reader only types their reason.

**Decided before building (2026-10-15):** feedback goes to a human inbox,
not straight to the Reviewer. The Reviewer checks drafts *before* a send, so
it can't act on feedback about a sent email anyway; "incorporating" it means
adding it to the Reviewer's RAG corpus. Doing that automatically would let
anyone holding the email — a subscriber, or whoever it's forwarded to —
write into what the AI is grounded on, with no human in between
(knowledge-base poisoning / prompt injection). At launch volume, a person
reading the replies and hand-adding the good ones to the corpus (Content
Builder's seed script already reserves `source: 'feedback'` for this) is the
right filter. Automating it is the architecture doc's V2, revisited once
volume makes the manual step annoying.

**Tasks:**
1. Add the Disagree `mailto:` to `article_card` rendering; subject
   `Disagree: <title>`. The body opens with blank space (mail clients put
   the cursor at the top, so the reader just types), then a
   "— Please write above this line —" divider, then the title, issue date
   and article link for the operator. Reordered after operator testing:
   the first version put a "Why I disagree:" prompt *below* the details.
2. Address it to `FEEDBACK_EMAIL` (§5.2), passed into the renderer rather
   than read inside it (§7.5).
3. Keep the hand-edit box's starting HTML in step (§7.5).
4. No new page, table, or endpoint.

**Acceptance Criteria:**
- [x] No new EmailServer table or route was added (one existing route's
      response gained a field).
- [x] The link is percent-encoded correctly — checked with a title
      containing `&`, `"`, `:` and `?`, which arrive intact in the
      pre-filled subject/body; with no address set, the link is omitted.
- [ ] Every article card in a real sent daily and weekly shows both links.
- [x] Clicking "Disagree with this take?" opens a pre-filled email to
      `pmfeedback@randy-snow.com` with the article's title and issue date —
      verified 2026-10-15 in a test-send on the iPhone Mail app. In desktop
      webmail with no mail app set up it opens a blank tab, which is why
      the plain-text address fallback exists (§7.5).
- [x] A test message to `pmfeedback@randy-snow.com` actually arrives.
      Verified 2026-10-15 (a separate mailbox on the operator's phone, not
      a forward).

---

## 9. Out of Scope (for this spec)

Same boundaries as the architecture doc §14, plus:

- Content Builder's and Conductor's own build work — see their own repos'
  `R2_BUILD-SPEC.md`.
- The Reviewer "sends it back to the Writer" revision loop — named as a
  future enhancement in the architecture doc §11.5, not built here.
- The feedback capture page + `issue_feedback` table (architecture doc
  §11.3's "V2") — the mailto-only V1 of the feedback loop is just M3's
  rendering change; see M3 for why V2 waits.
- The public self-service `/preferences` page — stays R3.

---

## 10. Known Limitations & Open Questions to Revisit

- **Newsletter generation config UI.** M1 adds `topics`/`voice` columns but
  doesn't require a polished admin UI to edit them — a direct DB edit or a
  minimal form is fine until it's annoying.
- **Auto-send cron isn't built yet.** `send_after` is computed and stored
  correctly on ingestion (verified), but nothing currently reads it — every
  Issue, clean daily included, sits as a draft until the operator manually
  hits Approve & Send from `/admin/issues`. This was deliberately deferred
  rather than built speculatively: the manual loop needed to be proven first.
  Worth revisiting once the manual flow has run for a while and the "N
  hand-approved sends before trusting auto-send" bar below feels met.
- **Auto-send trust.** Consider requiring the first N real daily sends be
  hand-approved before trusting auto-send (architecture doc §9) — an
  operating discipline to remember, not enforced in code. Doubles as the
  natural trigger for actually building the cron above.
- **Issue editing is raw HTML, not structured fields.** `/admin/issues`'
  editor works on the fully-rendered HTML (via the `raw_html` escape hatch),
  not on individual block fields (title, summary, etc.). Fine for a quick
  fix; revisit only if hand-editing HTML turns out to be a recurring
  friction point rather than an occasional one.

---

*End of Build Spec v1.1 — M1 built and verified, auto-send cron deferred.*
