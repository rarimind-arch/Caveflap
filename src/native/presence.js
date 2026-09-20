// A shim over Firebase Realtime Database that matches the exact shape
// engine.js already calls for online-battle presence and matchmaking
// (`room.onPeers(cb, onDisconnect)`, `room.peers()`, `room.presence(data)`),
// so the matchmaking/battle-relay code in engine.js needed zero changes
// when this replaced window.claude.use('room'). Protocol is unchanged:
// offer/accept by trophies + level, then both clients exchange move
// strings through `presence.duel.moves`.
import {
  getDatabase, ref, onValue, onDisconnect, update, set, remove, serverTimestamp,
} from 'firebase/database';
import { firebaseApp } from './firebase-app.js';
import { recordException } from './analytics.js';

const rtdb = getDatabase(firebaseApp);
const PRESENCE_ROOT = 'presence';
const sessionKey = (crypto.randomUUID ? crypto.randomUUID() : String(Math.random()).slice(2)).replace(/-/g, '');

let myUid = null;
let myRef = null;
let peersCache = {};
const peerListeners = new Set();
const disconnectListeners = new Set();

function toPeerList() {
  return Object.entries(peersCache).map(([peer, v]) => ({
    peer,
    isMe: v.uid === myUid,
    sameTab: peer === sessionKey,
    kind: v.kind || 'viewer',
    presence: v.presence || {},
  }));
}

function notifyPeers() { for (const fn of peerListeners) fn(); }

export async function createRoom(uid) {
  myUid = uid;
  const myPresenceRef = ref(rtdb, `${PRESENCE_ROOT}/${sessionKey}`);
  myRef = myPresenceRef;
  try {
    await set(myPresenceRef, { uid, kind: 'viewer', presence: {}, t: serverTimestamp() });
    onDisconnect(myPresenceRef).remove();
  } catch (e) { recordException(e, { where: 'createRoom' }); }

  onValue(ref(rtdb, PRESENCE_ROOT), snap => {
    peersCache = snap.val() || {};
    notifyPeers();
  }, () => {});

  onValue(ref(rtdb, '.info/connected'), snap => {
    if (snap.val() === false) for (const fn of disconnectListeners) fn();
  });

  return {
    onPeers(cb, onDisc) {
      peerListeners.add(cb);
      if (onDisc) disconnectListeners.add(onDisc);
      return () => { peerListeners.delete(cb); if (onDisc) disconnectListeners.delete(onDisc); };
    },
    peers() { return toPeerList(); },
    async presence(data) {
      if (!myRef) return;
      const patch = {};
      for (const k in data) patch[`presence/${k}`] = data[k];
      return update(myRef, patch);
    },
  };
}

export async function leaveRoom() {
  if (myRef) { try { await remove(myRef); } catch (e) {} }
  myRef = null;
}
