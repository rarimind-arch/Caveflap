import { onRequest } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions/v2';
import { FieldValue } from 'firebase-admin/firestore';
import { db } from './admin';
import { CONSUMABLE_GRANTS, ENTITLEMENT_PRODUCT_IDS, STARTER_BONUS_COINS } from './catalog';

// Set this to a long random string, then configure the exact same value as
// the "Authorization header value" in RevenueCat > Project settings >
// Webhooks when you add this function's URL. See docs/BUILD_INSTRUCTIONS.md.
export const REVENUECAT_WEBHOOK_AUTH = defineSecret('REVENUECAT_WEBHOOK_AUTH');

interface RevenueCatEvent {
  id: string;
  type: string;
  app_user_id: string;
  original_app_user_id?: string;
  product_id?: string;
  expiration_at_ms?: number;
  entitlement_ids?: string[];
}

const GRANTING_EVENTS = new Set([
  'INITIAL_PURCHASE', 'RENEWAL', 'NON_RENEWING_PURCHASE', 'PRODUCT_CHANGE', 'UNCANCELLATION',
]);

// Verifies the purchase server-side and applies the grant. The client's own
// grantIap() still runs for instant UI feedback, but Firestore rules only
// trust entitlements/{uid} (written here with the Admin SDK, which bypasses
// rules) for noAds/VIP/premium-pass/starter flags — a modified client
// cannot grant itself those by writing its save doc directly. Consumable
// currency (crystal/medallion packs) is credited here too, server-side, by
// incrementing the save doc directly.
export const revenueCatWebhook = onRequest({ secrets: [REVENUECAT_WEBHOOK_AUTH], cors: false }, async (req, res) => {
  if (req.method !== 'POST') { res.status(405).send('Method not allowed'); return; }

  const expected = REVENUECAT_WEBHOOK_AUTH.value();
  const got = req.get('Authorization') || '';
  if (!expected || got !== expected) {
    logger.warn('revenueCatWebhook: bad auth header');
    res.status(401).send('Unauthorized');
    return;
  }

  const event = req.body?.event as RevenueCatEvent | undefined;
  if (!event || !event.id || !event.app_user_id) { res.status(400).send('Bad payload'); return; }

  const uid = event.app_user_id;
  const eventRef = db.doc(`processedRevenueCatEvents/${event.id}`);

  try {
    const already = await eventRef.get();
    if (already.exists) { res.status(200).send('Already processed'); return; }

    if (GRANTING_EVENTS.has(event.type) && event.product_id) {
      await applyGrant(uid, event.product_id, event);
    } else {
      logger.info('revenueCatWebhook: no grant needed', { type: event.type, product: event.product_id });
    }

    await eventRef.set({ type: event.type, uid, productId: event.product_id || null, processedAt: FieldValue.serverTimestamp() });
    res.status(200).send('OK');
  } catch (err) {
    logger.error('revenueCatWebhook failed', err);
    res.status(500).send('Internal error');
  }
});

async function applyGrant(uid: string, productId: string, event: RevenueCatEvent): Promise<void> {
  const consumable = CONSUMABLE_GRANTS[productId];
  const isStarter = productId === 'cf_starter';

  if (consumable || isStarter) {
    const saveRef = db.doc(`data/users/${uid}/save`);
    await db.runTransaction(async tx => {
      const snap = await tx.get(saveRef);
      if (!snap.exists) { logger.warn('applyGrant: no save doc yet, will retry on next event/launch', { uid }); return; }
      const inc: Record<string, FirebaseFirestore.FieldValue | number> = { rev: FieldValue.increment(1) };
      if (consumable?.coins) inc.coins = FieldValue.increment(consumable.coins);
      if (consumable?.medals) inc.medals = FieldValue.increment(consumable.medals);
      if (isStarter) inc.coins = FieldValue.increment(STARTER_BONUS_COINS);
      tx.update(saveRef, inc);
    });
  }

  if (ENTITLEMENT_PRODUCT_IDS.has(productId)) {
    const entRef = db.doc(`entitlements/${uid}`);
    const patch: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (productId === 'cf_noads') patch.noAds = true;
    if (productId === 'cf_vip_month') patch.vipUntil = event.expiration_at_ms || (Date.now() + 30 * 864e5);
    if (productId === 'cf_pass_premium') patch.pass_premium = true;
    if (productId === 'cf_starter') patch.starter = true;
    await entRef.set(patch, { merge: true });
  }
}
