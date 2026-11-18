# Push notifications

Phones get a notification when something happens on an order or an ustaad booking: rider or
ustaad accepted, on the way, arrived, a price to approve, a substitution question, a new offer for
a rider or ustaad, and so on.

## How it works

```
order changes ──► database trigger ──► notification_outbox (queue)
                                              │  every 5 s
                                              ▼
                                  apps/api (NestJS) ──► Firebase Cloud Messaging ──► phone
```

- Each app registers its phone after sign-in (`register_push_token`) and removes it on sign-out.
- The database only queues a message if that person has the app installed with notifications on.
- The API turns the queue into text in the person's language (English / Urdu) and sends it. It
  drops offers older than a minute and other messages older than 30 minutes instead of sending
  them late. Uninstalled phones are forgotten automatically.
- The API only makes **outgoing** connections (to Supabase and Firebase), so for testing it can
  run on a laptop: `npm run api`. Nothing has to be hosted until the pilot.

Without a Firebase project everything still works; screens update live while they're open.

## One-time setup (project owner, ~15 minutes, free)

1. **Firebase project**: https://console.firebase.google.com → *Add project* → name it
   `homecare` (Google Analytics not needed).
2. **Register both Android apps** in that project (*Project settings → General → Add app → Android*):
   - `pk.homecare.app` (customer app)
   - `pk.homecare.partner` (partner app)
3. **Download `google-services.json`** (one file covers both apps) and copy it to **both**
   `apps/mobile/google-services.json` and `apps/partner/google-services.json`.
   It is git-ignored; each developer who builds the apps needs a copy. The apps pick it up
   automatically (`app.config.js`), then rebuild the APKs (`docs/PHONE_TESTING.md`).
4. **Service account for the API**: *Project settings → Service accounts → Generate new private
   key*. Save it as `apps/api/firebase-service-account.json` (git-ignored — it is a secret) and add
   to `apps/api/.env`:

   ```
   FIREBASE_SERVICE_ACCOUNT_FILE=./firebase-service-account.json
   ```

   On a host, set `FIREBASE_SERVICE_ACCOUNT_JSON` to the file's contents instead.
5. Start the API: `npm run api`. The log should say
   `Sending push notifications for Firebase project homecare-…`.

## Checking it

- Sign in on a phone and allow notifications. In the SQL Editor:
  `select app, platform, updated_at from public.push_tokens;` shows the phone.
- Place a test order. `select kind, sent_at, last_error from public.notification_outbox order by id desc limit 10;`
  should show `sent_at` filled within a few seconds.
- `last_error = 'no_device'`: that person has no registered phone. `stale`: the API was off when it
  was queued. Anything starting with `error:` comes from Firebase.

## Not covered yet

- iOS (needs an Apple developer account and APNs key).
- Notification sounds/icons beyond the defaults (Android shows the app icon in white).
