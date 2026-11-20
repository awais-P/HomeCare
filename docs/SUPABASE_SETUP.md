# Supabase setup

One person (the project owner) does steps 1–4 once. Everyone else only needs step 5.

## 1. Set up the database (SQL Editor)

Run these files **in order**, each in its own new query. Each is safe to run again.

| Order | File | Adds | Results row (all must be `true`) |
| --- | --- | --- | --- |
| 1 | [`supabase/SETUP_01_PROFILES.sql`](../supabase/SETUP_01_PROFILES.sql) | Sign-in profiles (P1) | `profiles_table`, `security_on`, `rules_ok`, `signup_trigger`, `users_without_profile_ok` |
| 2 | [`supabase/SETUP_02_ADDRESSES_AND_ZONES.sql`](../supabase/SETUP_02_ADDRESSES_AND_ZONES.sql) | PostGIS, service zones, saved addresses, waitlist (P2) | `postgis_on`, `zones_ok`, `addresses_ok`, `waitlist_ok`, `map_functions_ok` |
| 3 | [`supabase/SETUP_03_PARTNERS.sql`](../supabase/SETUP_03_PARTNERS.sql) | Partners, private CNIC/selfie storage, admins, online status (P3) | `partners_table`, `partner_rules_ok`, `private_bucket_ok`, `document_rules_ok`, `actions_ok` |
| 4 | [`supabase/SETUP_04_ORDERS_AND_ACCOUNT.sql`](../supabase/SETUP_04_ORDERS_AND_ACCOUNT.sql) | Business settings (provisional fees and limits), Sauda Run orders, order photos, account deletion (P4) | `settings_ok`, `orders_ok`, `order_rules_ok`, `order_media_ok`, `actions_ok` |
| 5 | [`supabase/SETUP_05_SAUDA_LIVE.sql`](../supabase/SETUP_05_SAUDA_LIVE.sql) | Substitution questions, voice notes, automatic offers to the nearest rider, rider location, live updates, push notification queue (P4 slice 2) | `settings_ok`, `substitutions_ok`, `offers_ok`, `voice_and_photos_ok`, `push_ok`, `actions_ok` |
| 6 | [`supabase/SETUP_06_USTAAD.sql`](../supabase/SETUP_06_USTAAD.sql) | Ustaad bookings: jobs, offers to ustaads, quotes, warranty revisits, favourites (P5) | `settings_ok`, `jobs_ok`, `offers_ok`, `favourites_ok`, `media_ok`, `actions_ok` |
| 7 | [`supabase/SETUP_07_CHAT.sql`](../supabase/SETUP_07_CHAT.sql) | In-app chat per order and booking (P6) | `chat_ok`, `rules_ok`, `actions_ok` |
| 8 | [`supabase/SETUP_08_SAFETY.sql`](../supabase/SETUP_08_SAFETY.sql) | SOS alerts, share-trip links, women-first preference, disputes, rating moderation (P7) | `columns_ok`, `sos_ok`, `sharing_ok`, `disputes_ok`, `moderation_ok`, `actions_ok` |
| 9 | [`supabase/SETUP_09_ASSISTANT.sql`](../supabase/SETUP_09_ASSISTANT.sql) | Voice assistant: assistant name and a daily limit per person (then deploy the function: `docs/VOICE_ASSISTANT.md`) | `name_ok`, `limit_ok`, `quota_ok` |

Scripts build on each other. If you ever run an older one again, run the later ones again after it
(for example `SETUP_08` updates two functions from `SETUP_05` and `SETUP_06`).

For each file:

1. Open the file in VS Code, press **Ctrl+A** then **Ctrl+C** to copy all of it.
2. Supabase dashboard → your project → left sidebar **SQL Editor** → **+ New query**.
3. Paste (**Ctrl+V**) and click **Run** (or **Ctrl+Enter**). If a "destructive operation" warning
   appears, confirm it: the script only drops rules and triggers that it re-creates itself.
4. The **Results** panel shows one row. Every column must be `true` (table above).

What the security rules guarantee:
- `profiles`: each user can read and edit **only their own** row (name, email, language), never the phone number.
- `addresses`: each user sees and edits only their own; a saved address **must be inside a service zone**.
- `service_zones`: apps can only read them; changes are made in the dashboard.

You can see the tables under **Table Editor** (each marked "RLS enabled").

### Automatic offers timer (after SETUP_05)

`SETUP_05` turns on a 10-second timer (pg_cron) that moves an unanswered offer on to the next rider.
Check it worked: `select jobname, schedule from cron.job;` should list `homecare-dispatch` (and, after `SETUP_06`, `homecare-job-dispatch`) with `10 seconds`.
If it doesn't (or `cron` doesn't exist), turn on **Database → Extensions → pg_cron** and run `SETUP_05`
again. Without the timer, offers still move on whenever a rider's app checks in (every 10 s while online).

### Make yourself an admin (for the admin panel)

Sign in once with the app (so your account exists), then run in the SQL Editor — your number
without `+` or spaces:

```sql
insert into public.admins (user_id)
select id from auth.users where phone = '923001234567'
on conflict do nothing;
```

To remove someone: `delete from public.admins where user_id = (select id from auth.users where phone = '923001234567');`

### Service zones (pilot areas)

`SETUP_02` seeds **approximate** circles (decision D1 in the project plan is still open):
F-10/F-11, G-9/G-10/G-11, I-8, Satellite Town, Saddar, Bahria Town (Phase 1–8).
The app shows them as a light green area on the map.

Testing from a place outside these? Add a temporary zone around it (change the name, lat/lng and
radius in metres), in the SQL Editor:

```sql
insert into public.service_zones (slug, name, city, area)
values ('test-my-area', 'Test: my area', 'islamabad',
  extensions.st_multi(extensions.st_buffer(
    extensions.st_setsrid(extensions.st_makepoint(73.0479, 33.6844), 4326)::extensions.geography,
    1500)::extensions.geometry)::extensions.geography)
on conflict (slug) do nothing;
```

Note `st_makepoint` takes **longitude first**, then latitude. To switch a zone off:
`update public.service_zones set is_active = false where slug = 'test-my-area';`

> For developers: `supabase/migrations/` holds the same schema as versioned migrations (for the
> Supabase CLI later). Keep both in sync; `npm run db:test` checks both.

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
| "Couldn't load your account" after signing in    | `SETUP_01` not run (step 1), so there is no `profiles` row     |
| "Too many attempts"                              | Wait 60 s; Supabase rate limit                                 |
| "Couldn't load your addresses" / no green areas  | `SETUP_02` not run (step 1)                                    |
| "Couldn't check this spot" on the map picker     | `SETUP_02` not run, or no internet                             |
| "We're not in this area yet" for your own home   | Outside the pilot zones: add a test zone (step 1, zones)       |
| Placing an order fails / no "Your orders"         | `SETUP_04` not run (step 1)                                    |
| Voice note or rider questions fail; no offers    | `SETUP_05` not run (step 1)                                    |
| "Couldn't book" an ustaad / no Ustaad jobs        | `SETUP_06` not run (step 1)                                    |
| SOS / "Report a problem" fails; no share link     | `SETUP_08` not run (step 1)                                    |
| Chat button missing / "Couldn't send"            | `SETUP_07` not run (step 1)                                    |
| Riders never get an automatic offer              | Rider offline, more than 5 km away, busy, or last location older than 2 minutes |
