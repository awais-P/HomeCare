# Supabase setup (M1: phone sign-in)

One person (the project owner) does steps 1–4 once. Everyone else only needs step 5.

## 1. Run the database migration

Supabase dashboard → **SQL Editor** → New query → paste the whole file
[`supabase/migrations/20261112000000_profiles.sql`](../supabase/migrations/20261112000000_profiles.sql) → **Run**.

It creates:
- `public.profiles` — one row per user (phone, name, email, language), created automatically on signup.
- Row Level Security: a signed-in user can read and edit **only their own** row, and only
  `full_name`, `email` and `language`. Clients cannot insert, delete or change the phone number.

Check: **Table Editor → profiles** exists and shows "RLS enabled".

> Before changing the schema, run `npm run db:test` locally. It applies every migration to an in-memory
> Postgres and checks the security rules (18 checks today).

## 2. Turn on phone sign-in

**Authentication → Sign In / Providers → Phone** → enable.

Supabase requires an SMS provider to be configured even for test numbers. For development, choose
**Twilio** and enter placeholder values (e.g. Account SID `ACxxxxxxxx`, Auth Token `placeholder`,
Message Service SID `MGxxxxxxxx`). No SMS is sent to test numbers.

Leave the defaults: 6-digit code, 60 s between resends.

## 3. Add test phone numbers (free, no SMS)

Same Phone provider page → **Test Phone Numbers and OTPs**. Add pairs as `number=code`, comma-separated,
**without `+` or spaces**, for example:

```
923001234567=123456,923331234567=654321
```

Set **Test OTPs Valid Until** (required) to a date a few months away, then **Save**.

In the app, type `0300 1234567` and enter `123456`. Give each teammate their own test number.

> ⚠️ Anyone who knows a test number and its code can sign in as that user. Remove all test numbers
> before the pilot launch.

## 4. Real SMS (before the pilot, not needed now)

Options:
- **Twilio** with real credentials: simplest, but SMS to Pakistan is relatively expensive.
- **Send SMS Hook** (Authentication → Hooks): Supabase calls our own endpoint with the code, and we send it
  through a cheaper Pakistani SMS gateway. This is the plan for M8.

## 5. Connect the app (everyone)

Dashboard → **Project Settings → API Keys** (and Data API for the URL). Copy:

- Project URL → `https://<project-ref>.supabase.co`
- **Publishable** key → `sb_publishable_...`

Then:

```bash
cp apps/mobile/.env.example apps/mobile/.env
```

Fill both values in `apps/mobile/.env` and restart Metro with a cleared cache (`npm run mobile -- --clear`).
Both values are public by design. **Never** put the database password or a `sb_secret_...` key in the app.

## Troubleshooting

| What you see in the app                          | Likely cause                                                   |
| ------------------------------------------------ | -------------------------------------------------------------- |
| "The app is not connected to the server yet"     | `apps/mobile/.env` missing or Metro not restarted              |
| "Phone sign-in is not available right now"       | Phone provider disabled (step 2)                               |
| "We couldn't send the SMS"                       | Number is not a test number and no real SMS provider is set up |
| "That code is wrong or has expired"              | Wrong code, or the test number is written with `+` / spaces    |
| "Couldn't load your account" after signing in    | Migration not run (step 1), so there is no `profiles` row      |
| "Too many attempts"                              | Wait 60 s; Supabase rate limit                                 |
