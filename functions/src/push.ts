import { onSchedule } from 'firebase-functions/v2/scheduler';
import { logger } from 'firebase-functions/v2';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';

// Note on timing: src/game/engine.js computes day/week boundaries in each
// player's *local* timezone (see dayKey()/weekKey()), which a single
// scheduled Cloud Function can't match exactly for every player at once.
// These use UTC day/week boundaries instead — close enough for a "come back
// and check" nudge, not meant to fire at the exact stroke of local midnight.

function utcDayKey(d = new Date()): string { return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}`; }
function utcWeekKey(d = new Date()): string {
  const day = (d.getUTCDay() + 6) % 7; // Monday-anchored, matching engine.js's weekKey()
  const monday = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  return `${monday.getUTCFullYear()}-${monday.getUTCMonth() + 1}-${monday.getUTCDate()}`;
}

interface SaveDoc {
  pet?: { hunger?: number; energy?: number; fun?: number; clean?: number; health?: number; t?: number };
  streak?: { last?: string };
  noAds?: boolean;
}

async function tokensFor(uid: string): Promise<string[]> {
  const snap = await db.doc(`fcmTokens/${uid}`).get();
  if (!snap.exists) return [];
  return Object.keys(snap.data() || {});
}

async function sendToUid(uid: string, title: string, body: string): Promise<void> {
  const tokens = await tokensFor(uid);
  if (!tokens.length) return;
  try {
    const res = await getMessaging().sendEachForMulticast({ tokens, notification: { title, body } });
    const dead = res.responses.map((r, i) => (!r.success ? tokens[i] : null)).filter((t): t is string => !!t);
    if (dead.length) {
      const clear: Record<string, FirebaseFirestore.FieldValue> = {};
      for (const t of dead) clear[t] = FieldValue.delete();
      await db.doc(`fcmTokens/${uid}`).set(clear, { merge: true });
    }
  } catch (err) { logger.warn('sendToUid failed', { uid, err }); }
}

// Every player has a public players/{uid} card (see pushPlayer() in
// engine.js) — that's the closest thing to a full user index this data
// layout has, so scheduled sweeps page through it. Fine at this game's
// scale; if the player base gets very large, replace with a maintained
// "needsPetReminder"-style index collection instead of scanning everyone.
async function forEachPlayer(fn: (uid: string) => Promise<void>): Promise<void> {
  const snap = await db.collection('players').get();
  await Promise.all(snap.docs.map(d => fn(d.id).catch(err => logger.warn('forEachPlayer item failed', { uid: d.id, err }))));
}

export const notifyLowPetBars = onSchedule({ schedule: 'every 4 hours' }, async () => {
  const now = Date.now();
  await forEachPlayer(async (uid) => {
    const saveSnap = await db.doc(`data/users/${uid}/save`).get();
    if (!saveSnap.exists) return;
    const save = saveSnap.data() as SaveDoc;
    const pet = save.pet;
    if (!pet || typeof pet.t !== 'number') return;
    const hoursSince = (now - pet.t) / 3600000;
    const wasLow = [pet.hunger, pet.energy, pet.fun, pet.clean, pet.health].some(v => typeof v === 'number' && v < 25);
    if (!wasLow || hoursSince < 3) return;

    const stateRef = db.doc(`pushState/${uid}`);
    const state = (await stateRef.get()).data() || {};
    if (state.lastPetReminderAt && now - state.lastPetReminderAt < 18 * 3600000) return; // at most once/18h

    await sendToUid(uid, 'Your bat misses you', 'Its food, energy, fun or clean bar is running low. Come give it some care!');
    await stateRef.set({ lastPetReminderAt: now }, { merge: true });
  });
});

export const notifyDailyRewardReady = onSchedule({ schedule: '0 17 * * *' }, async () => {
  const today = utcDayKey();
  await forEachPlayer(async (uid) => {
    const saveSnap = await db.doc(`data/users/${uid}/save`).get();
    if (!saveSnap.exists) return;
    const save = saveSnap.data() as SaveDoc;
    if (save.streak?.last === today) return; // already claimed today (by local date, best effort)

    const stateRef = db.doc(`pushState/${uid}`);
    const state = (await stateRef.get()).data() || {};
    if (state.lastDailyReminderDay === today) return;

    await sendToUid(uid, 'Daily reward ready', 'Open Cave Flap to claim today’s reward and keep your streak going.');
    await stateRef.set({ lastDailyReminderDay: today }, { merge: true });
  });
});

export const notifyWeeklyEvent = onSchedule({ schedule: '0 12 * * 1' }, async () => {
  const week = utcWeekKey();
  const stateRef = db.doc('pushState/_global');
  const state = (await stateRef.get()).data() || {};
  if (state.lastWeeklyEventBroadcast === week) return;

  await forEachPlayer(async (uid) => {
    await sendToUid(uid, 'New weekly event', 'This week’s event just started — open Cave Flap to see the bonus and event shop.');
  });
  await stateRef.set({ lastWeeklyEventBroadcast: week }, { merge: true });
});
