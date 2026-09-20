// Firebase Auth via @capacitor-firebase/authentication: native Sign in with
// Apple / Google UI on iOS/Android, a web-popup fallback in the browser, and
// an anonymous guest session so the game has a uid immediately on first
// launch (matching how window.claude.use('user') used to behave — no login
// wall before playing). skipNativeAuth defaults to false, so the plugin
// keeps the Firebase JS SDK's own auth state (used by firestore.js and
// presence.js) in sync with whichever identity is signed in here.
import { FirebaseAuthentication } from '@capacitor-firebase/authentication';
import './firebase-app.js';
import { recordException } from './analytics.js';
import { attachUserToNative } from './bridge.js';

let current = null; // { uid, name, avatarUrl, isAnonymous }
const listeners = new Set();

function toShape(user) {
  if (!user) return null;
  return { uid: user.uid, name: user.displayName || '', avatarUrl: user.photoUrl || '', isAnonymous: !!user.isAnonymous };
}

function emit() { for (const fn of listeners) fn(current); }

export function onAuthChange(fn) { listeners.add(fn); if (current) fn(current); return () => listeners.delete(fn); }

let initPromise = null;
export function initAuth() { return initPromise || (initPromise = doInitAuth()); }

async function doInitAuth() {
  try {
    await FirebaseAuthentication.addListener('authStateChange', async ({ user }) => {
      current = toShape(user);
      if (current) attachUserToNative(current.uid);
      emit();
    });
    const { user } = await FirebaseAuthentication.getCurrentUser();
    if (user) {
      current = toShape(user);
      emit();
    } else {
      const res = await FirebaseAuthentication.signInAnonymously();
      current = toShape(res.user);
      emit();
    }
  } catch (e) {
    recordException(e, { where: 'initAuth' });
  }
  return current;
}

// Upgrades the anonymous guest to a real, cross-device account without
// losing the uid (and therefore without losing the save, which is keyed by
// uid) — Apple/Google sign-in on top of an existing anonymous session links
// the credential instead of replacing it.
async function linkOrSignIn(linkFn, signInFn) {
  try {
    const wasAnonymous = current && current.isAnonymous;
    const res = wasAnonymous ? await linkFn() : await signInFn();
    current = toShape(res.user);
    emit();
    return current;
  } catch (e) {
    // Falls back to a plain sign-in if linking fails (e.g. credential already
    // used by another account) rather than leaving the user stuck.
    try {
      const res = await signInFn();
      current = toShape(res.user);
      emit();
      return current;
    } catch (e2) {
      recordException(e2, { where: 'linkOrSignIn' });
      return null;
    }
  }
}

export const signInWithApple = () => linkOrSignIn(
  () => FirebaseAuthentication.linkWithApple(),
  () => FirebaseAuthentication.signInWithApple(),
);

export const signInWithGoogle = () => linkOrSignIn(
  () => FirebaseAuthentication.linkWithGoogle(),
  () => FirebaseAuthentication.signInWithGoogle(),
);

export function currentUser() { return current; }
