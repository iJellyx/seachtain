# Seachtain — setup for real teacher accounts

This wires Supabase (auth + Postgres) into the existing static deploy. Until
these steps are done, Seachtain runs in local-only mode — fully usable, but
each teacher's data lives only on their own browser.

Total time: ~15 minutes.

## 1. Create a Supabase project

1. Go to <https://supabase.com> and sign up (free tier is plenty).
2. **New project** → pick an EU region (e.g. `eu-west-1` / Dublin).
3. Choose a strong database password, save it. You won't need it often.
4. Wait ~90 seconds for the project to spin up.

## 2. Run the schema

1. In your Supabase project, open **SQL editor** (left sidebar).
2. **New query**. Paste the entire contents of
   [`supabase-schema.sql`](supabase-schema.sql) and hit **Run**.
3. You should see "Success. No rows returned." The script creates three
   tables (`profiles`, `plans`, `learning_events`) with Row Level Security,
   indexes, and an `updated_at` trigger. Safe to re-run.

## 3. Configure auth

1. **Authentication → Providers** → make sure **Email** is enabled and
   **Confirm email** is ON.
2. **Authentication → URL configuration**:
   - **Site URL**: `https://seachtain.vercel.app` (or your custom domain).
   - **Redirect URLs**: add the same URL. If you use preview deploys on
     Vercel, also add `https://*.vercel.app`.
3. (Optional, recommended) **Authentication → Email templates**:
   customise the *Magic Link* email with your brand voice. Default works
   fine.

## 4. Grab the public keys

1. **Project settings → API** (gear icon, left sidebar).
2. Copy two values:
   - **Project URL** — looks like `https://abcdefgh.supabase.co`
   - **anon public** key — a long `eyJhbG…` string.
     (Ignore the `service_role` key. Never expose it.)

## 5. Add them to Vercel

1. Your Vercel project → **Settings → Environment Variables**.
2. Add two variables, apply to **Production** (and Preview if you want):
   - `SUPABASE_URL` = Project URL from step 4
   - `SUPABASE_ANON_KEY` = anon public key from step 4
3. **Deployments → latest → Redeploy** (env vars only take effect on new builds).

## 6. Verify

1. Open <https://seachtain.vercel.app> in a fresh incognito window.
2. The "📍 You're in local-only mode" banner should show at the top.
3. Click **Sign in to save everywhere**. Enter a real email address.
4. Check your inbox for the magic link — click it.
5. You should land back on Seachtain, signed in. The banner disappears,
   the sidebar shows your email, and any plans you had in that browser
   prompt to upload to your account.
6. Sign in from another device or browser — your plans follow.

## Security notes

- `SUPABASE_ANON_KEY` is **public** by design. The security boundary is
  Row Level Security on the database, not key secrecy. Users can only
  read/write rows where `auth.uid() = user_id`.
- The `service_role` key bypasses RLS. Never put it in the client or in
  env vars that end up on the client. We don't use it anywhere in this
  codebase.
- `/api/config` returns only the public Supabase URL and anon key.

## Rolling back

If you need to pause cloud sync:

1. Remove `SUPABASE_URL` and `SUPABASE_ANON_KEY` from Vercel → redeploy.
2. The app transparently falls back to localStorage-only mode. No user data
   is lost — it's still in Supabase, and existing browsers still have their
   localStorage cache.

## Known limits (MVP)

- Last-write-wins: if a teacher edits the same plan on two devices at the
  same time, the latest save overwrites the earlier one. Fine for the
  one-teacher-one-class use case; we'll add conflict resolution when the
  multi-teacher school case lands.
- No account deletion UI yet — teachers would need to ask to be removed.
- Magic-link only: no password, no Google / Apple sign-in yet. Easy to
  add — enable the provider in Supabase and we can wire a button.
