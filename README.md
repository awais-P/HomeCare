# HomeCare
Hyperlocal home-services app for Islamabad/Rawalpindi: order a nearby rider to fetch groceries and errands (Sauda Run) or book a verified plumber, electrician or AC technician to your door (Ustaad).

## Project structure

```
HomeCare/
├─ apps/
│  ├─ mobile/      Customer app — Expo (React Native + TypeScript, expo-router)
│  ├─ partner/     Rider & ustaad app — Expo (apply, verify, go online)
│  ├─ admin/       Admin panel — web (React + Vite): orders, approvals, documents, live map, settings
│  ├─ site/        Public website — Terms, Privacy, account deletion (needed for Google Play)
│  └─ api/         Business-logic API — NestJS (used from M4: dispatch, pricing, orders)
├─ supabase/
│  ├─ migrations/  Database schema + Row Level Security (SQL)
│  └─ tests/       Schema/RLS tests on an in-memory Postgres (npm run db:test)
├─ docs/
│  ├─ PROJECT_PLAN.md    Scope, phases, timeline, decisions, risks
│  └─ SUPABASE_SETUP.md  Dashboard steps for phone sign-in
└─ packages/
   └─ shared/     Code used by the apps: UI kit, theme, English/Urdu text, Supabase client,
                  sign-in screens, map and location
```

**Architecture:** the app talks to Supabase directly for sign-in (phone OTP), profile data, files and
realtime, with Row Level Security protecting each user's data. NestJS handles logic that must be trusted
(dispatch, pricing, order state) and verifies Supabase login tokens. See [docs/PROJECT_PLAN.md](docs/PROJECT_PLAN.md).

This is an npm workspaces monorepo: run `npm install` once at the root, not inside each app.

## Prerequisites

- Node.js 22+ (LTS) and Git
- JDK 17, with `JAVA_HOME` pointing to it
- Android Studio, for the Android SDK and emulator. Set `ANDROID_HOME` to the SDK folder
  (Windows default: `%LOCALAPPDATA%\Android\Sdk`) and add `platform-tools` to `PATH`
- An Android phone with USB debugging on, or an emulator

Check your setup in a fresh terminal:

```bash
node -v
java -version
adb --version
```

## Getting started

```bash
git clone https://github.com/awais-P/HomeCare.git
cd HomeCare
npm install
```

### Mobile app

1. Follow [docs/SUPABASE_SETUP.md](docs/SUPABASE_SETUP.md) (step 5 is all you need if the project is
   already set up): copy `apps/mobile/.env.example` to `apps/mobile/.env` and fill in the Supabase URL
   and publishable key. **Never commit `.env`.**
2. With a phone connected (`adb devices` should list it), build and install the app. The first build
   takes several minutes:

```bash
npm run android
```

After that, if the app is already installed, you only need the dev server:

```bash
npm run mobile
```

Sign in with a Supabase **test number** (e.g. `0300 1234567` / code `123456`) — no SMS is sent.

> The app uses native modules (SQLite storage, keyboard controller), so it runs as a development build
> (`npm run android`), not in Expo Go.

**Standalone APKs to copy to phones** (no laptop needed afterwards): `npm run apk` (customer) and
`npm run partner:apk` (partner). Setup and a two-phone test errand: [docs/PHONE_TESTING.md](docs/PHONE_TESTING.md).

### Backend (API)

Sends push notifications (see [docs/PUSH_NOTIFICATIONS.md](docs/PUSH_NOTIFICATIONS.md)); nothing else
needs it yet. Copy `apps/api/.env.example` to `apps/api/.env`, then:

```bash
npm run api
```

## Useful scripts (run from the repo root)

| Script              | What it does                         |
| ------------------- | ------------------------------------ |
| `npm run android`   | Build and launch the customer app on Android |
| `npm run partner:android` | Build and launch the partner app on Android |
| `npm run apk`       | Build the customer app as a standalone APK |
| `npm run partner:apk` | Build the partner app as a standalone APK |
| `npm run partner`   | Start the partner app's dev server   |
| `npm run admin`     | Start the admin panel at http://localhost:5173 |
| `npm run admin:build` | Build the admin panel for hosting  |
| `npm run site`      | Start the public website at http://localhost:5174 |
| `npm run site:build` | Build the public website for hosting |
| `npm run mobile`    | Start the Expo/Metro dev server      |
| `npm run api`       | Start the NestJS API in watch mode   |
| `npm run api:build` | Compile the API                      |
| `npm run api:test`  | Run API unit tests                   |
| `npm run db:test`   | Test migrations + RLS on a local Postgres |
| `npm run typecheck` | Type-check every app and package     |
| `npm run lint`      | Lint all workspaces                  |
