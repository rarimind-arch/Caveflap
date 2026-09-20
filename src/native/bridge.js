// Wires RevenueCat, AdMob and Firebase Analytics/Crashlytics into the seam
// the game already calls: window.CaveFlapNative = { purchase, showAd, log }.
// On the web (or before native init finishes) window.CaveFlapNative stays
// unset, so the game's existing placeholder UI (fake purchase dialog, fake
// ad timer) keeps working exactly as it did as a plain web page.
import { Capacitor } from '@capacitor/core';
import { SplashScreen } from '@capacitor/splash-screen';
import { initPurchases, purchase, restorablePurchases, linkPurchasesToUser, purchasesUserId } from './purchases.js';
import { initAds, showAd, watchBannerSlots } from './ads.js';
import { logAnalyticsEvent, installGlobalCrashReporting, recordException } from './analytics.js';

const native = Capacitor.isNativePlatform();

export async function initNativeBridge() {
  if (!native) return;
  installGlobalCrashReporting();
  try {
    await Promise.all([initPurchases(), initAds()]);
    watchBannerSlots();

    window.CaveFlapNative = {
      purchase: (productId) => purchase(productId),
      showAd: (kind, personalized) => showAd(kind, personalized),
      log: (name, params) => logAnalyticsEvent(name, params),
    };

    const restored = await restorablePurchases();
    if (typeof window.CaveFlapRestore === 'function') window.CaveFlapRestore(restored);
  } catch (e) {
    recordException(e, { where: 'initNativeBridge' });
  } finally {
    try { await SplashScreen.hide(); } catch (e) {}
  }
}

// Called once a Firebase Auth uid is known (see native/auth.js), so
// RevenueCat's purchaser identity and analytics' user id follow the account.
export async function attachUserToNative(uid) {
  if (!native) return;
  await linkPurchasesToUser(uid);
}

export { purchasesUserId };
