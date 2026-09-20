# Cave Flap

A flappy-bird-style cave game with a virtual pet, minigames, PvP battles,
a store and a season pass — shipped as an iOS/Android app via
[Capacitor](https://capacitorjs.com).

## Quickstart

```
npm install
npm run dev        # try it in a browser — native features (purchases,
                    # ads, push) no-op gracefully and fall back to the
                    # game's original placeholder UI
```

```
npm run build       # production web bundle
npm run cap:sync    # build + copy into the native ios/android projects
npm run cap:ios      # open in Xcode
npm run cap:android  # open in Android Studio
```

Nothing purchases/ads/backend-related will work for real until you fill in
`src/native/config.js` and follow **[docs/BUILD_INSTRUCTIONS.md](docs/BUILD_INSTRUCTIONS.md)**
— that's the full path from this repo to a TestFlight/Play internal test
build, including every Apple/Google/Firebase/RevenueCat/AdMob console step.

## Project layout

```
src/
  game/            the game itself
    catalog.js       static data: skins, gear, missions, IAP catalog, ...
    save.js          save schema, validation/migration, persistence
    audio.js         all sound + music (synthesized, no audio files)
    legal.js         privacy policy / terms text, support email
    engine.js         main game loop, minigames, battles, pet care, store,
                       progression and UI wiring — see the note at the top
                       of that file for why it's one module, not several
  native/          the Capacitor-only layer (all no-op on web)
    bridge.js        wires purchases/ads/analytics into window.CaveFlapNative
    purchases.js      RevenueCat
    ads.js            AdMob + Google UMP consent
    analytics.js      Firebase Analytics + Crashlytics
    auth.js           Firebase Auth (anonymous, Apple, Google)
    firestore.js      Firestore, shaped to match the game's original
                       window.claude.use('db') calls exactly
    presence.js       Realtime Database, shaped to match the game's
                       original window.claude.use('room') calls exactly
    push.js           Firebase Cloud Messaging
    config.js         all the API keys / ad unit IDs you need to fill in
  i18n/            English + Lithuanian strings, t()/setLang()
functions/         Firebase Cloud Functions (anti-cheat, push notifications)
resources/         app icon / splash screen source art (SVG)
fastlane/          TestFlight + Play internal testing lanes
docs/              build & store-submission instructions
```

## Anti-cheat model

The client stays authoritative for casual run currency (crystals/medallions
earned by playing), like most mobile games — server-validating every pickup
would hurt the game's feel for no real benefit. What's actually enforced
server-side, in `functions/` and `firestore.rules`:

- IAP entitlements (no ads, VIP, premium pass, starter pack) are only ever
  granted by the RevenueCat webhook Cloud Function, never trusted from a
  client write.
- Every Firestore write is capped to a plausible per-write delta.
- Every leaderboard score write is checked for physically-impossible values
  (e.g. more points than flaps) and flagged/clamped.

See the top of `firestore.rules` for the full reasoning.
