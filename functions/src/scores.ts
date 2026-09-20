import { onDocumentWritten } from 'firebase-functions/v2/firestore';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';

// The client remains authoritative for casual run currency (see
// firestore.rules for why), but the public leaderboard is everyone's
// business: this trigger re-checks every scores/{uid} write against sanity
// bounds derived from the doc's own counters and the game's own designed
// limits (see src/game/catalog.js ARENAS/ROAD_STEP/ROAD_MAX — nothing in
// normal play should ever reach trophies much past 5,000), and either flags
// it for review or rolls the public-facing doc back to the last known-good
// values. This can't catch everything a determined cheater could do (that
// would need a fully server-authoritative economy, which this casual game's
// design doesn't call for — see the rules file), but it stops a modified
// client from writing an arbitrary number straight into the public
// leaderboard.
const MAX_PLAUSIBLE_TROPHIES = 6000;

interface ScoreDoc {
  best?: number;
  flaps?: number;
  runFlaps?: number;
  games?: number;
  trophies?: number;
  medals?: number;
  bWins?: number;
  nick?: string;
  t?: number;
}

export const onScoreWrite = onDocumentWritten('scores/{uid}', async (event) => {
  const uid = event.params.uid as string;
  const after = event.data?.after?.data() as ScoreDoc | undefined;
  if (!after) return; // deleted, nothing to validate

  const before = (event.data?.before?.data() as ScoreDoc | undefined) || {};
  const reasons: string[] = [];
  const clamp: Partial<ScoreDoc> = {};

  // Reaching `best` points requires at least that many successful flaps
  // through gaps, plus flapping in between — flaps below best is physically
  // impossible through the actual game loop.
  if (typeof after.best === 'number' && typeof after.flaps === 'number' && after.flaps < after.best) {
    reasons.push(`flaps (${after.flaps}) below best (${after.best})`);
    clamp.best = Math.min(after.best, before.best ?? 0);
  }

  if (typeof after.trophies === 'number' && after.trophies > MAX_PLAUSIBLE_TROPHIES) {
    reasons.push(`trophies (${after.trophies}) beyond designed max (${MAX_PLAUSIBLE_TROPHIES})`);
    clamp.trophies = Math.min(after.trophies, before.trophies ?? 0, MAX_PLAUSIBLE_TROPHIES);
  }

  // A jump in battle wins without a matching jump in trophies-earning
  // activity is fine (losses/draws also cost energy); the inverse — trophies
  // rising with zero recorded wins ever — is not.
  if (typeof after.trophies === 'number' && after.trophies > 300 && !after.bWins) {
    reasons.push(`trophies (${after.trophies}) with zero recorded battle wins`);
    clamp.trophies = Math.min(after.trophies, before.trophies ?? 0);
  }

  if (!reasons.length) return;

  logger.warn('onScoreWrite: flagged suspicious score', { uid, reasons });
  await db.doc(`moderation/${uid}`).set({
    lastFlaggedAt: FieldValue.serverTimestamp(),
    reasons: FieldValue.arrayUnion(...reasons),
    lastAfter: after,
  }, { merge: true });

  if (Object.keys(clamp).length) {
    await event.data!.after.ref.update(clamp);
  }
});
