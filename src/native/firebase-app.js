// Initializes the Firebase JS SDK (used for Firestore + Realtime Database
// from inside the WebView, on both native and web builds). Native Auth,
// Analytics and Crashlytics go through the @capacitor-firebase plugins
// instead (see auth.js / analytics.js), which read the platform's own
// GoogleService-Info.plist / google-services.json.
import { initializeApp, getApps } from 'firebase/app';
import { FIREBASE_CONFIG } from './config.js';

export const firebaseApp = getApps().length ? getApps()[0] : initializeApp(FIREBASE_CONFIG);
