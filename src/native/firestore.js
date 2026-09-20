// A tiny shim over the Firebase Firestore Web SDK that matches the exact
// shape engine.js already calls (`db.doc(path).get()/.set()/.delete()`,
// `db.collection(path).onSnapshot(cb, errCb)`), so the save/leaderboard/
// player-list code in engine.js needed zero changes when this replaced
// window.claude.use('db'). Data layout is unchanged: data/users/{uid}/save,
// scores/{uid}, players/{uid}.
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc,
  collection, onSnapshot,
} from 'firebase/firestore';
import { firebaseApp } from './firebase-app.js';

const firestore = getFirestore(firebaseApp);

// Batch profile lookup (display name etc) for a list of uids, reading the
// public `players/{uid}` cards written by pushPlayer(). Matches the shape
// of the `user.profiles(ids) -> {[id]: {name, ...}}` call engine.js makes
// for opponent names in a live PvP battle and on the leaderboard.
export async function profiles(ids) {
  const out = {};
  await Promise.all((ids || []).map(async id => {
    try {
      const snap = await getDoc(doc(firestore, `players/${id}`));
      if (snap.exists()) out[id] = snap.data();
    } catch (e) {}
  }));
  return out;
}

export const db = {
  doc(path) {
    const ref = doc(firestore, path);
    return {
      async get() {
        const snap = await getDoc(ref);
        return { exists: snap.exists(), data: () => snap.data() };
      },
      set(data) { return setDoc(ref, data); },
      delete() { return deleteDoc(ref); },
    };
  },
  collection(path) {
    const ref = collection(firestore, path);
    return {
      onSnapshot(cb, errCb) {
        return onSnapshot(ref, snap => cb({ docs: snap.docs }), errCb);
      },
    };
  },
};
