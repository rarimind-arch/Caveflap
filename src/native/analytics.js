// Firebase Analytics + Crashlytics. Both @capacitor-firebase plugins read
// their config from the native GoogleService-Info.plist / google-services.json
// (see docs/BUILD_INSTRUCTIONS.md) — nothing to initialize here in JS.
import { Capacitor } from '@capacitor/core';
import { FirebaseAnalytics } from '@capacitor-firebase/analytics';
import { FirebaseCrashlytics } from '@capacitor-firebase/crashlytics';

const native = Capacitor.isNativePlatform();

export async function logAnalyticsEvent(name, params = {}) {
  if (!native) return;
  // Firebase event names: letters, numbers, underscores, <= 40 chars.
  const safeName = String(name).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40);
  const safeParams = {};
  for (const k of Object.keys(params || {})) {
    const key = String(k).replace(/[^A-Za-z0-9_]/g, '_').slice(0, 40);
    const v = params[k];
    safeParams[key] = (typeof v === 'object' && v !== null) ? JSON.stringify(v).slice(0, 100) : v;
  }
  try { await FirebaseAnalytics.logEvent({ name: safeName, params: safeParams }); } catch (e) { /* analytics must never break gameplay */ }
}

export async function setAnalyticsUserId(uid) {
  if (!native) return;
  try { await FirebaseAnalytics.setUserId({ userId: uid || null }); } catch (e) {}
  try { await FirebaseCrashlytics.setUserId({ userId: uid || '' }); } catch (e) {}
}

export async function setAnalyticsConsent(granted) {
  if (!native) return;
  try {
    await FirebaseAnalytics.setConsent({
      analyticsStorage: granted ? 'granted' : 'denied',
      adStorage: granted ? 'granted' : 'denied',
      adUserData: granted ? 'granted' : 'denied',
      adPersonalization: granted ? 'granted' : 'denied',
    });
  } catch (e) {}
}

export async function crashlyticsLog(message) {
  if (!native) return;
  try { await FirebaseCrashlytics.log({ message: String(message).slice(0, 500) }); } catch (e) {}
}

export async function recordException(err, keysAndValues) {
  if (!native) { console.error(err); return; }
  try {
    await FirebaseCrashlytics.recordException({
      message: String((err && err.message) || err).slice(0, 2000),
      keysAndValues: keysAndValues ? Object.entries(keysAndValues).map(([key, value]) => ({ key, type: 'string', value: String(value) })) : undefined,
    });
  } catch (e) {}
}

export function installGlobalCrashReporting() {
  if (!native) return;
  window.addEventListener('error', e => recordException(e.error || e.message || 'window error'));
  window.addEventListener('unhandledrejection', e => recordException(e.reason || 'unhandled rejection'));
}
