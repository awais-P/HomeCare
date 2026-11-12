# HomeCare
Hyperlocal home-services app for Islamabad/Rawalpindi: order a nearby rider to fetch groceries and errands (Sauda Run) or book a verified plumber, electrician or AC technician to your door (Ustaad).

## Project structure

```
HomeCare/
├─ apps/
│  ├─ mobile/   Customer app — Expo (React Native + TypeScript, expo-router)
│  └─ api/      Backend — NestJS (TypeScript), Supabase Postgres + PostGIS
└─ packages/    Shared code (types, utils) — coming later
```

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

### Backend (API)

1. Copy `apps/api/.env.example` to `apps/api/.env` and fill in the Supabase connection string.
   **Never commit `.env`.** Ask the team lead for the shared dev database credentials.
2. Run the API in watch mode:

```bash
npm run api
```

### Mobile app

With a phone connected (`adb devices` should list it):

```bash
npm run android
```

To run only the JS dev server (e.g. if the app is already installed):

```bash
npm run mobile
```

## Useful scripts (run from the repo root)

| Script              | What it does                         |
| ------------------- | ------------------------------------ |
| `npm run android`   | Build and launch the app on Android  |
| `npm run mobile`    | Start the Expo/Metro dev server      |
| `npm run api`       | Start the NestJS API in watch mode   |
| `npm run api:build` | Compile the API                      |
| `npm run api:test`  | Run API unit tests                   |
| `npm run lint`      | Lint all workspaces                  |
