# CG Client Tracker

An internal tool for CG Technologies to track client quotes and follow-ups,
projects, and relationship touchpoints (personal check-ins and quarterly
business reviews), with daily email reminders for anything due. Optionally,
it can connect a Microsoft 365 mailbox read-only and use AI to surface
insights on the dashboard — quotes that seem to need follow-up, possible new
opportunities, clients gone quiet — without ever auto-editing your records.

Built with Next.js (App Router), Supabase (Postgres + Auth), Tailwind CSS,
Resend for email, Anthropic's API for AI insights, and deployed on Railway.

## 1. Local setup

```bash
npm install
cp .env.example .env.local   # then fill in the values, see below
npm run dev
```

Open http://localhost:3000 — you'll be redirected to `/login`. Use the
"Create an account" link once to make your first user, then see step 3 below
to make that user an admin.

## 2. Set up Supabase

1. Create a new project at [supabase.com](https://supabase.com).
2. In the Supabase dashboard, open **SQL Editor**, paste the contents of
   `supabase/schema.sql`, and run it. This creates all tables, the
   `profiles` auto-sync trigger, and row-level security policies. If you're
   using Microsoft 365 login and mailbox sync (step 4 below), also run
   `supabase/002_email_integration.sql` afterward, and if you're using AI
   insights (step 5), also run `supabase/003_ai_suggestions.sql`.
3. Go to **Project Settings → API** and copy:
   - `Project URL` → `NEXT_PUBLIC_SUPABASE_URL`
   - `anon public` key → `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `service_role` key → `SUPABASE_SERVICE_ROLE_KEY` (server-only, keep secret)
4. (Optional but recommended for an internal tool) In **Authentication →
   Providers → Email**, you can turn off "Confirm email" so new team members
   can sign in immediately after creating an account, instead of waiting on
   a confirmation email.

### Making the first admin

Everyone who signs up defaults to the `sales` role. To promote your first
user to `admin` (so you can manage roles from the Team page), run this once
in the Supabase SQL Editor after that user has signed up:

```sql
update public.profiles set role = 'admin' where email = 'you@cgtechnologies.com';
```

## 3. Set up Resend (email reminders)

1. Create an account at [resend.com](https://resend.com) and verify a sending
   domain (or use their test domain while developing).
2. Create an API key → `RESEND_API_KEY`.
3. Set `REMINDERS_FROM_EMAIL` to a verified sender, e.g.
   `"CG Client Tracker <reminders@cgtechnologies.com>"`.
4. Pick any random string for `CRON_SECRET` — it's the shared secret Railway
   will use to call the reminder endpoint (see step 5).

## 4. Set up Microsoft 365 (optional — SSO login and mailbox sync)

This adds a "Sign in with Microsoft" button and, separately, the ability to
connect one mailbox so the app can pull in emails matched to a known client
(used both for the "Linked emails" list on each client's page, and — if you
also do step 5 — as the raw material for AI insights). Skip this section
entirely if you'd rather stick with email/password login only and manual
tracking.

### Register an Azure AD app

You'll need Global Administrator or Application Administrator access in the
CG Technologies Microsoft 365 tenant.

1. Go to [entra.microsoft.com](https://entra.microsoft.com) (Microsoft Entra
   admin center) → **App registrations → New registration**.
2. Name it "CG Client Tracker". Under "Supported account types," choose
   **Accounts in this organizational directory only (CG Technologies only)**.
3. Under **Redirect URI**, add a **Web** platform redirect, and enter your
   Supabase project's auth callback URL:
   ```
   https://<your-project-ref>.supabase.co/auth/v1/callback
   ```
   (find `<your-project-ref>` in your Supabase project URL).
4. Click **Register**. On the app's Overview page, copy:
   - **Application (client) ID** → `AZURE_CLIENT_ID`
   - **Directory (tenant) ID** → `AZURE_TENANT_ID`
5. Go to **Certificates & secrets → New client secret**. Copy the secret's
   **value** immediately (it's hidden after you leave the page) →
   `AZURE_CLIENT_SECRET`.
6. Go to **Authentication**, and under the same Web platform entry, add a
   second redirect URI for the mailbox-sync flow:
   ```
   https://<your-railway-domain>/api/mail/callback
   ```
7. Go to **API permissions → Add a permission → Microsoft Graph →
   Delegated permissions**, and add: `openid`, `profile`, `email`,
   `offline_access`, `User.Read`, `Mail.Read`. Then click **Grant admin
   consent for CG Technologies**.

### Enable it in Supabase (for login)

In the Supabase dashboard: **Authentication → Providers → Azure**. Turn it
on, paste in the `AZURE_CLIENT_ID` and `AZURE_CLIENT_SECRET` from above, and
for the Azure Tenant URL/ID field use your `AZURE_TENANT_ID`.

### Add the environment variables

Add `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET`, and `AZURE_TENANT_ID` to your
`.env.local` (and later, to Railway's Variables tab — see step 6).

### Using it

- The login page now has a "Sign in with Microsoft" button — anyone in the
  CG Technologies tenant can use it, and it creates their account
  automatically on first sign-in (defaulting to the `sales` role, same as
  email sign-up).
- Each team member can separately connect their own mailbox from the
  **Mailbox** page in the app (`/settings/mail`) — this is a distinct
  permission grant from login, since it asks for `Mail.Read` access.
- After connecting, click **Sync now**, or wait for the scheduled sync job
  (see step 7) — matching emails show up under **Linked emails** on the
  relevant client's page.

## 5. Set up Anthropic (optional — AI insights on the dashboard)

This powers the "Insights" section at the top of the dashboard. It only
works if Microsoft 365 mailbox sync (step 4) is also set up, since insights
are generated from synced emails. Skip this if you don't want AI involved —
everything else in the app works fine without it.

1. Create an account at [console.anthropic.com](https://console.anthropic.com)
   (a separate, pay-as-you-go developer account — not the same as a regular
   claude.ai login) and add a payment method under **Settings → Billing**.
2. Go to **API Keys → Create Key** → `ANTHROPIC_API_KEY`.
3. That's it — `ANTHROPIC_MODEL` is optional and defaults to a small, cheap
   model well-suited to this kind of summarization; only set it if you want
   a different one.

Costs scale with how many clients have recent email activity each time the
job runs (see step 7) — for a modest client list checked once or twice a
day, this should be inexpensive, but it is metered, so it's worth keeping an
eye on usage in the Anthropic console for the first week.

## 6. Push to GitHub

```bash
git remote add origin <your-empty-repo-url>
git add .
git commit -m "Initial commit"
git push -u origin main
```

## 7. Deploy on Railway

1. In the Railway dashboard, **New Project → Deploy from GitHub repo**, and
   pick this repository. Railway auto-detects the Next.js app and runs
   `npm run build` / `npm run start`.
2. Under the service's **Variables** tab, add every variable from
   `.env.example` with your real values, plus:
   - `NEXT_PUBLIC_APP_URL` = the Railway-provided domain (or your custom
     domain), e.g. `https://cg-client-tracker.up.railway.app`
3. Deploy. Once it's live, visit the URL and sign in.

Note: if you set up Microsoft 365 (step 4) *after* your first deploy, go
back and add the `/api/mail/callback` redirect URI in Azure once you know
your real Railway domain, since it can't be added until the domain exists.

### Daily reminder job

The app exposes `GET /api/reminders`, which emails each team member a digest
of their quotes, projects, and touchpoints that are due or overdue, and is
safe to call more than once a day (it won't re-remind about the same item on
the same day). Wire it up as a Railway **Cron Job** service in the same
project:

1. **New → Cron Job**, pointing at this same repo (or set it to run a plain
   `curl` image — either works).
2. Schedule: e.g. `0 13 * * *` (13:00 UTC ≈ 9am Eastern).
3. Command:
   ```bash
   curl -sf -X GET "$NEXT_PUBLIC_APP_URL/api/reminders" -H "X-Cron-Secret: $CRON_SECRET"
   ```
4. Make sure `NEXT_PUBLIC_APP_URL` and `CRON_SECRET` are set as variables on
   that cron service too (Railway lets you share variables across services
   in a project).

### Mailbox sync job (only if you set up Microsoft 365)

Same idea, a second Railway Cron Job hitting `/api/mail-sync` — this keeps
connected mailboxes synced without anyone clicking "Sync now":

1. **New → Cron Job** in the same project.
2. Schedule: e.g. `*/30 * * * *` (every 30 minutes).
3. Command:
   ```bash
   curl -sf -X GET "$NEXT_PUBLIC_APP_URL/api/mail-sync" -H "X-Cron-Secret: $CRON_SECRET"
   ```
4. Same `NEXT_PUBLIC_APP_URL` and `CRON_SECRET` variables as above.

### AI insights job (only if you set up Anthropic)

A third Railway Cron Job hitting `/api/suggestions`, ideally scheduled to
run shortly *after* the mailbox sync job so it has fresh emails to work
from:

1. **New → Cron Job** in the same project.
2. Schedule: e.g. `15 * * * *` (a quarter past every hour — since mail sync
   above runs every 30 minutes, this trails it by up to 15 minutes; once or
   twice a day is also plenty for most cases, e.g. `0 14 * * *`).
3. Command:
   ```bash
   curl -sf -X GET "$NEXT_PUBLIC_APP_URL/api/suggestions" -H "X-Cron-Secret: $CRON_SECRET"
   ```
4. Same `NEXT_PUBLIC_APP_URL` and `CRON_SECRET` variables as above, plus
   make sure `ANTHROPIC_API_KEY` is set on the main app service (the cron
   service just calls the endpoint; the key itself only needs to be where
   the app runs).

You don't strictly need this cron job — the **Refresh insights** button on
the dashboard runs the same thing on demand, capped to the 10 most recently
active clients per click so it doesn't time out.

## How access works

This is built for a small, trusted internal team: any signed-in team member
can see and edit every client, quote, project, and touchpoint — nobody is
locked out of a record just because a teammate owns it. The one exception is
the **Team** page (`/team`), which only `admin` role users can see, and which
is where roles get assigned. If you'd rather restrict quotes/projects/
touchpoints to only be editable by their owner, tighten the row-level
security policies in `supabase/schema.sql` (see the comment above the RLS
section).

## Project structure

- `supabase/schema.sql` — the full database schema, run once against a new
  Supabase project.
- `supabase/002_email_integration.sql` — adds mailbox connections and linked
  emails; run this only if you're using Microsoft 365 (step 4).
- `supabase/003_ai_suggestions.sql` — adds the `suggestions` table and widens
  email matching beyond just quote/project-prefixed subjects; run this only
  if you're using AI insights (step 5, requires step 4 too).
- `src/app/(dashboard)/` — the authenticated app: dashboard overview,
  clients, quotes, projects, touchpoints, mailbox settings, and team pages.
- `src/app/login/`, `src/app/sign-up/` — auth pages.
- `src/app/auth/callback/` — Supabase's OAuth callback for "Sign in with
  Microsoft" (login only, no mailbox access).
- `src/app/api/mail/connect/`, `src/app/api/mail/callback/` — the separate
  OAuth flow for connecting a mailbox (requests `Mail.Read`).
- `src/app/api/reminders/route.ts` — the daily email digest endpoint.
- `src/app/api/mail-sync/route.ts` — pulls client-matched emails from
  connected mailboxes and links them to clients.
- `src/app/api/suggestions/route.ts` — generates AI insights from each
  active client's recent synced emails and tracked records.
- `src/lib/microsoft-graph.ts`, `src/lib/mail-sync.ts` — Microsoft Graph
  token handling and the email-to-client matching logic.
- `src/lib/anthropic.ts`, `src/lib/suggestions.ts` — the Anthropic API call
  and the per-client prompt/dedupe logic behind AI insights.
- `src/lib/supabase/` — Supabase client helpers for browser, server, and
  admin (service-role) contexts.
- `src/proxy.ts` — refreshes the auth session and redirects signed-out users
  to `/login` (Next.js 16 renamed `middleware.ts` to `proxy.ts`).

## How email matching works

An email is linked to a client if the sender or one of the recipients
matches that client's saved contact email — either exactly, or by sharing
the same company domain (e.g. anyone `@acmecorp.com` matches a client whose
contact email is `jane@acmecorp.com`). Free email domains like Gmail or
Outlook.com are excluded from domain matching, so those only match on an
exact address, to avoid lumping unrelated clients together. If a client's
contact email is missing or wrong in the Clients page, its emails won't
match — that's the first thing to check if something doesn't show up. Every
matched email is kept (not just ones about quotes or projects) so AI
insights have real context to work with; on each client's page, one whose
subject starts with "quote" or "project" gets that badge, everything else
is tagged "general."

## How AI insights work

Once mailbox sync and Anthropic are both set up, the suggestions job looks
at every client with email activity in the last 30 days, and for each one
sends the model: their recent emails (subject, sender, date, and a short
preview snippet — not the full email body, which is never stored), plus
what's already tracked for them (open quotes, active projects, recent
touchpoints). It's explicitly told to flag only things that seem genuinely
new or actionable, and it's fine — expected, even — for it to return nothing
for a client where nothing's changed. Results land as cards in the
dashboard's Insights section, each with **Done** and **Dismiss** buttons; it
never writes to a client, quote, project, or touchpoint record directly. The
same client/kind combination won't be suggested again for 7 days once
there's an open suggestion for it, so a recurring situation doesn't spam the
dashboard with duplicates on every sync.
