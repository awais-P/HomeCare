# HomeCare Roadmap

HomeCare is a hyperlocal "someone comes to you" app for Islamabad/Rawalpindi with two services:

- **Sauda Run**: a nearby rider buys what you need (sabzi, groceries, pharmacy, food pickup, pick & drop) and brings it to your door.
- **Ustaad**: a verified plumber, electrician, AC technician or mechanic comes to your home.

This document is the build order. We are building without real usage data yet, so the order follows one rule:
**build the spine first (identity → location → supply → orders), and build every shared piece once.**
Dispatch, tracking, chat, ratings and payments are the same for a rider and an ustaad, so we build them for
Sauda Run and reuse them for Ustaad.

Status legend: ✅ done · 🚧 in progress · ⬜ not started

---

## Tech stack (decided)

| Layer          | Choice                                                                         |
| -------------- | ------------------------------------------------------------------------------ |
| Customer app   | Expo SDK 58 (React Native, TypeScript), expo-router — `apps/mobile`            |
| Partner app    | Expo, separate app for riders/ustaads — `apps/partner` (M3)                    |
| Admin panel    | Web (React), for verification and manual dispatch — `apps/admin` (M3)          |
| Auth           | Supabase Auth, phone OTP. App uses `@supabase/supabase-js` directly          |
| Database       | Supabase Postgres + PostGIS (Mumbai region). Schema in `supabase/migrations`  |
| Data access    | Simple reads/writes: app → Supabase, protected by Row Level Security (RLS)     |
| Business logic | NestJS 12 (ESM, TypeScript) — `apps/api`, from M4: dispatch, pricing, order  |
|                | state. Verifies Supabase JWTs; deployed to a cloud host when M4 starts         |
| SMS            | Test numbers in dev. Pilot: Twilio, or a Pakistani gateway via Send SMS Hook   |
| Files          | Supabase Storage (CNIC, receipts, problem photos) — M3                          |
| Realtime       | Supabase Realtime for order status, tracking and chat — M6                       |
| Push           | expo-notifications (FCM) — M6                                                  |

Why hybrid: Supabase runs in the cloud, so the app works on any phone without a laptop or server running,
and Auth, Storage and Realtime come ready-made. Logic that must be trusted and tested (who gets which
order, how much it costs, which state changes are allowed) lives in NestJS, where it has unit tests.
Rule of thumb: **if a client could cheat by doing it, it goes through NestJS or a Postgres function, never
a direct table write.**

Hosting: until M4 everything runs on the Supabase free tier, so there is nothing else to host. For M4,
host NestJS with GitHub Student Developer Pack credits (Azure/DigitalOcean) or Render's free tier for
testing (it sleeps when idle).

---

## Milestones (MVP, Isb/Rwp pilot)

### M0 — Foundation ✅
- Monorepo (npm workspaces), Expo app, NestJS API, Supabase project, GitHub repo.

### M1 — Customer authentication & profile 🚧
Goal: a customer can sign in with their phone number and set up a profile.
- Supabase: phone provider, `profiles` table (auto-created on signup), RLS so users see only their own row.
- App: Welcome → Phone → OTP → Profile setup → Home (tabs: Home, Orders, Account).
- English + Urdu strings from day one, language switch.
- Reusable UI kit: Button, TextField, PhoneInput, OtpInput, Screen, Card, EmptyState, ListItem.
- Done when: a new number can sign up on a real phone, close the app, reopen and still be signed in.

### M2 — Addresses & service zone ⬜
Goal: we know exactly where the customer is and whether we serve it.
- `addresses` table with a PostGIS `geography(Point)`, label (Home/Office/Parents), house/street/sector,
  landmark ("near the blue mosque") and optional recipient name/phone.
- **Book for someone else**: an address can belong to another person (e.g. parents in Rawalpindi), with
  their name and phone for the rider/ustaad. This is the hook for overseas Pakistanis.
- Map pin picker (react-native-maps) + sector picker for Isb/Rwp (G-, F-, I-, E- sectors, Bahria, DHA,
  Saddar, Satellite Town).
- `service_zones` polygons; outside the zone → "Not in your area yet" + join waitlist (gives demand data).

### M3 — Partner side & admin (supply) ⬜
Goal: riders and ustaads can register, get verified and go online. Without supply nothing else matters.
- `apps/partner` app: phone OTP (reuse M1), choose Rider or Ustaad (+ trades), CNIC front/back, selfie,
  vehicle (riders), payout number (JazzCash/Easypaisa).
- Verification status: pending → approved/rejected, badge shown to customers.
- Online/offline toggle, location heartbeat every ~15–30 s while online (stored as PostGIS point).
- Lightweight build: works on low-end Android, survives weak data.
- `apps/admin`: approve partners, view CNIC images, see who is online on a map.
- Data protection: CNIC images in a private bucket, signed URLs only, admin-only access.

### M4 — Sauda Run MVP ⬜
Goal: the first real order end to end, cash only.
- Create order: free-form list (text + photos + **voice note**, stored as audio), category, preferred
  shop or "nearest", delivery address, notes.
- Pricing: fixed delivery fee by distance band + actual item cost from the bill photo.
- Dispatch: find online riders within N km (PostGIS `ST_DWithin`), offer to nearest first with a timeout,
  then next; fallback to **manual dispatch from admin**.
- Order state machine: `requested → accepted → at_shop → purchasing → on_the_way → delivered`
  (+ `cancelled`, `failed`). Every transition logged.
- Rider flow: accept → substitution messages ("no Olpers, get Nestle?") → bill photo → mark delivered,
  cash collected.
- Customer: live status (polling first), approve substitutions, see bill photo, rate the rider.

### M5 — Ustaad MVP ⬜
Reuses dispatch, state machine, ratings and admin tools from M4.
- Trades at launch: plumber, electrician, AC technician, mechanic.
- Book "come now" (surge fee) or a scheduled slot; problem photos/video.
- Visit charge → ustaad sends quote in-app (labour + parts separately) → customer approves → work → done.
- 7-day warranty: "issue came back" creates a free revisit job.
- Favourite ustaad and rebook the same person.

### M6 — Realtime & notifications ⬜
- Push notifications for every order/job status change.
- WebSocket channel per order: live rider/ustaad location and chat.
- SMS fallback for job offers to partners with weak data.
- Masked calling (via a telephony provider) — can slip to Phase 2.

### M7 — Trust & safety ⬜
- SOS button, share live trip with family, female-customer preference.
- Disputes: raise an issue on an order, admin resolution notes, refunds/adjustments recorded.
- Ratings moderation, partner suspension.

### M8 — Pilot launch ⬜
- EAS builds, Play Store internal testing → closed testing.
- Sentry crash reporting, basic analytics (orders/day, time to accept, cancellations).
- Supply first: 20–30 verified ustaads and 15–20 riders in pilot sectors **before** opening to customers.
- Legal: business registration, terms of service, privacy policy, CNIC data handling policy.

---

## Phase 2 (after the pilot works)
- Payments: JazzCash, Easypaisa, Raast; wallet top-up; partner daily payouts.
- AI: Urdu voice-to-list ("do kilo aloo aur ek pao adrak") and photo fault tagging for ustaad jobs.
- Price reference board (daily mandi rates, standard labour rates).
- Mohalla trust ("12 people in your sector used this ustaad").
- Recurring orders: weekly sabzi run, monthly tank cleaning, pre-summer AC service.
- More trades: carpenter, painter, appliance repair, generator/solar.
- New verticals: home cleaning, water tank cleaning, water tanker, LPG refill, bill/bank errands,
  elderly assist, laundry/tailor pickup.

## Phase 3
- Lahore and Karachi, B2B (offices, property managers), pest control, tutors.

---

## Validate while we build
We have no usage data, so collect it cheaply in parallel with M1–M3:
- Talk to ~10 households and ~10 ustaads/riders in the pilot sectors: what they order, what they pay,
  what goes wrong today.
- Run a manual "WhatsApp concierge" pilot for 1–2 weeks (orders by WhatsApp, dispatched by hand) before
  M4 is finished. It tells us the real order shapes, prices and failure cases before we hard-code them.

---

## Suggested team split
| Area                         | Owns                                              |
| ---------------------------- | ------------------------------------------------- |
| Customer app                 | `apps/mobile` screens, UI kit, i18n               |
| Backend                      | `apps/api` modules, DB schema, migrations, tests  |
| Partner app + admin          | `apps/partner`, `apps/admin` (from M3)            |
| Product/ops (shared)         | User interviews, partner onboarding, pilot ops    |

## Working agreements
- One branch per feature (`feat/m2-addresses`), pull request into `main`, at least one reviewer.
- Every API change comes with a test; every schema change comes with a SQL file in `supabase/migrations`
  and an RLS policy review.
- No secrets in Git: `.env` is local only, `.env.example` documents every variable.
- Run `npm run lint`, `npm run typecheck` and `npm run api:test` before opening a PR.
