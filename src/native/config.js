// Native SDK configuration. Fill these in from the RevenueCat and AdMob
// dashboards (see docs/BUILD_INSTRUCTIONS.md) before shipping a real build.
// AdMob's own test ad unit IDs are used by default so a dev build never
// serves live ads; swap them for your real IDs before release.
import { Capacitor } from '@capacitor/core';

const isIOS = Capacitor.getPlatform() === 'ios';

// RevenueCat public (client) API keys, one per store. Get these from
// RevenueCat > Project settings > API keys.
export const REVENUECAT_API_KEY = isIOS
  ? 'appl_REPLACE_WITH_YOUR_IOS_REVENUECAT_KEY'
  : 'goog_REPLACE_WITH_YOUR_ANDROID_REVENUECAT_KEY';

// Entitlement identifier configured in the RevenueCat dashboard that gates
// "no ads" + VIP perks. cf_noads, cf_vip_month and cf_pass_premium should
// all grant this entitlement in RevenueCat's product/entitlement mapping.
export const ENTITLEMENT_PREMIUM = 'premium';

// AdMob app IDs are set in capacitor.config.ts / native Info.plist &
// AndroidManifest.xml (see docs/BUILD_INSTRUCTIONS.md), not here.
// These are per-ad-unit IDs. Google's public test IDs are used until you
// replace them with your own from the AdMob console.
const TEST_IDS = {
  banner: isIOS ? 'ca-app-pub-3940256099942544/2934735716' : 'ca-app-pub-3940256099942544/6300978111',
  interstitial: isIOS ? 'ca-app-pub-3940256099942544/4411468910' : 'ca-app-pub-3940256099942544/1033173712',
  rewarded: isIOS ? 'ca-app-pub-3940256099942544/1712485313' : 'ca-app-pub-3940256099942544/5224354917',
};

// Set ADMOB_USE_TEST_IDS to false once your real ad units are approved and
// wired in below, and AD_TESTING_DEVICES no longer needs your test device.
export const ADMOB_USE_TEST_IDS = true;
export const ADMOB_AD_UNITS = ADMOB_USE_TEST_IDS ? TEST_IDS : {
  banner: isIOS ? 'ca-app-pub-REPLACE/REPLACE' : 'ca-app-pub-REPLACE/REPLACE',
  interstitial: isIOS ? 'ca-app-pub-REPLACE/REPLACE' : 'ca-app-pub-REPLACE/REPLACE',
  rewarded: isIOS ? 'ca-app-pub-REPLACE/REPLACE' : 'ca-app-pub-REPLACE/REPLACE',
};

// Device IDs registered as AdMob test devices (see console logs on first
// run for "Use RequestConfiguration.Builder... to get test ads on this
// device" and add the printed hash here during development).
export const AD_TESTING_DEVICES = [];

// Firebase Web SDK config, from Firebase console > Project settings > General
// > Your apps > Web app (register one even though this ships as a native
// app — the JS SDK talks to Firestore/Realtime Database directly over the
// network from inside the WebView). The values mirror what's baked into
// GoogleService-Info.plist / google-services.json for the native SDKs used
// by @capacitor-firebase/authentication, analytics and crashlytics.
export const FIREBASE_CONFIG = {
  apiKey: 'REPLACE_WITH_FIREBASE_WEB_API_KEY',
  authDomain: 'REPLACE.firebaseapp.com',
  databaseURL: 'https://REPLACE-default-rtdb.firebaseio.com',
  projectId: 'REPLACE',
  storageBucket: 'REPLACE.appspot.com',
  messagingSenderId: 'REPLACE',
  appId: 'REPLACE',
};

// Non-consumable / subscription product IDs eligible for restore-on-launch.
// Consumables (crystal/medallion packs) are one-time grants and are never
// restored. Keep this in sync with the IAP catalog in src/game/catalog.js.
export const RESTORABLE_PRODUCT_IDS = ['cf_noads', 'cf_vip_month', 'cf_pass_premium', 'cf_starter'];
