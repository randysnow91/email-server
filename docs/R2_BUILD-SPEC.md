# Claude Code Build Spec — EmailServer (R2)

**Status:** v1.0 — drafted, no milestones built yet.
**Derived from:** `CONTENT-PIPELINE-ARCHITECTURE.md` (the cross-repo design —
read it first, especially §4, §6, §9, §12) + planning discussion (2026-09-15).
**Scope:** EmailServer's own R2 work only. Content Builder and Conductor each
have their **own** `R2_BUILD-SPEC.md` in their own repos — see the
architecture doc §16.5 for why this isn't one shared document anymore
(v0.4's changelog explains what went wrong with the first attempt).

| Version | Date | Summary |
|---------|------|---------|
| v1.0 | 2026-09-15 | Split out of the original cross-repo `R2_BUILD-SPEC.md` (commit `ed92913`) into a doc scoped to EmailServer alone. Content unchanged from that version's M1 section, reorganized as this repo's own spec. |

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

No new env vars — `content_api_key` values live in the database (§5.1), not
in Render's environment.

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

*(Preview/approve/send UI changes needed to actually review an Issue are
scoped inside M1 below, not spelled out route-by-route — extend the existing
Builder/Send pages rather than inventing new ones.)*

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

---

## 8. Milestones & Acceptance Criteria

### M1: Issue/Template Data Model + Ingestion Endpoint

**Goals:** EmailServer can receive and store an Issue, and the operator can
review/approve/send it, before Content Builder or Conductor exist to produce
one for real (test with a hand-crafted payload).

**Tasks:**
1. Migration: `issues` table, `email_servers` additions, `send_history`
   additions (§5.1).
2. `POST /api/issues` (§6) — validated, per-newsletter `content_api_key`
   auth, sets `send_after` per the guardrails, triggers the existing
   operator-notification email.
3. `GET /api/newsletters/:id/config` and `GET /api/newsletters/:id/issues`
   (§6) — for the future Conductor to call.
4. Extend the admin UI: a way to preview/approve/send an Issue (compose
   Template + Issue per architecture doc §5) — reuse as much of the existing
   Builder/Send UI pattern as fits rather than inventing a parallel one.
5. Extend the auto-send cron (existing pattern) to also pick up `draft`
   Issues past `send_after`.
6. Test end-to-end with a hand-crafted `IssuePayload` posted via
   `curl`/Postman — no Content Builder needed yet.

**Acceptance Criteria:**
- [ ] `POST /api/issues` accepts a valid payload, rejects an invalid one with
      a `400` (never a broken email).
- [ ] A posted daily Issue with no Reviewer flags gets `send_after` = +4h; a
      weekly Issue, or one with flags, gets `send_after = NULL`.
- [ ] The operator receives a review-link email when a draft Issue is created.
- [ ] The operator can preview (Template + Issue composed), edit, approve,
      and send an Issue from the admin UI.
- [ ] On send, the composed HTML snapshot is saved to `send_history`.
- [ ] The auto-send cron sends any `draft` daily Issue past its `send_after`.
- [ ] `content_api_key` correctly scopes `POST /api/issues` to one newsletter
      — a key for newsletter A cannot create an Issue for newsletter B.

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

**Acceptance Criteria:**
- [ ] Sending a weekly Issue reaches only `weekly`/`both` subscribers;
      sending a daily reaches only `daily`/`both` — verified with at least
      one subscriber in each preference bucket.
- [ ] A `both` subscriber on a Friday receives both emails as separate sends.

---

## 9. Out of Scope (for this spec)

Same boundaries as the architecture doc §14, plus:

- Content Builder's and Conductor's own build work — see their own repos'
  `R2_BUILD-SPEC.md`.
- The Reviewer "sends it back to the Writer" revision loop — named as a
  future enhancement in the architecture doc §11.5, not built here.
- The feedback capture page + `issue_feedback` table (architecture doc
  §11.3's "V2") — the mailto-only V1 of the feedback loop needs no
  EmailServer changes at all.
- The public self-service `/preferences` page — stays R3.

---

## 10. Known Limitations & Open Questions to Revisit

- **Newsletter generation config UI.** M1 adds `topics`/`voice` columns but
  doesn't require a polished admin UI to edit them — a direct DB edit or a
  minimal form is fine until it's annoying.
- **Auto-send trust.** Consider requiring the first N real daily sends be
  hand-approved before trusting auto-send (architecture doc §9) — an
  operating discipline to remember, not enforced in code.

---

*End of Build Spec v1.0 — drafted, no milestones built.*
