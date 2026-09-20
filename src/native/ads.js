// AdMob: init, Google UMP (EU) consent, interstitial, rewarded, and the
// 320x50 banner slots marked `data-ad` in index.html (menu/minigames/game
// over screens). Falls back to no-ops on the web so the dev build never
// throws when the AdMob native plugin isn't present.
import { Capacitor } from '@capacitor/core';
import { AdMob, BannerAdPosition, BannerAdSize } from '@capacitor-community/admob';
import { ADMOB_AD_UNITS, ADMOB_USE_TEST_IDS, AD_TESTING_DEVICES } from './config.js';
import { recordException } from './analytics.js';

const native = Capacitor.isNativePlatform();
let consentGiven = false; // true once the user can be shown non-personalized-or-better ads
let personalizedAllowed = false; // true once UMP / settings say personalized ads are OK
let initialized = false;
let interstitialReady = false;
let rewardedReady = false;
let bannerVisible = false;

export async function initAds() {
  if (!native || initialized) return;
  initialized = true;
  try {
    await AdMob.initialize({
      initializeForTesting: ADMOB_USE_TEST_IDS,
      testingDevices: AD_TESTING_DEVICES,
      tagForUnderAgeOfConsent: false,
    });
    await requestUmpConsentIfNeeded();
    preloadInterstitial();
    preloadRewarded();
  } catch (e) { recordException(e, { where: 'initAds' }); }
}

// Google User Messaging Platform: shows the EU/UK consent form only where
// legally required (UMP determines the user's region server-side).
async function requestUmpConsentIfNeeded() {
  try {
    const info = await AdMob.requestConsentInfo();
    if (info.isConsentFormAvailable && info.status === 'REQUIRED') {
      const after = await AdMob.showConsentForm();
      consentGiven = after.canRequestAds;
      personalizedAllowed = after.status === 'OBTAINED';
    } else {
      consentGiven = info.canRequestAds;
      personalizedAllowed = info.status === 'NOT_REQUIRED' || info.status === 'OBTAINED';
    }
  } catch (e) {
    // If UMP fails (offline, misconfigured), fall back to non-personalized ads only.
    consentGiven = true;
    personalizedAllowed = false;
  }
}

// Lets the player reopen the privacy-options form from Settings, per Google's
// UMP policy requiring a persistent way to change consent.
export async function showPrivacyOptionsForm() {
  if (!native) return;
  try { await AdMob.showPrivacyOptionsForm(); } catch (e) {}
}

function npa(requestedPersonalized) {
  // Non-personalized-ads flag: true unless both UMP and the player's in-game
  // toggle agree personalized ads are allowed.
  return !(personalizedAllowed && requestedPersonalized);
}

async function preloadInterstitial() {
  try {
    await AdMob.prepareInterstitial({ adId: ADMOB_AD_UNITS.interstitial, isTesting: ADMOB_USE_TEST_IDS, npa: npa(false) });
    interstitialReady = true;
  } catch (e) { interstitialReady = false; }
}

async function preloadRewarded() {
  try {
    await AdMob.prepareRewardVideoAd({ adId: ADMOB_AD_UNITS.rewarded, isTesting: ADMOB_USE_TEST_IDS, npa: npa(false) });
    rewardedReady = true;
  } catch (e) { rewardedReady = false; }
}

// kind: 'interstitial' | 'rewarded'. Resolves true when the ad was shown
// (interstitial) or the reward was earned (rewarded) — this matches the
// `NATIVE().showAd(kind, personalized) -> Promise<boolean>` contract the
// game already expects.
export async function showAd(kind, personalized) {
  if (!native) return false;
  if (!consentGiven) await requestUmpConsentIfNeeded();
  try {
    if (kind === 'rewarded') {
      if (!rewardedReady) await preloadRewarded();
      if (!rewardedReady) return false;
      const reward = await AdMob.showRewardVideoAd();
      rewardedReady = false;
      preloadRewarded();
      return !!(reward && reward.type);
    }
    if (!interstitialReady) await preloadInterstitial();
    if (!interstitialReady) return false;
    await AdMob.showInterstitial();
    interstitialReady = false;
    preloadInterstitial();
    return true;
  } catch (e) {
    recordException(e, { where: 'showAd', kind });
    interstitialReady = false; rewardedReady = false;
    return false;
  }
}

async function showBanner() {
  if (!native || bannerVisible) return;
  try {
    await AdMob.showBanner({
      adId: ADMOB_AD_UNITS.banner,
      adSize: BannerAdSize.BANNER,
      position: BannerAdPosition.BOTTOM_CENTER,
      isTesting: ADMOB_USE_TEST_IDS,
      npa: npa(false),
    });
    bannerVisible = true;
  } catch (e) {}
}

async function hideBanner() {
  if (!native || !bannerVisible) return;
  try { await AdMob.hideBanner(); } catch (e) {}
  bannerVisible = false;
}

// The game marks its 320x50 banner spots with `data-ad="...-banner"` inside
// whichever screen is showing (menu, minigames, game-over). AdMob banners
// are a native overlay, not a DOM element, so we show/hide the real banner
// based on whether such a spot is currently visible on screen.
export function watchBannerSlots() {
  if (!native) return;
  const sync = () => {
    const onScreen = document.querySelector('.screen.on .adslot.banner.inapp[data-ad]');
    if (onScreen) showBanner(); else hideBanner();
  };
  const mo = new MutationObserver(sync);
  mo.observe(document.body, { attributes: true, attributeFilter: ['class'], subtree: true });
  sync();
}
