# HomeCare
Hyperlocal home-services app for Islamabad/Rawalpindi: order a nearby rider to fetch groceries and errands (Sauda Run) or book a verified plumber, electrician or AC technician to your door (Ustaad).

## Project structure

```
HomeCare/
├─ apps/
│  ├─ mobile/      Customer app — Expo (React Native + TypeScript, expo-router)
│  └─ api/         Business-logic API — NestJS (used from M4: dispatch, pricing, orders)
├─ supabase/
│  ├─ migrations/  Database schema + Row Level Security (SQL)
│  └─ tests/       Schema/RLS tests on an in-memory Postgres (npm run db:test)
├─ docs/
│  ├─ ROADMAP.md         What we build, in which order
│  └─ SUPABASE_SETUP.md  Dashboard steps for phone sign-in
└─ packages/       Shared code (types, utils) — coming later
```

**Architecture:** the app talks to Supabase directly for sign-in (phone OTP), profile data, files and
realtime, with Row Level Security protecting each user's data. NestJS handles logic that must be trusted
(dispatch, pricing, order state) and verifies Supabase login tokens. See [docs/ROADMAP.md](docs/ROADMAP.md).

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

### Backend (API) — from M4

Not needed for sign-in. Copy `apps/api/.env.example` to `apps/api/.env`, then:

```bash
npm run api
```

## Useful scripts (run from the repo root)

| Script              | What it does                         |
| ------------------- | ------------------------------------ |
| `npm run android`   | Build and launch the app on Android  |
| `npm run mobile`    | Start the Expo/Metro dev server      |
| `npm run api`       | Start the NestJS API in watch mode   |
| `npm run api:build` | Compile the API                      |
| `npm run api:test`  | Run API unit tests                   |
| `npm run db:test`   | Test migrations + RLS on a local Postgres |
| `npm run typecheck` | Type-check the mobile app            |
| `npm run lint`      | Lint all workspaces                  |
