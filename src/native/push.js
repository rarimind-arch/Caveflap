// Firebase Cloud Messaging: requests permission, registers the device
// token against the signed-in account (functions/src/push.js sends to
// these tokens for "bat bars low", "daily reward ready" and "new weekly
// event"), and shows a toast for notifications that arrive while the app
// is open in the foreground.
import { Capacitor } from '@capacitor/core';
import { FirebaseMessaging } from '@capacitor-firebase/messaging';
import { doc, setDoc, deleteField } from 'firebase/firestore';
import { getFirestore } from 'firebase/firestore';
import { firebaseApp } from './firebase-app.js';
import { recordException } from './analytics.js';

const native = Capacitor.isNativePlatform();
const firestore = getFirestore(firebaseApp);
let currentUid = null;
let registered = false;

async function saveToken(uid, token) {
  try { await setDoc(doc(firestore, `fcmTokens/${uid}`), { [token]: true }, { merge: true }); } catch (e) { recordException(e, { where: 'saveToken' }); }
}

export async function removeTokenOnSignOut(uid, token) {
  if (!uid || !token) return;
  try { await setDoc(doc(firestore, `fcmTokens/${uid}`), { [token]: deleteField() }, { merge: true }); } catch (e) {}
}

// Call once a Firebase Auth uid is known. Safe to call repeatedly — it only
// requests permission / registers a listener the first time.
export async function initPush(uid) {
  currentUid = uid;
  if (!native || registered) return;
  registered = true;
  try {
    const perm = await FirebaseMessaging.requestPermissions();
    if (perm.receive !== 'granted') return;
    const { token } = await FirebaseMessaging.getToken();
    if (token && currentUid) await saveToken(currentUid, token);

    await FirebaseMessaging.addListener('tokenReceived', ({ token: t }) => { if (t && currentUid) saveToken(currentUid, t); });
    await FirebaseMessaging.addListener('notificationReceived', (event) => {
      const title = event?.notification?.title;
      const body = event?.notification?.body;
      if (title || body) window.dispatchEvent(new CustomEvent('caveflap:push', { detail: { title, body } }));
    });
  } catch (e) {
    recordException(e, { where: 'initPush' });
  }
}
