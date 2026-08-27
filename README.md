# CG Client Tracker

An internal tool for CG Technologies to track client quotes and follow-ups,
projects, and relationship touchpoints (personal check-ins and quarterly
business reviews), with daily email reminders for anything due.

Built with Next.js (App Router), Supabase (Postgres + Auth), Tailwind CSS,
Resend for email, and deployed on Railway.

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
   `profiles` auto-sync trigger, and row-level security policies.
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

## 4. Push to GitHub

```bash
git remote add origin <your-empty-repo-url>
git add .
git commit -m "Initial commit"
git push -u origin main
```

## 5. Deploy on Railway

1. In the Railway dashboard, **New Project → Deploy from GitHub repo**, and
   pick this repository. Railway auto-detects the Next.js app and runs
   `npm run build` / `npm run start`.
2. Under the service's **Variables** tab, add every variable from
   `.env.example` with your real values, plus:
   - `NEXT_PUBLIC_APP_URL` = the Railway-provided domain (or your custom
     domain), e.g. `https://cg-client-tracker.up.railway.app`
3. Deploy. Once it's live, visit the URL and sign in.

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
- `src/app/(dashboard)/` — the authenticated app: dashboard overview,
  clients, quotes, projects, touchpoints, and team pages.
- `src/app/login/`, `src/app/sign-up/` — auth pages.
- `src/app/api/reminders/route.ts` — the daily email digest endpoint.
- `src/lib/supabase/` — Supabase client helpers for browser, server, and
  admin (service-role) contexts.
- `src/proxy.ts` — refreshes the auth session and redirects signed-out users
  to `/login` (Next.js 16 renamed `middleware.ts` to `proxy.ts`).
