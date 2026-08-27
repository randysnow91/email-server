# Claude Code Build Spec — Email Server

**Status:** v1.1 — READY FOR M0  
**Derived from:** `Email_Server_R1_SRD.md` (the requirements document — read it first) + planning review (2026-08-27)  
**Audience:** Claude Code (the coding agent) + the builder (product owner)

| Version | Date | Summary |
|---------|------|---------|
| v1.0 | 2026-08-26 | Initial spec. All milestones M0–M7 scoped and acceptance criteria defined. |
| v1.1 | 2026-08-27 | Planning review with Claude Code. Rescoped M5 to match the SRD's R1/R3 boundary (dropped self-service unsubscribe/preferences pages). Replaced the V1 Supabase Auth requirement with a lightweight admin-access gate (SRD assumes a trusted single admin, not a user system). Added a `name` field to subscribers (required by FR-3.2, missing from the original schema). Added a test-send capability (called for in SRD §9.2/§8.2, missing from v1.0). Flagged the sequential per-subscriber send loop as insufficient for NFR-1.1. Milestones and acceptance criteria are now the binding contract; schema and code samples throughout are illustrative, not prescriptive — see the note below. |

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
  │
  ▼
Supabase (Postgres)
  ├─ email_servers (account metadata)
  ├─ subscribers (list of subscribers per account)
  ├─ email_sections (template sections — header, footer, body, etc.)
  └─ send_history (log of every send)
```

Self-service `/unsubscribe` and `/preferences` pages, and Supabase's `auth.users`,
are **R3/R4** — not built in V1. See §4.1 and §4.4.

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

### 4.4 Only `/subscribe` is public in V1

**Decision:** `/subscribe` is the only unauthenticated public page in V1.
Self-service `/unsubscribe` and `/preferences` pages are **not built in V1**.

**Why:** The SRD is explicit that these are R3: *"R1 is daily only... Unsubscribe
and preferences will also come with R3"* (SRD §2), listed under *Excluded from
Release 1* (SRD §3), and FR-1.7 tags preference self-service `[R3]`. In V1, the
admin removes subscribers manually (FR-1.6) — this is already covered by the Email
Manager (M1).

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

---

## 5. Data Model & Database Schema

The schema below is a **starting point**, not a required implementation — adjust
column types, indexes, etc. as needed during M0/M1 as long as the data it needs to
hold (§7 of the SRD, plus §4.5 above) is covered.

### 5.1 Tables (Postgres via Supabase)

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
  unsubscribed BOOLEAN DEFAULT FALSE
);
-- Indexes: email_server_id, email (for lookups), unsubscribed (for filtering)

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
- Body: {email, name?, email_server_id}
- Returns: {success: true, message: "Thanks for subscribing!"}
- Validation: email format, email_server_id exists
- Note: no preference selection in V1 (defaults to 'daily' — §4.4); no unsubscribe/preferences endpoints in V1 (§4.4)

---

## 7. Key Implementation Notes

### 7.1 Privacy: No subscriber sees another subscriber's email

**Implementation:**
- Admin routes (which can see the full list) are protected by the shared-secret
  gate (§4.1), not by per-owner database policies (deferred to R4 — see §5.1).
- The public `/subscribe` page never returns or displays existing subscriber data.
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
- [ ] Repo exists on GitHub with a clean commit history.
- [ ] `npm run dev` starts the Next.js dev server without errors.
- [ ] Admin routes/UI reject access without the shared secret, and allow it with the correct one.
- [ ] A server route can read/write to Supabase (e.g., create and fetch an `email_servers` row).
- [ ] `.env.local` is in `.gitignore`.

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
- [ ] Admin can view list of subscribers (50 per page, sorted by created_at desc).
- [ ] Admin can add a subscriber with email + optional name.
- [ ] Admin can update a subscriber's name/preference.
- [ ] Admin can delete a subscriber (shows confirmation).
- [ ] Unsubscribed subscribers are hidden by default (toggle to show).
- [ ] All forms validate email format and show errors.
- [ ] All interactions work on mobile (touch-friendly, no horizontal scroll).
- [ ] Subscriber routes are unreachable without the admin secret (§4.1).

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
- [ ] Admin can view all sections (subject, header, title, about, main_body, ad, editor, footer).
- [ ] Admin can edit each section's content (rich text or HTML).
- [ ] Live preview updates as user types (no lag).
- [ ] Admin can save changes to a section.
- [ ] Admin can delete a section (shows confirmation; next send will skip it).
- [ ] Email preview correctly combines sections in order.
- [ ] Empty sections are skipped (don't break the email layout).
- [ ] Editor is usable on mobile (section list does not require horizontal scroll).

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
- [ ] `/api/sender/send` successfully sends email to 5+ test subscribers.
- [ ] Each email contains the correct subject, header, body, footer, and other sections.
- [ ] Send implementation is designed to meet NFR-1.1 (5 seconds for up to 1000 subscribers) — batched or concurrent, not fully sequential.
- [ ] `/api/sender/test-send` delivers a single copy to the admin's own address without affecting subscriber send counts.
- [ ] Mailgun API key is not exposed in logs or frontend code (stored in env var).
- [ ] Errors (invalid email, API failures) are logged with details.
- [ ] Send history is recorded (sent_date, recipient_count, success_count, failed_count).
- [ ] API returns a summary: {success_count, failed_count, errors}.
- [ ] Unsubscribed subscribers are NOT sent emails.
- [ ] All emails are sent from the configured from_address.

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
- [ ] Admin can navigate from Email Builder to a "Send" page.
- [ ] Send page shows email preview and recipient count.
- [ ] Admin can send a test copy to themselves before the real send.
- [ ] Admin can click "Confirm Send" to trigger `/api/sender/send`.
- [ ] After send, admin sees results (success_count, failed_count).
- [ ] Any failed sends show error details.
- [ ] Send history is viewable on the dashboard, with test sends distinguishable from real sends.
- [ ] Workflow is clear and mobile-friendly (no confusing navigation).

---

### M5: Public Subscribe Page

**Goals:** New subscribers can register without logging in. (Unsubscribe/preferences self-service is R3 — see §4.4; admin removes subscribers manually via M1 in V1.)

**Tasks:**
1. Create public `/subscribe` page (email + optional name).
2. Implement `POST /api/public/subscribe` (§6.4).
3. Add validation (email format, email_server_id exists).
4. Add success/error messages.
5. Test on mobile and desktop.

**Acceptance Criteria:**
- [ ] `/subscribe` page is accessible without login.
- [ ] Subscriber can enter email (+ optional name), submit, and receive a success message.
- [ ] New subscriber is created in the database with `subscription_preference = 'daily'`.
- [ ] Duplicate/invalid email submissions show a clear error.
- [ ] Page is mobile-responsive and touch-friendly.
- [ ] Page never exposes existing subscriber data.

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

### M7: Testing, Deployment & Polish

**Goals:** Deploy to Render, verify end-to-end, polish UI.

**Tasks:**
1. Set up Render account and connect GitHub repo.
2. Configure Render environment variables (Supabase keys, Mailgun key, `ADMIN_ACCESS_SECRET`, app URL).
3. Deploy to Render (web service, Node.js).
4. Test full workflow on live site (enter admin secret → dashboard → compose → test send → send → confirm subscriber received it).
5. Fix any bugs discovered in live testing.
6. Add form validation polish (clear error messages, disabled states).
7. Test on real mobile device (not just dev tools).
8. Document any remaining known issues.

**Acceptance Criteria:**
- [ ] App is deployed and accessible at a public URL (e.g., https://email-server-r1.render.com).
- [ ] Full workflow works end-to-end on live site (subscribe → compose → test send → send).
- [ ] Mailgun successfully delivers emails to real inboxes.
- [ ] No unhandled errors in browser console or Render logs.
- [ ] Tested on a real mobile device (phone or tablet).
- [ ] Git history is clean (commits per milestone, descriptive messages).
- [ ] README.md documents how to set up, deploy, and use the app.

---

## 9. Getting Started (First Session — M0)

1. **Accounts needed:**
   - GitHub (repo)
   - Supabase (database)
   - Mailgun (email delivery) — can defer to M3
   - Render (deployment) — can defer to M7

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
- **Self-service unsubscribe page:** public `/unsubscribe` page with auto-unsubscribe link (with token) in email footer (explicitly excluded from V1 — see §4.4).
- **Self-service preferences page:** public `/preferences` page with auto-preference-update link in email footer (explicitly excluded from V1 — see §4.4).
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

### No Engagement Analytics in R1

- Mailgun delivers emails, but we don't track opens/clicks.
- R3 adds webhooks to capture this data.

### No Self-Service Account Changes in R1

- The admin secret is set via environment variable; there's no in-app way to rotate it. Rotating it means updating the env var and redeploying.
- R4 adds self-service account management once real auth exists.

### Main Body Content Is Manual in R1

- Admin pastes content into the editor.
- R2 integrates Content Builder to fetch content automatically.

---

*End of Build Spec v1.1*
