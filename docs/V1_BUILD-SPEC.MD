# Claude Code Build Spec — Email Server

**Status:** v1.6 — M0, M1, M2, M3, M4, and M5 complete, READY FOR M6  
**Derived from:** `Email_Server_R1_SRD.md` (the requirements document — read it first) + planning review (2026-08-27)  
**Audience:** Claude Code (the coding agent) + the builder (product owner)

| Version | Date | Summary |
|---------|------|---------|
| v1.0 | 2026-08-26 | Initial spec. All milestones M0–M7 scoped and acceptance criteria defined. |
| v1.1 | 2026-08-27 | Planning review with Claude Code. Rescoped M5 to match the SRD's R1/R3 boundary (dropped self-service unsubscribe/preferences pages). Replaced the V1 Supabase Auth requirement with a lightweight admin-access gate (SRD assumes a trusted single admin, not a user system). Added a `name` field to subscribers (required by FR-3.2, missing from the original schema). Added a test-send capability (called for in SRD §9.2/§8.2, missing from v1.0). Flagged the sequential per-subscriber send loop as insufficient for NFR-1.1. Milestones and acceptance criteria are now the binding contract; schema and code samples throughout are illustrative, not prescriptive — see the note below. |
| v1.2 | 2026-08-27 | M0 and M1 built, verified locally, deployed to Render, and tested on a real phone (see §8 checkboxes). Documented decisions made during the build: default-newsletter auto-provisioning (§4.7), the temporary root-path redirect (§4.8), the `(protected)` admin route group convention (§4.9), and a Supabase query gotcha for future milestones (§7.5). Render deployment moved earlier than M7 — see §9. |
| v1.3 | 2026-08-30 | M2 built, verified locally, deployed to Render, and tested on a real phone (see §8 checkboxes). Documented the section-styling/Insert Link approach (§4.10) and an iframe sandbox gotcha for any future preview/embedded content (§7.6). Two real bugs found during phone testing and fixed: sections rendering as one undifferentiated block of text (missing per-section styling and line-break handling), and preview links being unclickable (sandboxed iframe blocking `target="_blank"` without `allow-popups`). |
| v1.4 | 2026-08-31 | M3 built and verified against live Mailgun (real inbox delivery, not just API acceptance), including a real Apple/iCloud address and the deployed Render instance. Documented the Mailgun integration approach (§4.11) and a real deliverability gotcha: a sending domain needs an MX record too, not just SPF/DKIM/DMARC (§7.7) — a real bounce during testing, not a hypothetical. Added image support (Supabase Storage + an Insert Image helper) to M7 as new scope, to be built first in that milestone, ahead of M7's full-workflow retest. |
| v1.5 | 2026-09-01 | M4 built, verified locally, deployed to Render, and phone-tested. Almost pure front-end work — M3 already shipped and tested the entire sender backend, so M4 added the `/admin/send` workflow page, wired send history into the dashboard, and added navigation. Documented the send-workflow UI approach (§4.12): in-page confirmation panel instead of a native `confirm()` dialog, client-side preview reusing `composeEmail()`, and the dashboard as the one server-rendered admin page (forced dynamic). No new API routes, no schema changes, no new gotchas. |
| v1.6 | 2026-09-01 | M5 built, verified locally, deployed to Render, and phone-tested. **Scope change:** self-service unsubscribe was pulled forward from R3 into M5 (preferences stays in R3) — the data model already had `unsubscribed`, real sends were going out with no opt-out link (a compliance and deliverability gap), and both unsubscribe and preferences need the same token mechanism, so building it once now makes preferences a cheap R3 add. §4.4 rewritten to reflect this; new §4.13 documents the M5 approach (a `(public)` route group with its own chrome, click-to-confirm unsubscribe, per-recipient footer link via a Mailgun variable). Schema change: `subscribers.unsubscribe_token` (migration `001_m5_unsubscribe_token.sql`). One UX fix found in testing: the M1 "Show unsubscribed" checkbox was additive and made a re-subscribed person look duplicated — replaced with an Active / Unsubscribed / All filter. |

> **How to use this document.**
> The SRD says *what* and *why*. This spec says *how, with what, and in what order*.
> **Do not paste this whole file into Claude Code and say "build it."** Work through
> the **Milestones** (§8) one at a time, verifying each against its acceptance checks
> before moving on. That is the core discipline of building this well: small,
> verifiable steps, each committed to Git.
>
> **Implementation ownership.** Where this document shows SQL schemas or code
> snippets, treat them as one valid illustration of the intent, not a required
> implementation. Claude Code owns final schema design, code structure, and
> technical approach, as long as the milestone's acceptance criteria are met.
>
> **Re-verify moving details at build time.** Exact platform limits, hosted
> tool identifiers, and model ID strings change. Check current Anthropic, Supabase,
> and Render docs when you reach the relevant milestone rather than trusting a number
> written here.

---

## 1. Build Instructions (ground rules for every session)

These apply to **every** milestone and Claude Code session. Reference them in each prompt as "§1" rather than repeating.

### 1.1 Mobile First + Cross-Platform

- The application must run on **phones and tablets** as the primary constraint.
- The same app runs on **PC and Mac** — no separate builds.
- **No mobile-only workarounds.** If a feature works on mobile, it works on desktop; vice versa.
- Test on a phone (or mobile browser dev tools) before marking a milestone done.

### 1.2 Explain Before Doing

- **Every Claude Code session:** Explain what you're about to build and why before writing code.
- If the approach changes from what was spec'd, explain the change and why.
- If you hit a constraint or limitation, surface it and ask before working around it.

---

## 2. Recommended Tech Stack (and why)

These are starting recommendations, not requirements — swap any of them if there's a
better fit. Only the milestones and acceptance criteria in §8 are binding.

| Layer | Choice | Why this one |
|---|---|---|
| **Framework** | **Next.js (App Router)** | Frontend and backend (API routes) in one repo, one language. Straightforward file-based routing, built-in API routes. Fast to build and deploy. |
| **Hosting** | **Render** (Hobby workspace + one **Starter** web-service instance, ~$7/mo) | Deploys from GitHub → a public link. Unlike serverless hosts, Render runs a **persistent server** — useful for background jobs (email sends, scheduled tasks in R2). Keeps the demo **always warm** (free instances cold-start ~30–60s). |
| **Database** | **Supabase** | Managed Postgres with a generous free tier. Built-in auth/RLS exist but are **not used in V1** — R1 has a single trusted admin, protected by a lightweight access gate rather than a user-account system (see §4.1). Auth becomes relevant when R4 adds multiple users. |
| **Email Delivery** | **Mailgun** (or SendGrid/AWS SES — TBD) | Industry-standard SMTP service. Low-cost, production-reliable, handles bounces and errors. Selection deferred to architecture phase (see §4.3). |
| **UI Components** | **shadcn/ui** (optional; **Tailwind core** sufficient) | Not required for R1 — plain Tailwind is fine. |
| **Form Handling** | **React Hook Form** (optional) | Not required if forms are simple. |

**Language:** TypeScript throughout.

---

## 3. Architecture at a Glance

```
Browser (Next.js UI)          [served by Render web service]
  │  Admin (Randy) composes email, clicks Send — gated by a shared secret (§4.1)
  │  Subscriber fills public subscribe form — no login
  ▼
Server routes (Render)
  │
  ├─ Email Manager API (admin-gated)
  │  └─ GET/POST/PUT/DELETE /api/manager/subscribers
  │  └─ GET /api/manager/accounts
  │
  ├─ Email Builder API (admin-gated)
  │  └─ GET/POST/PUT/DELETE /api/builder/sections
  │  └─ POST /api/builder/preview (render email for preview)
  │
  ├─ Email Sender API (admin-gated)
  │  └─ POST /api/sender/send (send to full subscriber list)
  │  └─ POST /api/sender/test-send (send one copy to the admin)
  │  └─ GET /api/sender/send-history
  │
  └─ Public Pages (no auth required)
     └─ GET /subscribe (form page)
     └─ POST /api/public/subscribe (handle form submission)
     └─ GET /unsubscribe?token=… (confirm page)       [M5, §4.13]
     └─ POST /api/public/unsubscribe (un/re-subscribe) [M5, §4.13]
  │
  ▼
Supabase (Postgres)
  ├─ email_servers (account metadata)
  ├─ subscribers (list of subscribers per account)
  ├─ email_sections (template sections — header, footer, body, etc.)
  └─ send_history (log of every send)
```

Self-service `/preferences`, and Supabase's `auth.users`, are **R3/R4** — not
built in V1. Self-service `/unsubscribe` **was** R3 but was pulled into V1 during
M5 (see §4.4). See §4.1 and §4.4.

---

## 4. Architecture Decisions Called Out

### 4.1 Why no full auth system in V1 — and what protects the admin routes instead

**Decision:** V1 does not build sign-up, sign-in, sessions, or per-user RLS. Instead,
admin routes (`/api/manager/*`, `/api/builder/*`, `/api/sender/*`) and the admin UI
are protected by a **single shared-secret gate** — one environment variable
(`ADMIN_ACCESS_SECRET`), checked by middleware, e.g. as a cookie set after entering
the secret once, or a header. This is a few lines of code, not a user-account system.

**Why:** The SRD assumes a trusted single admin with no separate authentication in
R1. Building full Supabase Auth + RLS keyed to `auth.uid()` has no real user to key
off of yet, and is real work with nothing behind it until R4 adds multiple users.
But *zero* protection on a publicly deployed URL would let anyone who finds the link
read the subscriber list — the shared-secret gate closes that gap cheaply while
staying well short of a full auth system.

**Trade-off:** Not real security against a determined attacker (a shared secret is
weaker than per-user auth), and it doesn't give role-based access beyond "has the
secret or doesn't." Acceptable for a single-operator V1; if you'd rather skip even
this while the app only runs locally or at an unguessable URL, say so and we'll drop it.

**R4** replaces this entirely with real Supabase Auth + RLS for multiple users.

### 4.2 Why separate API routes for Manager, Builder, Sender (vs. one monolithic API)

**Decision:** Three separate route groups (`/api/manager`, `/api/builder`,
`/api/sender`), each with clear concerns.

**Why:** Mirrors the design preference in §4 of the SRD ("separate agents"). Each
route group can be tested, reasoned about, and later extracted into a worker if
needed.

**Trade-off:** Minor file overhead; net simplicity gain in maintenance. Exact route
structure is Claude Code's call as long as the concerns stay separated.

### 4.3 SMTP service selection deferred

**Decision:** The SRD says "SendGrid/Mailgun/AWS SES TBD." Build will use
**Mailgun** by default (industry standard, generous free tier, well-documented).

**Why:** Known-good choice. Swapping SMTP providers later is isolated to the Email
Sender component.

### 4.4 Public pages in V1: `/subscribe` and `/unsubscribe` (not `/preferences`)

**Original decision (v1.0–v1.5):** `/subscribe` is the only unauthenticated
public page in V1; self-service `/unsubscribe` and `/preferences` are R3.

**Revised decision (M5, v1.6):** `/subscribe` **and** `/unsubscribe` are public in
V1. `/preferences` stays in R3.

**Why unsubscribe moved into V1:**
- The data model already had `subscribers.unsubscribed`, the send already
  filtered on it, and the admin list already showed it — only the public-facing
  half was missing.
- M3/M4 were already sending real email with **no unsubscribe link**. For any
  real list that's a problem: a functioning opt-out is legally expected
  (CAN-SPAM), and its absence drives spam complaints, which hurt deliverability
  for the whole list.
- Unsubscribe and preferences need the **same core mechanism** — a link in the
  email that identifies a subscriber with no login (a per-subscriber token).
  Building it once for unsubscribe now makes preferences a small R3 add rather
  than a from-scratch task.
- Cost was about half a milestone on top of M5's subscribe work, and it's
  cohesive with it (public pages + email footer).

**Why preferences did *not* move:** V1 is daily-only. Weekly sends don't exist
until R3, so a preferences page would toggle a setting that changes nothing.
It belongs with the R3 weekly feature; by then the token mechanism from
unsubscribe already exists. The SRD still tags preference self-service `[R3]`
(FR-1.7) and this spec keeps it there.

The admin can still remove subscribers manually via the Email Manager (M1,
FR-1.6); self-service unsubscribe is in addition to that, not a replacement.

### 4.5 Subscribers get an optional `name` field

**Decision:** Add a nullable `name` column to `subscribers`, collected optionally
on the subscribe form.

**Why:** FR-3.2 requires SMTP sends to include "the current subscriber's name and
email address," but the SRD's own data model (§7) and the v1.0 build spec omitted
a name field entirely. Optional keeps the subscribe form low-friction; when present,
it can be used to personalize the send (e.g., "Hi Randy,").

### 4.6 Test send before real send

**Decision:** The Email Sender API supports a test-send mode
(`POST /api/sender/test-send`) that delivers one copy of the composed email to the
admin's own address, separate from the full-list send.

**Why:** The SRD's admin workflow (§9.2, step 6) and UI spec (§8.2, "Save and Test
Send buttons") both call for this; the v1.0 build spec omitted it.

### 4.7 Default `email_server` is auto-provisioned, not created via UI

**Decision:** M1 needed subscribers to belong to *some* `email_server`, but no
account-creation UI exists until M6. Rather than block M1 on building one, the
server auto-creates a single default row (`"AI PM Perspective"`, per the SRD's
stated R1 use case) the first time it's needed, cached in-process
(`src/lib/emailServer.ts`). There is no setup screen for this in M1 — it just
exists.

**Why:** Avoids pulling M6 scope forward just to unblock M1. M6 replaces this
with a real account-switcher UI; the underlying `email_server_id` data model
doesn't change.

### 4.8 Root path (`/`) redirects to `/admin` — temporary

**Decision:** `src/app/page.tsx` redirects to `/admin`. Nothing real lives at
root yet.

**Why:** Without this, the public Render URL showed the unedited
create-next-app template ("To get started, edit page.tsx") — confusing on a
deployed link. M5 (public `/subscribe`) or M6 (real dashboard/landing page)
should revisit what belongs at `/`; this redirect is a placeholder, not a
final decision.

### 4.9 Admin pages are grouped under `/admin/(protected)/`

**Decision:** Every logged-in-only admin page lives in the
`(protected)` route group (e.g. `src/app/admin/(protected)/subscribers/`),
which supplies a shared nav layout. `/admin/login` sits outside that group, at
`src/app/admin/login/`, so the login page doesn't inherit nav chrome meant for
authenticated pages.

**Why:** Keeps the "logged in vs. not" boundary visible in the file structure
itself. Future milestones (M2's builder, M4's send page) should add new pages
under this same `(protected)` group rather than directly under `admin/`.

### 4.10 Section content: plain textarea + inline per-type styling + Insert Link helper

**Decision:** Sections stay plain textareas (no rich-text editor library — see
§2's original reasoning), but `composeEmail()` (`src/lib/composeEmail.ts`) wraps
each section's content in a `<div>` with inline styles specific to that
section type (Title as a heading, Advertisement in a bordered/tinted box,
Editor's Section as an italic pull-quote, Footer small/muted, etc.), plus
`white-space:pre-wrap` so typed line breaks render as line breaks. The builder
page adds a small **"+ Insert Link"** helper per section (all except Subject,
which is plain text in real emails) — a two-field inline form (link text +
URL) that generates the `<a href>` HTML and inserts it at the cursor, so
adding a link never requires hand-writing HTML.

**Why:** Real usage (Randy's own content) surfaced two problems immediately:
sections with no visual separation read as one undifferentiated block of
text, and a bare URL pasted into the Advertisement section was just inert
text, not a link. A full rich-text editor would solve both but reopens the
"new dependency" trade-off §2 deliberately avoided; styling the composed
output plus one small link-insertion helper solves the actual reported
problems without that cost. Since `composeEmail()` is the same function M3's
send will use, this isn't a preview-only cosmetic fix — it's what the real
sent email looks like too.

### 4.11 Mailgun: direct REST calls, batch sending, greeting via recipient-variables

**Decision:** `src/lib/mailgun.ts` calls Mailgun's REST API directly via
`fetch()` rather than adding their SDK — one endpoint, not worth a new
dependency. Sends go through Mailgun's batch-sending feature (a comma-
separated `to` list plus `recipient-variables` JSON in one call, chunked at
1,000 recipients with concurrent requests for anything larger) rather than
looping per-subscriber. Personalization ("Hi {name},") is layered on top of
`composeEmail()`'s output via `withGreeting()` at send time, not baked into
the shared composer, since the builder's live preview has no subscriber to
personalize for.

**Why:** Directly satisfies both NFR-1.1 (performance) and the privacy
requirement (§7.1) in one mechanism, exactly as §7.3 originally recommended.
Keeping personalization out of `composeEmail()` preserves its "same output
for everyone" contract that the live preview depends on.

### 4.12 M4 send workflow: dedicated `/admin/send` page, in-page confirm, reused composer

**Decision:** The complete admin send workflow lives on one new page,
`src/app/admin/(protected)/send/page.tsx`:

- **Preview** is composed in the browser with the shared `composeEmail()`
  (§4.10) — same as the Builder's live preview — rendered in the same
  sandboxed iframe (§7.6). No `/api/builder/preview` round-trip.
- **Recipient count** reuses `GET /api/manager/subscribers?limit=1` and
  reads `total` (the exact non-unsubscribed count) rather than adding a
  count endpoint.
- **Confirmation for the real send is an in-page panel**, not a native
  `window.confirm()` dialog (the Builder's Delete still uses `confirm()`;
  the send is higher-stakes and the panel reads better on mobile).
- **Main Body guard** is enforced client-side too (send buttons disable
  with a warning when it's empty), mirroring the server-side
  `MissingMainBodyError` (§7.2) rather than relying only on the API 400.
- **Test-send address** is remembered in `localStorage`
  (`emailserver.testSendAddress`), not a new env var.
- **Send history** shows on both the send page (last 15, full table) and
  the dashboard (last 5), with test sends badged distinctly from real
  sends.

The **dashboard** (`src/app/admin/(protected)/page.tsx`) became the one
server-rendered admin page — it reads Supabase directly (same pattern as
the API routes, no self-fetch/cookie dance) and is marked
`export const dynamic = "force-dynamic"` so counts and recent sends are
never baked in at build time. Every other admin page is a client
component with a static shell.

**Why:** M3 had already built and live-tested the entire sender backend
(`/api/sender/send`, `/test-send`, `/send-history`, `composeForSend()`,
Mailgun batch sending). M4's acceptance criteria are all UI/workflow, so
M4 added no API routes and no schema changes — just the page, the
history views, and navigation (nav "Send" link + a "Go to Send" button
on the Builder, satisfying "navigate from Email Builder to a Send page").

### 4.13 M5 public pages: a `(public)` route group, token unsubscribe, click-to-confirm

**Decision:**

- **Separation via route groups, not a permission check.** Subscriber-facing
  pages live in a new `src/app/(public)/` group with its own `layout.tsx`
  (just the newsletter name + a plain footer). It mirrors the admin's
  `(protected)` group (§4.9): a subscriber never sees an admin menu because
  no code path renders one there, and there's no link from public pages into
  `/admin`. The admin's nav gets no "Subscribe" link — the admin manages the
  list through `/admin/subscribers` (the M1 CRUD table), which is a different
  page from the public `/subscribe` form despite the similar name.
- **Unsubscribe identity = a per-subscriber token.** New column
  `subscribers.unsubscribe_token` (UUID, unique, `default gen_random_uuid()`;
  migration `supabase/migrations/001_m5_unsubscribe_token.sql`). Separate from
  the row `id` so it can be rotated later and so the primary key never travels
  in a URL. This is the shared mechanism R3's preferences page will reuse.
- **The unsubscribe link is per-recipient, added at send time.** Like the
  "Hi {name}" greeting (§4.11), the footer line is appended in
  `src/lib/sendEmail.ts` / `src/lib/mailgun.ts` — not in `composeEmail()`,
  whose output must stay identical for the shared live preview. It uses a
  Mailgun recipient variable (`%recipient.unsubscribe_url%`) so each copy
  carries only that subscriber's token. Test sends have no real subscriber, so
  they get a tokenless placeholder link.
- **Unsubscribe happens on a button click, not on page load.** Corporate email
  link-scanners and prefetchers hit every URL in a message; auto-unsubscribing
  on GET would opt people out without their action. The `/unsubscribe` page is
  a server component that resolves the token to an email address and shows a
  Confirm button; a small client component does the POST. A Resubscribe button
  on the same page (and re-submitting the `/subscribe` form) reactivates a
  previously-unsubscribed row.
- **Small cleanups:** `/` now redirects to `/subscribe` (was `/admin`; the
  public front door — the admin bookmarks `/admin`). Root `<title>` fixed.
  The admin Subscribers page shows the public signup URL as a convenience.

**UX fix found during M5 testing:** the M1 "Show unsubscribed" checkbox was
*additive* (checked = active + unsubscribed together, unlabeled), so a
re-subscribed person appeared to be listed twice. Replaced with an
**Active / Unsubscribed / All** filter (`GET /api/manager/subscribers?status=`,
replacing the old `?unsubscribed=` flag), with per-row status badges in the
All view.

**No new gotchas.** One deploy note: `NEXT_PUBLIC_APP_URL` is baked in at
build time, so it must be set correctly in Render's env **before** the build
for unsubscribe links in sent email to point at the live site.

---

## 5. Data Model & Database Schema

The schema below is a **starting point**, not a required implementation — adjust
column types, indexes, etc. as needed during M0/M1 as long as the data it needs to
hold (§7 of the SRD, plus §4.5 above) is covered.

### 5.1 Tables (Postgres via Supabase)

> **`supabase/schema.sql` in the repo is the authoritative, current schema —
> it has already diverged from the snippet below** (a `unique(email_server_id,
> email)` constraint and explicit `grant` statements were added during M1;
> see the file's own comments for why). Treat this snippet as historical
> illustration of the starting shape, not a source to copy from.

```sql
-- Email_Servers: account metadata (one per newsletter, e.g. "AI PM Perspective", "Dog Rescue")
CREATE TABLE email_servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  active BOOLEAN DEFAULT TRUE
  -- R4 adds: user_id UUID REFERENCES auth.users(id), once real auth exists
);

-- Subscribers: list of subscribers per account
CREATE TABLE subscribers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_server_id UUID NOT NULL REFERENCES email_servers(id) ON DELETE CASCADE,
  email VARCHAR(255) NOT NULL,
  name VARCHAR(255), -- optional; used for send personalization (FR-3.2)
  subscription_preference ENUM('daily', 'weekly', 'both') DEFAULT 'daily',
  -- preference is fixed at 'daily' for all V1 subscribers; selection UI is R3 (§4.4)
  created_at TIMESTAMP DEFAULT NOW(),
  unsubscribed BOOLEAN DEFAULT FALSE,
  unsubscribe_token UUID NOT NULL DEFAULT gen_random_uuid() UNIQUE
  -- M5 (§4.13): identifies a subscriber from a public unsubscribe link with
  -- no login. Added via supabase/migrations/001_m5_unsubscribe_token.sql.
);
-- Indexes: email_server_id, email (for lookups), unsubscribed (for filtering),
-- unsubscribe_token (unique, for the /unsubscribe lookup)

-- Email_Sections: template sections
CREATE TABLE email_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_server_id UUID NOT NULL REFERENCES email_servers(id) ON DELETE CASCADE,
  section_type ENUM('subject', 'header', 'title', 'about', 'main_body', 'ad', 'editor', 'footer') NOT NULL,
  content TEXT,
  content_source ENUM('manual', 'linked', 'generated') DEFAULT 'manual',
  -- unused in R1 (all content is manual); reserved for R2 Content Builder (FR-2.8/2.9)
  source_url TEXT,
  generated_by VARCHAR(255),
  -- both nullable, unused in R1; reserved for R2 provenance (which source/agent produced generated content)
  updated_at TIMESTAMP DEFAULT NOW()
);
-- Indexes: email_server_id, section_type (for quick lookup of specific sections)

-- Send_History: log of every send
CREATE TABLE send_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_server_id UUID NOT NULL REFERENCES email_servers(id) ON DELETE CASCADE,
  sent_date TIMESTAMP DEFAULT NOW(),
  is_test BOOLEAN DEFAULT FALSE,
  recipient_count INT,
  success_count INT DEFAULT 0,
  failed_count INT DEFAULT 0,
  status ENUM('pending', 'in_progress', 'completed', 'failed') DEFAULT 'pending',
  error_message TEXT
);
-- Indexes: email_server_id, sent_date (for history view)
```

**No RLS policies in V1.** Row-Level Security keyed to `auth.uid()` requires real
auth, which V1 doesn't have (§4.1). Admin routes are protected by the shared-secret
gate instead. R4 adds `user_id` columns and RLS policies once multi-user auth exists.

### 5.2 Environment Variables

```bash
# Supabase (server-side only — no client-side Supabase session in V1)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your-service-key

# Admin access gate (§4.1)
ADMIN_ACCESS_SECRET=choose-a-long-random-value

# Mailgun (or your chosen SMTP service)
MAILGUN_API_KEY=your-api-key
MAILGUN_FROM_EMAIL=noreply@your-app.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000 (dev) or https://your-app.render.com (prod)
```

> **`NEXT_PUBLIC_APP_URL` is baked in at build time** (that's what the
> `NEXT_PUBLIC_` prefix means). Since M5, the unsubscribe links in sent email
> are built from it — so on Render it must be set to the live origin (no
> trailing slash) *before* the build, and changing it later needs a rebuild
> (Manual Deploy → Clear build cache & deploy).

---

## 6. API Routes (Specification)

Illustrative shapes — exact payloads may evolve during implementation as long as
the underlying capability is there.

### 6.1 Email Manager Routes (admin-gated, §4.1)

**GET /api/manager/subscribers**
- Fetch all subscribers for an email_server (requires email_server_id param)
- Returns: array of {id, email, name, subscription_preference, created_at}
- Filters: ?unsubscribed=false (default), ?limit=50 (pagination)

**POST /api/manager/subscribers**
- Add a single subscriber (admin only)
- Body: {email, name?, email_server_id, subscription_preference?}
- Returns: {id, email, name, subscription_preference, created_at}
- Validation: email format

**PUT /api/manager/subscribers/:id**
- Update subscriber (name and/or preference)
- Body: {name?, subscription_preference?}
- Returns: updated subscriber object

**DELETE /api/manager/subscribers/:id**
- Remove subscriber (admin only)
- Returns: {success: true}

**GET /api/manager/accounts/:id**
- Fetch account metadata
- Returns: {id, name, description, created_at, active}

### 6.2 Email Builder Routes (admin-gated, §4.1)

**GET /api/builder/sections**
- Fetch all sections for an email_server (requires email_server_id param)
- Returns: array of {id, section_type, content, updated_at}

**POST /api/builder/sections**
- Create or update a section
- Body: {email_server_id, section_type, content}
- Returns: {id, section_type, content, updated_at}
- Validation: section_type is a valid enum value

**PUT /api/builder/sections/:id**
- Update a section's content
- Body: {content}
- Returns: updated section object

**DELETE /api/builder/sections/:id**
- Delete a section
- Returns: {success: true}

**POST /api/builder/preview**
- Render email preview (combines all sections into HTML)
- Body: {email_server_id}
- Returns: {subject: string, html: string}
- Implementation: fetch all sections, combine in order (subject → header → title → about → main_body → ad → editor → footer), skip empty sections

### 6.3 Email Sender Routes (admin-gated, §4.1)

**POST /api/sender/send**
- Trigger email send to the full subscriber list
- Body: {email_server_id}
- Returns: {send_id, status, recipient_count, success_count, failed_count, errors}
- Implementation:
  1. Fetch all non-unsubscribed subscribers for email_server_id
  2. Fetch all sections and compose the email
  3. Validate main_body exists (fail before sending if missing — FR-2.10)
  4. Send to all subscribers **without exposing the list to itself or between recipients** — see §7.3 for the recommended approach (batch API with recipient-variables, or bounded-concurrency sends), not a naive sequential loop
  5. Log results to send_history
  6. Return summary

**POST /api/sender/test-send**
- Send one copy of the composed email to the admin's own address (§4.6)
- Body: {email_server_id, test_email}
- Returns: {success: true} or {success: false, error}
- Not counted against the subscriber list; may be logged to send_history with `is_test = true`

**GET /api/sender/send-history**
- Fetch send history for an email_server
- Returns: array of {id, sent_date, is_test, recipient_count, success_count, failed_count, status}
- Filters: ?limit=20 (pagination), ?sort=sent_date (default desc)

### 6.4 Public Routes (No Auth Required)

**GET /subscribe**
- Serve subscribe form page

**POST /api/public/subscribe**
- Handle form submission
- Body: {email, name?} — email_server_id defaults server-side (§4.7), the
  public form doesn't know it
- Returns: {success: true, message} (message varies: new signup vs. reactivated
  a previously-unsubscribed address)
- Validation: email format; an already-active address returns a 409 with a
  clear message; never returns subscriber data
- Note: no preference selection in V1 (defaults to 'daily' — §4.4)

**GET /unsubscribe?token=…** *(M5, §4.13)*
- Server component: resolves the token to an email address and renders a
  Confirm button. Does **not** unsubscribe on load (link-scanner safe).

**POST /api/public/unsubscribe** *(M5, §4.13)*
- Body: {token, action?: "resubscribe"} — default action unsubscribes
- Sets/clears `subscribers.unsubscribed` for the row matching the token;
  idempotent
- Returns: {success: true, email, unsubscribed} or 404 for an unknown token
- Note: `/preferences` is still R3 (§4.4) — no endpoint in V1

---

## 7. Key Implementation Notes

### 7.1 Privacy: No subscriber sees another subscriber's email

**Implementation:**
- Admin routes (which can see the full list) are protected by the shared-secret
  gate (§4.1), not by per-owner database policies (deferred to R4 — see §5.1).
- The public `/subscribe` page never returns or displays existing subscriber data.
- The public `/unsubscribe` page (M5, §4.13) reveals only the one email address
  its token resolves to — the token comes from that person's own email, and no
  other subscriber data is exposed. The unsubscribe link in each sent email is
  per-recipient (a Mailgun variable), so no subscriber sees another's token.
- The send process does not expose the full subscriber list to itself in transit —
  whether implemented as individual sends or a single batched call with per-recipient
  variables (§7.3), no subscriber's address is visible to another subscriber.

### 7.2 Email composition (combining sections into a single email)

**Implementation (illustrative):**
- Fetch all sections for the email_server (ordered: subject → header → title → about → main_body → ad → editor → footer).
- Skip empty sections (content is null or empty string).
- Combine content in order using HTML/markdown templates.
- Return a complete email (subject + body).

```typescript
async function composeEmail(email_server_id: string) {
  const sections = await getSections(email_server_id);
  const html = [
    `<h1>${sections.find(s => s.type === 'title')?.content || ''}</h1>`,
    `<p>${sections.find(s => s.type === 'about')?.content || ''}</p>`,
    `<div>${sections.find(s => s.type === 'main_body')?.content || ''}</div>`,
    // ... other sections
  ].filter(s => s).join('\n');
  return html;
}
```

### 7.3 Mailgun integration — meeting the performance requirement

**NFR-1.1 requires the send to complete within 5 seconds for up to 1000
subscribers.** A sequential loop awaiting one Mailgun API call per subscriber will
not meet that at scale — 1000 sequential HTTP round-trips will take well over 5
seconds. Claude Code should implement one of:

- **Mailgun's batch-sending API** with recipient-variables (one API call handles
  up to 1000 recipients, each personalized, each seeing only their own address) — this
  also directly reinforces the privacy requirement in §7.1, or
- **Bounded-concurrency parallel sends** (e.g., a worker pool of N concurrent
  requests) if batch sending doesn't fit the chosen provider.

The snippet below illustrates the composition/logging logic only — not the
required concurrency model:

```typescript
async function sendEmails(email_server_id: string, subscribers: Subscriber[]) {
  const email = await composeEmail(email_server_id); // {subject, html}
  const results = { success: 0, failed: 0, errors: [] };

  // Illustrative only — replace with batch API or bounded concurrency (see above)
  for (const subscriber of subscribers) {
    try {
      await mailgunSend({
        to: subscriber.email,
        from: process.env.MAILGUN_FROM_EMAIL,
        subject: email.subject,
        html: personalize(email.html, subscriber), // e.g. greet by subscriber.name if present
      });
      results.success++;
    } catch (err) {
      results.failed++;
      results.errors.push({ email: subscriber.email, error: err.message });
    }
  }

  await logSend(email_server_id, results);
  return results;
}
```

### 7.4 Mobile-first UI considerations

**Forms (subscribe):**
- Single-column layout (stacks on mobile).
- Large touch targets (buttons, radio buttons).
- Clear error messages.

**Admin Dashboard:**
- Responsive grid (1 column on mobile, 2–3 on desktop).
- Subscriber list: swipe actions or a menu for edit/delete on mobile.
- Email builder: tabs or accordion for sections (not side-by-side on mobile).

### 7.5 Supabase gotcha: avoid `select(..., { head: true })`

M0 hit this directly: a count-only query using `head: true` (which issues an
HTTP `HEAD` request) hung/misbehaved against this project and made
`/api/health` silently report success on a failed query. Switching to a plain
`GET`-shaped query (e.g. `.select("id").limit(1)`, or `count: "exact"`
*without* `head: true`) fixed it immediately and has been reliable since.
Future milestones needing a count (e.g. M2/M6 dashboards) should use the
non-`head` form.

### 7.6 Gotcha: `<iframe sandbox="">` blocks `target="_blank"` links

M2's email preview renders in a sandboxed iframe (`src/app/admin/(protected)/builder/page.tsx`)
so the admin's pasted HTML/scripts can't touch the app. An empty `sandbox=""`
blocks *everything*, including `target="_blank"` links (the HTML sandbox spec
treats them as "popups"). The link rendered correctly and looked right, but
clicking it silently did nothing — only caught during real phone testing,
since the fix was never actually click-tested beforehand, only confirmed via
the API. Fix: `sandbox="allow-popups allow-popups-to-escape-sandbox"` — the
first re-enables the link, the second ensures the opened tab is a normal,
fully-functional page rather than itself sandboxed (needed since the
destination is someone else's real site). Any future embedded/sandboxed
preview content should allow for this from the start if it contains links.

### 7.7 Gotcha: a Mailgun sending domain needs an MX record too, even though it only sends

M3 hit this during real-device testing: a test-send to an `@me.com` (Apple/
iCloud) address bounced with `Sender address rejected: Domain not found`,
even though SPF, DKIM, and DMARC were all correctly verified for
`mg.randy-snow.com`. Root cause: the domain had no MX record. Apple's mail
servers (and other strict providers) verify a *sending* domain can also
*receive* mail — including bounce notifications — as an anti-spam signal,
before trusting messages from it. A domain with SPF/DKIM/DMARC but no MX
looks incomplete to them. This was originally (incorrectly) assumed
unnecessary for a send-only subdomain — SPF/DKIM/DMARC alone were treated as
sufficient. Fix: add MX records for the sending subdomain pointing to
Mailgun's mail servers (Mailgun's own domain settings page lists the exact
values to use — check there rather than trusting a hostname written here, in
keeping with this doc's "re-verify moving details" note). Delivery to
mailinator.com worked throughout, since it doesn't perform this kind of
strict validation — that made the gap easy to miss until testing against a
real, strict provider. **Any Mailgun sending domain in this project should
get the full SPF + DKIM + DMARC + MX set from day one**, not just the first
three.

---

## 8. Milestones & Acceptance Criteria

### M0: Project Setup

**Goals:** GitHub repo, Next.js scaffolding, Supabase project, admin-access gate, local development ready.

**Tasks:**
1. Create GitHub repo (`email-server-r1`).
2. Initialize Next.js with `create-next-app` (App Router, TypeScript, Tailwind).
3. Set up Supabase project (database only — no auth flows in V1, §4.1).
4. Create `.env.local` with Supabase, Mailgun, and `ADMIN_ACCESS_SECRET` placeholders.
5. Create database schema (run SQL script to create all tables — §5.1; no RLS needed in V1).
6. Add Supabase client library (`@supabase/supabase-js`), used server-side only.
7. Add a lightweight admin-access gate: middleware that checks `ADMIN_ACCESS_SECRET` before allowing access to admin routes/UI (§4.1).
8. Verify local dev server runs (`npm run dev`), admin routes are blocked without the secret, and Supabase queries work from a server route.

**Acceptance Criteria:**
- [x] Repo exists on GitHub with a clean commit history.
- [x] `npm run dev` starts the Next.js dev server without errors.
- [x] Admin routes/UI reject access without the shared secret, and allow it with the correct one.
- [x] A server route can read/write to Supabase (e.g., create and fetch an `email_servers` row).
- [x] `.env.local` is in `.gitignore`.

---

### M1: Email Manager — Subscriber Management

**Goals:** Full CRUD for subscribers. Admin can view, add, edit, delete subscribers.

**Tasks:**
1. Create API routes for subscriber CRUD (§6.1).
2. Create admin dashboard page with a subscriber list (GET /api/manager/subscribers).
3. Create "Add Subscriber" form (email + optional name).
4. Create "Edit Subscriber" form (name, preference).
5. Create "Delete Subscriber" button with confirmation.
6. Add filtering (hide unsubscribed by default).
7. Add pagination (limit 50 per page).
8. Test all operations on mobile and desktop.

**Acceptance Criteria:**
- [x] Admin can view list of subscribers (50 per page, sorted by created_at desc).
- [x] Admin can add a subscriber with email + optional name.
- [x] Admin can update a subscriber's name/preference.
- [x] Admin can delete a subscriber (shows confirmation).
- [x] Unsubscribed subscribers are hidden by default (toggle to show).
- [x] All forms validate email format and show errors.
- [x] All interactions work on mobile (touch-friendly, no horizontal scroll) — verified on a real iPhone (Safari + Chrome).
- [x] Subscriber routes are unreachable without the admin secret (§4.1).

---

### M2: Email Builder — Compose & Preview

**Goals:** Admin can compose email from template sections. Live preview.

**Tasks:**
1. Create API routes for sections CRUD (§6.2).
2. Create Email Builder page with section editors (tabs or accordion).
3. Create rich-text editor for each section (or HTML textarea).
4. Implement `/api/builder/preview` (combine sections into email).
5. Create live preview pane (updates as user types).
6. Create "Save Section" and "Delete Section" buttons.
7. Validate that main_body exists before allowing send (enforced in M3).

**Acceptance Criteria:**
- [x] Admin can view all sections (subject, header, title, about, main_body, ad, editor, footer).
- [x] Admin can edit each section's content (rich text or HTML) — plain textarea + Insert Link helper (§4.10), not a rich-text library.
- [x] Live preview updates as user types (no lag) — client-side composition, no network round-trip.
- [x] Admin can save changes to a section.
- [x] Admin can delete a section (shows confirmation; next send will skip it).
- [x] Email preview correctly combines sections in order.
- [x] Empty sections are skipped (don't break the email layout).
- [x] Editor is usable on mobile (section list does not require horizontal scroll) — verified on a real iPhone (Safari + Chrome).

---

### M3: Email Sender — SMTP Integration

**Goals:** Send emails to subscriber list via Mailgun, within the performance requirement. Support test sends. Log send history.

**Tasks:**
1. Set up Mailgun account and API key.
2. Create `/api/sender/send` route (§6.3), implemented with batch sending or bounded concurrency (§7.3) — not a naive sequential loop.
3. Implement email composition (combine sections; personalize with subscriber name if present).
4. Implement subscriber fetch + filtering (only non-unsubscribed).
5. Implement error handling (log failures, return summary).
6. Create `/api/sender/test-send` route (§4.6, §6.3).
7. Create `/api/sender/send-history` route.

**Acceptance Criteria:**
- [x] `/api/sender/send` successfully sends email to 5+ test subscribers — verified against live Mailgun with real inbox delivery (mailinator + a real Apple/iCloud address), not just API acceptance.
- [x] Each email contains the correct subject, header, body, footer, and other sections.
- [x] Send implementation is designed to meet NFR-1.1 (5 seconds for up to 1000 subscribers) — batched (§4.11); measured at 356ms for 5 recipients in one batch call.
- [x] `/api/sender/test-send` delivers a single copy to the admin's own address without affecting subscriber send counts.
- [x] Mailgun API key is not exposed in logs or frontend code (stored in env var) — confirmed absent from server logs.
- [x] Errors (invalid email, API failures) are logged with details.
- [x] Send history is recorded (sent_date, recipient_count, success_count, failed_count).
- [x] API returns a summary: {success_count, failed_count, errors}.
- [x] Unsubscribed subscribers are NOT sent emails — verified with a deliberately-unsubscribed test row correctly excluded from a real send.
- [x] All emails are sent from the configured from_address.

---

### M4: Admin Send Workflow — Complete End-to-End

**Goals:** Admin can compose, preview, test-send, and send emails from the dashboard.

**Tasks:**
1. Create "Send Email" confirmation screen (shows preview + recipient count).
2. Add "Send Test" and "Send" buttons to the Email Builder or a dedicated send page.
3. Add confirmation dialog for the real send ("Are you sure? This will send to N subscribers.").
4. After send, show result summary (success/failed, errors if any).
5. Add send-history view (recent sends, counts, timestamps, flagging test sends).
6. Test full workflow on mobile and desktop.

**Acceptance Criteria:**
- [x] Admin can navigate from Email Builder to a "Send" page — nav "Send" link + a "Go to Send →" button on the Builder.
- [x] Send page shows email preview and recipient count — client-composed preview (§4.12), exact non-unsubscribed count.
- [x] Admin can send a test copy to themselves before the real send — address remembered in localStorage; logs as a test send.
- [x] Admin can click "Confirm Send" to trigger `/api/sender/send` — via an in-page confirmation panel, not a native dialog (§4.12).
- [x] After send, admin sees results (success_count, failed_count).
- [x] Any failed sends show error details — per-error bulleted list in the result summary.
- [x] Send history is viewable on the dashboard, with test sends distinguishable from real sends — last 5 on the dashboard, last 15 on the send page; "Test"/"Send" badges.
- [x] Workflow is clear and mobile-friendly (no confusing navigation) — verified on a real phone against the Render deployment.

---

### M5: Public Subscribe + Unsubscribe Pages

**Goals:** New subscribers can register without logging in, and existing
subscribers can unsubscribe (and resubscribe) themselves from a link in the
email footer. (`/preferences` self-service is still R3 — see §4.4. Scope
change from v1.5: unsubscribe was pulled forward from R3 — see §4.4 and §4.13.)

**Tasks:**
1. Add the `unsubscribe_token` column (migration `001_m5_unsubscribe_token.sql`).
2. Create a `(public)` route group with its own minimal chrome (§4.13),
   separate from the admin nav.
3. Create public `/subscribe` page (email + optional name) + `POST
   /api/public/subscribe` (§6.4), with re-subscribe reactivating a
   previously-unsubscribed row.
4. Create public `/unsubscribe` page (click-to-confirm, resubscribe option) +
   `POST /api/public/unsubscribe` (§6.4).
5. Append a per-recipient unsubscribe link to every real send's footer (§4.13).
6. Add validation and success/error messages throughout.
7. `/` → `/subscribe`; show the public signup URL on the admin Subscribers page.
8. Test on mobile and desktop.

**Acceptance Criteria:**
- [x] `/subscribe` page is accessible without login, with its own chrome and no admin menu.
- [x] Subscriber can enter email (+ optional name), submit, and receive a success message.
- [x] New subscriber is created in the database with `subscription_preference = 'daily'`.
- [x] Duplicate (already-active) and invalid email submissions show a clear error; a previously-unsubscribed address is reactivated with a "welcome back" message.
- [x] Pages are mobile-responsive and touch-friendly — verified on a real phone against the Render deployment.
- [x] Pages never expose existing subscriber data.
- [x] Every real send carries a working per-subscriber unsubscribe link in the footer (test sends get a tokenless placeholder) — verified end-to-end on a real inbox.
- [x] `/unsubscribe` shows the address, unsubscribes only on an explicit click, and offers resubscribe; the admin list reflects the change (Active / Unsubscribed / All filter) and a follow-up send skips unsubscribed people.

---

### M6: Admin Dashboard

**Goals:** Admin dashboard with all core features accessible from one place.

**Tasks:**
1. Create dashboard landing page (overview of account, subscriber count, recent sends).
2. Create navigation menu (Subscribers, Email Builder, Send History).
3. Add an account/email_server selector (supports multiple newsletters under one admin, per FR-1.8 — e.g. "AI PM Perspective", "Dog Rescue").
4. Integrate M1 (Subscriber Management view).
5. Integrate M2 (Email Builder view).
6. Integrate M4 (Send History view).
7. Test responsive design (mobile, tablet, desktop).

**Acceptance Criteria:**
- [ ] Dashboard shows subscriber count, recent sends (last 5), and quick links.
- [ ] Admin can switch between email_servers if more than one exists.
- [ ] Admin can navigate between sections (Subscribers, Builder, History) without confusion.
- [ ] All sections are responsive (mobile-first).
- [ ] Entire dashboard is unreachable without the admin secret (§4.1).
- [ ] No unintended navigation confusion (back button works as expected).

---

### M7: Image Support, Testing, Deployment & Polish

**Goals:** Add image upload to the Email Builder, then verify the full V1
workflow end-to-end (now including an image) and polish.

> Render setup/deploy (the original tasks 1-3 here) already happened during
> M1 — see §9's update note. M7 is real feature work (image support) plus
> final polish and full-workflow verification, not "first deploy."

**Tasks:**
1. **Image support in the Email Builder** (do this first, before the
   full-workflow retest below):
   - Add a Supabase Storage bucket for uploaded images.
   - Add an "Insert Image" helper per section, mirroring the Insert Link
     helper from M2 (§4.10) — upload a file, get back a URL, insert the
     resulting `<img>` tag at the cursor. No hand-written HTML required.
   - In the meantime, admins can already embed an image by hand-pasting
     `<img src="...">` pointing at any externally-hosted image (e.g. a
     WordPress media library URL) — the section content is raw HTML
     already, so this isn't blocked, just not yet convenient.
2. Test full workflow on live site (enter admin secret → dashboard →
   compose an email that includes an image → test send → send → confirm
   subscriber received it, image included).
3. Fix any bugs discovered in live testing.
4. Add form validation polish (clear error messages, disabled states).
5. Test on real mobile device (not just dev tools).
6. Document any remaining known issues.

**Acceptance Criteria:**
- [ ] Admin can upload an image and insert it into a section without
      hand-writing HTML.
- [ ] Sent emails correctly display the embedded image.
- [ ] App is deployed and accessible at a public URL.
- [ ] Full workflow works end-to-end on live site (subscribe → compose with
      an image → test send → send).
- [ ] Mailgun successfully delivers emails to real inboxes.
- [ ] No unhandled errors in browser console or Render logs.
- [ ] Tested on a real mobile device (phone or tablet).
- [ ] Git history is clean (commits per milestone, descriptive messages).
- [ ] README.md documents how to set up, deploy, and use the app.

---

## 9. Getting Started (First Session — M0)

> **Update (M1):** Render deployment happened during M1, not M7 as originally
> planned here — each milestone now gets deployed and phone-tested as it's
> built, rather than saving the first deploy for the very end. M7 is now
> mostly final polish rather than "first time this has run outside a laptop."
> Free tier is in use for now (see the M1 session notes on the tier decision).

1. **Accounts needed:**
   - GitHub (repo)
   - Supabase (database)
   - Mailgun (email delivery) — can defer to M3
   - Render (deployment) — now set up as of M1, not deferred to M7

2. **M0 Setup:**
   - Create GitHub repo.
   - Run `npx create-next-app@latest` with App Router, TypeScript, Tailwind.
   - Create Supabase project, grab URL + service key.
   - Create `.env.local` with Supabase keys and a chosen `ADMIN_ACCESS_SECRET`.
   - Install `@supabase/supabase-js`.
   - Create database schema (SQL script in §5.1).
   - Add the admin-access gate middleware (§4.1).
   - Verify local dev works: `npm run dev`, admin routes blocked/unblocked correctly.

3. **First Claude Code prompt:**
   - Start with **M0** (project setup).
   - Pass Claude Code the relevant section of this spec (§8, M0).
   - After M0 is done (verified, committed), hand Claude Code the next milestone.
   - Always reference §1 in prompts (§1.1 mobile-first, §1.2 explain before doing).

4. **Commit discipline:**
   - Commit after each major feature (one per task in §8).
   - Commit messages: "M0: Project setup" → "M1: Add subscriber CRUD" → etc.
   - This creates a clear build story for portfolios and demos.

---

## 10. Upgrade Paths (Post-V1, R2+)

### R2: Content Automation & Scheduling

- **Content Builder app:** separate Next.js app that generates daily content (searches, summarizes, PM perspective).
- **Conductor agent:** orchestrates Content Builder → Email Server send.
- **Scheduled sends:** Render cron job triggers send at specified time (e.g., 8 AM daily).
- **Message queuing:** async/background job support (Render Background Workers) so send doesn't block the request.

### R3: Weekly & Subscriber Features

- **Weekly emails:** add preference for weekly sends; compose separate weekly email.
- ~~**Self-service unsubscribe page**~~ — **done in V1 (M5, §4.13):** `/unsubscribe` with a per-subscriber token link in every send's footer. R3 only needs to add engagement-webhook wiring if desired.
- **Self-service preferences page:** public `/preferences` page with auto-preference-update link in email footer (still V1-excluded — see §4.4). The M5 token mechanism (`subscribers.unsubscribe_token`, §4.13) is the foundation this reuses.
- **Engagement tracking:** hook into Mailgun webhooks to log opens, clicks (basic analytics).

### R4: Multi-User

- **Real authentication:** Supabase Auth (sign-up/sign-in/sessions) replacing the V1 shared-secret gate (§4.1).
- **RLS policies:** `user_id` columns + Row-Level Security replacing the V1 no-RLS approach (§5.1).
- **Super Admin accounts:** role to manage accounts (activate, hold, delete).
- **Payment processing:** integrate Stripe for billing (tiers: free ≤100 subscribers, $20/mo for 100–1000, etc.).
- **Custom sending domains:** allow users to set their own SMTP from_address / domain.
- **Per-user SMTP:** support custom Mailgun accounts (bring your own API key) instead of shared company key.
- **User-specific analytics:** dashboard showing opens, clicks, subscriber growth per account.

---

## 11. Known Limitations & Design Decisions

### R1 Is Single-Admin, No User System

- V1 has no sign-up/sign-in/sessions. A single shared secret gates admin routes and the admin UI (§4.1).
- R4 replaces the shared-secret gate with real Supabase Auth + RLS for multiple users.

### Email Sending Must Meet a Performance Bar, Not Just "Work"

- `/api/sender/send` must complete within ~5 seconds for up to 1000 subscribers (NFR-1.1). This rules out a naive sequential per-subscriber loop — implement via Mailgun batch sending or bounded concurrency (§7.3).
- R2 may move this to a background job (Render Background Worker) so the request returns immediately and the send runs in the background, for arbitrarily large lists.

### Known Browser Quirk: Chrome on iOS can intermittently fail to load a page

- During M1 phone testing, tapping "Edit" in the subscriber list occasionally
  produced Chrome's native "This page couldn't load" error on iPhone — but
  only in regular (non-Incognito) Chrome for iOS, never in Safari, Incognito
  Chrome, or desktop Chrome (confirmed via a live automated reproduction with
  full console/network logging: zero errors, zero failed requests, all
  same-origin).
- Root cause: a Chrome-for-iOS background feature (predictive preloading
  and/or its page-assist features) interfering with the page — confirmed by
  the bug disappearing in Incognito, which disables those features. Nothing
  in the app is doing this; there's no cross-site traffic and no failed
  requests anywhere in the trace.
- Not something the app can detect or work around from inside the page. If it
  resurfaces and bothers a real user, the workaround is Incognito mode or
  Safari; otherwise no action needed.

### No Engagement Analytics in R1

- Mailgun delivers emails, but we don't track opens/clicks.
- R3 adds webhooks to capture this data.

### No Self-Service Account Changes in R1

- The admin secret is set via environment variable; there's no in-app way to rotate it. Rotating it means updating the env var and redeploying.
- R4 adds self-service account management once real auth exists.

### Main Body Content Is Manual in R1

- Admin pastes content into the editor.
- R2 integrates Content Builder to fetch content automatically.

### Self-Service Unsubscribe Is in V1; Preferences Is Not

- V1 ships self-service unsubscribe/resubscribe (M5, §4.13) — pulled forward
  from R3 because real sends need a working opt-out link.
- `/preferences` (choosing daily vs. weekly) stays in R3: V1 is daily-only, so
  there's nothing to choose yet. It reuses M5's `unsubscribe_token` mechanism.

### Public Endpoints Have No Rate Limiting in V1

- `/api/public/subscribe` and `/api/public/unsubscribe` are unauthenticated and
  not rate-limited. Acceptable for a low-traffic single-operator V1; add a
  limiter (or a CAPTCHA on subscribe) if abuse shows up. Unsubscribe is
  idempotent and only ever affects the single row its token points at.

---

*End of Build Spec v1.6*
