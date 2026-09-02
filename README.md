# Email Server

A small newsletter platform: subscribers sign themselves up on a public page,
an admin composes an email from reusable sections, previews it, sends a test to
themselves, then sends to the whole list. Built one milestone at a time as a
learning project.

**Status:** V1 in progress — M0–M6 complete, M7 (image support + final polish)
remaining. See [`docs/V1_BUILD-SPEC.md`](docs/V1_BUILD-SPEC.md) for the full
milestone history and the reasoning behind every decision.

## Features

- **Public subscribe / unsubscribe** — no login. Unsubscribe links are
  per-recipient and tokenised; people can resubscribe themselves.
- **Email builder** — eight section types (subject, header, title, about, main
  body, ad, editor's note, footer), a live preview, and an "Insert Link"
  helper. Sections are stored as raw HTML.
- **Sending via Mailgun** — batch send with per-recipient personalisation, so
  no subscriber ever sees another's address, and 1,000 recipients go out in
  one API call.
- **Send workflow** — preview, recipient count, test send, a confirmation step,
  and a result summary with per-error detail.
- **Admin dashboard** — overview, one consistent top navigation, a full send
  history, and multiple newsletters under one admin with a switcher.

## Tech stack

| Layer | Choice |
|---|---|
| Framework | Next.js (App Router), TypeScript |
| Database | Supabase (managed Postgres) — server-side access only, no RLS in V1 |
| Email | Mailgun REST API (no SDK) |
| Hosting | Render (one always-on web service) |
| Styling | Tailwind CSS |

## Architecture

```
Public pages  ── /subscribe, /unsubscribe          (no auth)
Admin pages   ── /admin/*                           (shared-secret gate)
API routes    ── /api/public/*    subscribe / unsubscribe
                 /api/manager/*   subscribers, newsletters
                 /api/builder/*   sections, preview
                 /api/sender/*    send, test-send, history
                 /api/admin/*     login / logout
Supabase      ── email_servers, subscribers, email_sections, send_history
```

- Admin access is a single shared secret (`ADMIN_ACCESS_SECRET`) checked by
  `src/proxy.ts` on every `/admin` and admin-API request. There is no user
  system in V1 — the SRD assumes one trusted admin.
- The "active newsletter" is an `email_server_id` cookie; `getActiveEmailServerId()`
  scopes every admin query to it.
- `composeEmail()` (`src/lib/composeEmail.ts`) is pure and shared by the live
  preview and the real send, so they can't drift apart.

## Local development

Requires Node 20+, a Supabase project, and (for sending) a Mailgun account.

```bash
npm install
cp .env.local.example .env.local   # then fill in real values

# create the database schema: paste supabase/schema.sql into the
# Supabase dashboard SQL editor and run it, then run each file in
# supabase/migrations/ in order

npm run dev                        # http://localhost:3000
```

`npm run build` type-checks and lints as part of the build.

### Environment variables

See [`.env.local.example`](.env.local.example) for the full list. In short:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL`, `SUPABASE_SERVICE_KEY` | Server-side database access |
| `ADMIN_ACCESS_SECRET` | The admin gate — use a long random string |
| `MAILGUN_API_KEY`, `MAILGUN_DOMAIN`, `MAILGUN_FROM_EMAIL` | Email delivery |
| `NEXT_PUBLIC_APP_URL` | Public origin; baked in at build time, used for unsubscribe links |

`.env.local` is gitignored. No secret is committed to this repo or its history.

## Deployment

Deployed on Render from the `master` branch:

1. Web service → build `npm install && npm run build`, start `npm run start`.
2. Set every variable above in the Render environment. `NEXT_PUBLIC_APP_URL`
   must be the live URL **before** the build (it's compiled in).
3. Push to `master` → Render builds and deploys.

## Security notes

V1 is a single-operator app; the security model is deliberately lightweight but
not careless:

- **Admin gate** — one shared secret, compared in constant time
  (`src/lib/adminAuth.ts`) in both the login route and the middleware.
- **Login rate limiting** — failed attempts from an IP are locked out after a
  threshold (`src/lib/rateLimit.ts`). The secret's own entropy already makes
  brute force infeasible; this is defense in depth and stops the endpoint
  being used to hammer the server.
- **Subscriber privacy** — the send path never exposes the list to itself
  (Mailgun batch send with recipient variables), and no public response ever
  returns subscriber data.
- **No secrets in the repo** — everything sensitive is an environment variable.
- **Known V1 limitations** (see `docs/V1_BUILD-SPEC.md` §11): no Supabase RLS
  (there's no user to key it to yet), no in-app secret rotation, public
  endpoints aren't rate-limited beyond login. R4 replaces the shared secret
  with real auth.

## Project docs

- [`docs/SRD.md`](docs/SRD.md) — the requirements document (what and why)
- [`docs/V1_BUILD-SPEC.md`](docs/V1_BUILD-SPEC.md) — how it's being built, milestone by milestone, with every decision recorded
