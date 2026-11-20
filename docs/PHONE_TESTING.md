# Testing on phones (standalone APKs)

We build **standalone release APKs** on the laptop with the Android SDK and copy them to phones.
A release APK contains all the app code, so it runs anywhere with internet and talks to Supabase
directly. (A dev build from `npm run android` instead loads its code from the laptop.)

Two apps, two APKs; both can be installed on the same phone:

| App | Package | Build command (repo root) | APK file afterwards |
| --- | --- | --- | --- |
| Customer | `pk.homecare.app` | `npm run apk` | `apps/mobile/android/app/build/outputs/apk/release/app-release.apk` |
| Partner | `pk.homecare.partner` | `npm run partner:apk` | `apps/partner/android/app/build/outputs/apk/release/app-release.apk` |

## One-time laptop setup

1. Install **Android Studio** (https://developer.android.com/studio). On first start let it
   install the Android SDK, Platform-Tools and an SDK Platform.
2. Set environment variables (Windows: *Edit the system environment variables*):
   - `ANDROID_HOME` = `%LOCALAPPDATA%\Android\Sdk`
   - add `%ANDROID_HOME%\platform-tools` to `Path`
   - `JAVA_HOME` = the JDK 17 folder (already installed under `%LOCALAPPDATA%\Programs\Java`), or
     Android Studio's own `jbr` folder.
3. Open a new terminal and check: `adb --version` and `java -version` (17).

## Before building

- `apps/mobile/.env` and `apps/partner/.env` must have the Supabase URL and publishable key
  (they are baked into the APK when it is built; change them → rebuild).
- Optional, for push notifications: `google-services.json` in both app folders
  (`docs/PUSH_NOTIFICATIONS.md`).
- Supabase: run `SETUP_01` … `SETUP_08` (`docs/SUPABASE_SETUP.md`), add test phone numbers, make
  yourself an admin.

## Build and install

```bash
npm run apk
npm run partner:apk
```

The first build takes 10–20 minutes (Gradle downloads); later ones a few minutes. If a phone is
connected by USB with *USB debugging* on, the APK is also installed on it.

Otherwise copy `app-release.apk` to the phone (USB, Google Drive, WhatsApp to yourself), open it,
and allow *Install unknown apps* for the app you opened it from.

These APKs are signed with the debug key: fine for testing, not for the Play Store (that needs an
upload key, Phase 8).

## A test errand on two phones

1. Phone A: partner app → sign in with a test number → apply as a rider (documents) → admin panel
   (`npm run admin` on the laptop) → approve → back on phone A go **Online**.
2. Phone B: customer app → sign in with another test number → address inside a pilot zone →
   **Sauda Run** → type a list or record a voice note → place the order.
3. Phone A gets the offer within a few seconds (30 s to accept) → accept → **I'm at the shop** →
   try **Item not available?** → phone B answers yes/no → bill amount + photo → on the way →
   delivered.
4. Phone B watches the status and the rider on the map, then rates the rider.

**An ustaad job:** on phone A apply as an ustaad instead (pick a trade, e.g. plumber), get approved, go
online. On phone B tap **Ustaad** → plumber → describe the problem → **Come now** → book. Phone A
accepts the offer → on my way → arrived → sends a price → phone B approves → phone A marks the
work done. Phone B rates the ustaad and can save them as a favourite; within 7 days it can book a
free revisit with **Problem came back?**

**Chat:** once a rider or ustaad has accepted, both phones show a **Chat** button on the order
or booking (with the number of new messages). Riders and ustaads have one-tap replies ("I'm at the
shop", "I'm at your door"). The admin panel shows each chat and can reply as support.

**Location while locked:** when a partner goes online, the app asks to share location while the phone
is locked. On Android 11+ this opens Settings: choose **Allow all the time**. A notification ("you
are online") stays while sharing; going offline stops it. Some phones (Xiaomi, Oppo, Vivo, Huawei)
also need HomeCare Partner set to "No restrictions" for battery, or they stop it after a while.

**Safety:** on an active order or booking both apps show **SOS** (call 15 / 1122 or alert the team,
which appears in admin → Safety) and **Report a problem** (also up to 7 days after). The customer
also gets **Share trip with family** once `EXPO_PUBLIC_SITE_URL` points at the hosted website. In
Account, "Prefer a woman rider or ustaad" asks women partners first.

Both phones need location on. The rider must be within 5 km of the delivery address
(`dispatch_radius_km` in admin → Settings) for offers.

## Not tested yet on real phones

Native map (MapLibre), GPS, camera, microphone and notifications have only been checked in the
browser preview and by the type checker. Expect small fixes after the first install.
