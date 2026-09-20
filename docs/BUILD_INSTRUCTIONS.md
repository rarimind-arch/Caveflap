# Cave Flap: from this repo to TestFlight and Play internal testing

This covers everything left to do outside this codebase: creating accounts,
filling in API keys, generating the native iOS/Android projects, and getting
a build onto a phone. Steps are grouped so you can do them in order; each
says which file(s) it touches in this repo.

## 0. What's already done

- The game is a Vite + Capacitor project (`npm run dev` to try it in a
  browser right now — the native bridge no-ops on web, so IAP/ads fall back
  to the original placeholder UI).
- `window.CaveFlapNative` is wired to real RevenueCat (purchases), AdMob
  (ads + UMP consent), and Firebase Analytics/Crashlytics — `src/native/`.
- Accounts, saves and the online-battle matchmaking run on Firebase Auth,
  Firestore and Realtime Database — `src/native/auth.js`, `firestore.js`,
  `presence.js`.
- Anti-cheat: `functions/` (Cloud Functions), `firestore.rules`,
  `database.rules.json`.
- Push notifications: `src/native/push.js`, `functions/src/push.ts`.
- App icon/splash source art: `resources/*.svg`.
- Fastlane lanes and a GitHub Actions workflow for TestFlight / Play
  internal testing: `fastlane/`, `.github/workflows/mobile-build.yml`.

You need accounts with: Apple Developer Program ($99/yr), Google Play
Console ($25 one-time), Firebase (free tier is fine to start), RevenueCat
(free tier is fine to start), AdMob (free).

## 1. Firebase project

1. [console.firebase.google.com](https://console.firebase.google.com) →
   **Add project** → name it (e.g. "Cave Flap").
2. **Build → Authentication → Get started**. Enable **Anonymous**, **Apple**,
   and **Google** sign-in providers.
   - Apple: needs your Apple Services ID + a Sign in with Apple key from
     the Apple Developer Portal (see §6). You can come back to this after
     §6.
3. **Build → Firestore Database → Create database** (production mode,
   pick a region close to your players).
4. **Build → Realtime Database → Create database** (production mode; it's
   used only for online-battle presence, not the main save data).
5. **Build → Cloud Messaging** — no setup needed here yet; iOS needs an APNs
   key uploaded (**Project settings → Cloud Messaging → Apple app
   configuration**) once you have one from §6.
6. Register three apps under **Project settings → Your apps**:
   - **iOS app**, bundle ID `app.caveflap.game` (must match
     `capacitor.config.ts`'s `appId`). Download `GoogleService-Info.plist`.
   - **Android app**, package name `app.caveflap.game`. Download
     `google-services.json`.
   - **Web app** (yes, even though this ships as a native app — the JS SDK
     talks to Firestore/Realtime Database directly from inside the
     WebView). Copy the `firebaseConfig` object.
7. Paste the web config into `src/native/config.js`'s `FIREBASE_CONFIG`
   (`apiKey`, `authDomain`, `databaseURL`, `projectId`, `storageBucket`,
   `messagingSenderId`, `appId`).
8. You'll copy `GoogleService-Info.plist` / `google-services.json` into the
   native projects in §8, after they exist.

## 2. RevenueCat

1. [app.revenuecat.com](https://app.revenuecat.com) → new project.
2. **Project settings → Apps** → add an iOS app and an Android app, each
   linked to the matching App Store Connect / Play Console app (you can
   finish this after §6/§7 create those).
3. **Products**: create one product per entry in the `IAP` array in
   `src/game/catalog.js` — same identifiers: `cf_crystals_500`,
   `cf_crystals_1200`, `cf_crystals_3500`, `cf_crystals_8000`,
   `cf_crystals_18000`, `cf_medals_5`, `cf_medals_12`, `cf_medals_35`,
   `cf_medals_80`, `cf_medals_180`, `cf_starter`, `cf_noads`,
   `cf_pass_premium` (all one-time/non-renewing), and `cf_vip_month`
   (auto-renewing subscription). These must also exist as real in-app
   purchases in App Store Connect (§6) and the Play Console (§7) first —
   RevenueCat links to them, it doesn't create them there.
4. **Entitlements**: create one entitlement (e.g. `premium`) and attach it
   to `cf_noads`, `cf_vip_month`, `cf_pass_premium` — used by
   `ENTITLEMENT_PREMIUM` in `src/native/config.js` if you want a single
   "has premium" check; the Cloud Function grants each flag independently
   either way, so this is optional convenience.
5. **API keys** (Project settings → API keys): copy the public iOS and
   Android SDK keys into `REVENUECAT_API_KEY` in `src/native/config.js`.
6. **Webhooks** (Project settings → Integrations → Webhooks): add one
   pointing at your deployed `revenueCatWebhook` Cloud Function URL (you'll
   have this after §9 — come back and set it then). Set an **Authorization
   header value** to a long random string; put the same string in the
   `REVENUECAT_WEBHOOK_AUTH` Firebase Functions secret (§9).

## 3. AdMob

1. [apps.admob.com](https://apps.admob.com) → **Apps → Add app** for iOS
   and again for Android.
2. For each app, create three ad units: **Banner**, **Interstitial**,
   **Rewarded**. Copy all six ad unit IDs into `ADMOB_AD_UNITS` in
   `src/native/config.js`, and set `ADMOB_USE_TEST_IDS = false` once
   you're ready to serve real ads (leave it `true` for every dev/test
   build — Google can suspend your account for accidental test-device
   clicks on live ads).
3. **Privacy & messaging → GDPR/UK messages**: set up a consent message
   (Google's UMP). `src/native/ads.js` calls `requestConsentInfo()` /
   `showConsentForm()` automatically; you only need the message configured
   in this dashboard.
4. Note your AdMob **App ID** for both platforms (format
   `ca-app-pub-XXXXXXXXXXXXXXXX~YYYYYYYYYY`) — goes into the native
   projects in §8.

## 4. Firebase Cloud Functions

1. `cd functions && npm install`.
2. Set the RevenueCat webhook secret (the long random string from §2.6):
   ```
   npx firebase-tools functions:secrets:set REVENUECAT_WEBHOOK_AUTH --project <your-project-id>
   ```
3. Deploy:
   ```
   npx firebase-tools login
   npx firebase-tools deploy --only functions,firestore:rules,firestore:indexes,database --project <your-project-id>
   ```
4. Copy the `revenueCatWebhook` function's URL from the deploy output (or
   **Firebase console → Functions**) into RevenueCat's webhook config
   (§2.6).
5. Sanity check: **Firebase console → Functions → Logs** should show
   `notifyLowPetBars` / `notifyDailyRewardReady` / `notifyWeeklyEvent`
   running on their schedules within a day.

## 5. Generate the native projects

This needs Xcode (for iOS — macOS only) and/or Android Studio (for Android
— any OS) installed locally; it can't be done in a CI-only or Linux-only
environment for iOS.

```
npm install
npm run build
npx cap add ios
npx cap add android
npx cap sync
```

Copy `GoogleService-Info.plist` (from §1.6) into `ios/App/App/` via Xcode
(drag it into the `App` target so it's added to the build). Copy
`google-services.json` (from §1.6) into `android/app/`.

## 6. Icons and splash screen

```
npm install
npm run assets:generate
```

This reads `resources/icon.svg`, `icon-foreground.svg`, `icon-background.svg`
and `splash.svg` (a placeholder bat icon matching the in-game art — replace
these files with your own artwork first if you want a different icon) and
writes every required size into `ios/App/App/Assets.xcassets` and
`android/app/src/main/res/`.

## 7. Portrait lock

The game's CSS already handles safe areas and a portrait layout; lock the
OS-level orientation too so the system never rotates the native chrome:

- **iOS**: in Xcode, select the `App` target → **General → Deployment
  Info → Device Orientation**, and uncheck everything except **Portrait**.
- **Android**: in `android/app/src/main/AndroidManifest.xml`, add
  `android:screenOrientation="portrait"` to the `<activity>` element.

## 8. Apple Developer Portal + App Store Connect

1. [developer.apple.com/account](https://developer.apple.com/account) →
   enroll in the Apple Developer Program if you haven't.
2. **Certificates, Identifiers & Profiles → Identifiers → +** → register
   `app.caveflap.game` as an App ID, with **Sign in with Apple** and **Push
   Notifications** capabilities enabled.
3. **Keys → +** → create a **Sign in with Apple** key (for Firebase Auth,
   §1.2) and a **Apple Push Notifications service (APNs)** key (upload
   both to Firebase: Authentication → Sign-in method → Apple, and Project
   settings → Cloud Messaging → Apple app configuration).
4. [appstoreconnect.apple.com](https://appstoreconnect.apple.com) → **My
   Apps → +** → New App. Platform iOS, bundle ID `app.caveflap.game`,
   pick a name (App Store listing name, separate from the in-app title).
5. **In-App Purchases** tab: create each product from §2.3 here first
   (matching identifiers, e.g. `cf_crystals_500`), then link them in
   RevenueCat.
6. **App Information**, **Pricing**, **App Privacy** (answer based on
   `LEGAL.privacy` in `src/game/legal.js` — fill in the real
   [bracketed] values there first), and a build of **screenshots** (run
   the app in Simulator, or on a real device, and capture the required
   sizes) are all required before you can submit for review, but **not**
   before TestFlight internal testing, which only needs a build uploaded.
7. Code signing: either let Xcode manage signing automatically (simplest —
   Xcode → Signing & Capabilities → check "Automatically manage signing",
   pick your team), or set up `fastlane match` for CI (see
   `fastlane/Fastfile`'s commented-out `match` call).
8. Build & upload a TestFlight build, either:
   - **Xcode**: Product → Archive → Distribute App → TestFlight & App
     Store → Upload.
   - **Fastlane** (also used by CI — see §10):
     ```
     export ASC_KEY_ID=... ASC_ISSUER_ID=... ASC_KEY_CONTENT=$(base64 -i AuthKey_XXXX.p8)
     export FASTLANE_TEAM_ID=... FASTLANE_ITC_TEAM_ID=...
     bundle install
     bundle exec fastlane ios beta
     ```
   (`ASC_KEY_ID`/`ASC_ISSUER_ID`/the `.p8` key come from App Store Connect
   → Users and Access → Integrations → App Store Connect API → generate a
   key with the "App Manager" role.)
9. **TestFlight** tab → add internal testers (your team, up to 100, no
   review needed) and/or external testers (needs one round of "Beta App
   Review", usually under a day).

## 9. Google Play Console

1. [play.google.com/console](https://play.google.com/console) → pay the
   one-time $25 fee if you haven't, then **Create app**. Package name
   `app.caveflap.game`.
2. **Monetize → Products → In-app products**: create each consumable
   (`cf_crystals_*`, `cf_medals_*`) and non-consumable/managed product
   (`cf_starter`, `cf_noads`, `cf_pass_premium`) here.
3. **Monetize → Products → Subscriptions**: create `cf_vip_month`.
4. **Setup → App integrity → Play App Signing**: Google manages your
   release signing key by default (recommended) — you still need your own
   **upload key** to sign the AAB you send to Google:
   ```
   keytool -genkey -v -keystore android-release.keystore -alias caveflap -keyalg RSA -keysize 2048 -validity 10000
   ```
   Keep this file and its passwords secret and backed up — losing it means
   you can't update the app. Fill its path/passwords into the
   `ANDROID_KEYSTORE_*` / `ANDROID_KEY_*` env vars fastlane and CI use.
5. **Setup → API access**: create a Google Cloud service account with the
   **Service Account User** + Play Console **Release manager** role (Play
   Console → Users and permissions → Invite new user, grant it access to
   this app), download its JSON key, save as
   `fastlane/play-service-account.json` (gitignored) or point
   `PLAY_JSON_KEY_PATH` at it.
6. **Testing → Internal testing → Create new release**: either upload the
   `.aab` manually, or:
   ```
   bundle install
   bundle exec fastlane android beta
   ```
7. **Testing → Internal testing → Testers**: add tester emails or a Google
   Group; share the opt-in link it gives you.
8. **Policy → App content**: Data safety form (base it on
   `LEGAL.privacy`), Content rating questionnaire, Target audience, Ads
   declaration (yes), Government apps / News apps declarations (no) — all
   required before a *public* release, not before internal testing.

## 10. CI (optional but recommended)

`.github/workflows/ci.yml` builds the web bundle and Cloud Functions on
every push — no secrets needed, works out of the box.

`.github/workflows/mobile-build.yml` builds and uploads to TestFlight/Play
internal testing on a `vX.Y.Z` tag push, once `ios/` and `android/` are
committed (§5) and these repo secrets are set (**Settings → Secrets and
variables → Actions**):

| Secret | From |
|---|---|
| `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_CONTENT` (base64 of the `.p8`) | App Store Connect API key, §8.8 |
| `FASTLANE_TEAM_ID`, `FASTLANE_ITC_TEAM_ID` | Apple Developer Portal / App Store Connect, both under Membership details |
| `MATCH_GIT_URL`, `MATCH_PASSWORD` | only if you set up `fastlane match` for CI signing |
| `ANDROID_KEYSTORE_BASE64` (`base64 -i android-release.keystore`) | §9.4 |
| `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD` | §9.4 |
| `PLAY_SERVICE_ACCOUNT_JSON` (the whole JSON file, one line) | §9.5 |
| `FIREBASE_TOKEN` (`npx firebase-tools login:ci`), `FIREBASE_PROJECT_ID` | only if you flip on the (disabled-by-default) `deploy-functions` job |

## 11. Before you submit for real review

- [ ] `src/game/legal.js`: `COMPANY` and `[address, country]` filled in for
      real; have a lawyer check the [bracketed] jurisdiction/DPA choices.
- [ ] `src/native/config.js`: real RevenueCat keys, real AdMob ad unit IDs,
      `ADMOB_USE_TEST_IDS = false`.
- [ ] App Store Connect **App Privacy** and Play Console **Data safety**
      forms filled in (base them on `LEGAL.privacy`).
- [ ] Replace `resources/icon.svg` / `splash.svg` with real artwork if the
      placeholder bat icon isn't what you want to ship.
- [ ] Test a real purchase and a real rewarded/interstitial ad on a
      physical device in *sandbox* mode (TestFlight / Play internal
      testing both support sandbox purchases automatically).
- [ ] Test Sign in with Apple and Sign in with Google end to end, and that
      re-installing the app on the same signed-in account restores
      purchases (`window.CaveFlapRestore`) and progress.
