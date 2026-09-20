// RevenueCat purchases. Product IDs passed in here are the raw store product
// identifiers from the IAP catalog in src/game/catalog.js (cf_crystals_500,
// cf_starter, cf_vip_month, ...) — configure matching products in the
// RevenueCat dashboard with the same identifiers (see docs/BUILD_INSTRUCTIONS.md).
import { Capacitor } from '@capacitor/core';
import { Purchases, LOG_LEVEL } from '@revenuecat/purchases-capacitor';
import { REVENUECAT_API_KEY, RESTORABLE_PRODUCT_IDS } from './config.js';
import { recordException } from './analytics.js';

const native = Capacitor.isNativePlatform();
let configured = false;

export async function initPurchases() {
  if (!native || configured) return;
  configured = true;
  try {
    await Purchases.setLogLevel({ level: LOG_LEVEL.WARN });
    await Purchases.configure({ apiKey: REVENUECAT_API_KEY });
  } catch (e) { recordException(e, { where: 'initPurchases' }); }
}

// -> Promise<boolean>. Resolves true only once the store has confirmed the
// purchase; the caller (engine.js) grants the item only on true.
export async function purchase(productId) {
  if (!native) return false;
  try {
    const { products } = await Purchases.getProducts({ productIdentifiers: [productId] });
    const product = products && products[0];
    if (!product) return false;
    const result = await Purchases.purchaseStoreProduct({ product });
    return !!(result && result.customerInfo);
  } catch (e) {
    // RevenueCat rejects with { userCancelled: true } when the player backs out —
    // that's not an error, just "no purchase happened".
    if (!e || !e.userCancelled) recordException(e, { where: 'purchase', productId });
    return false;
  }
}

// Returns the subset of RESTORABLE_PRODUCT_IDS the account already owns, for
// window.CaveFlapRestore(ids) on launch.
export async function restorablePurchases() {
  if (!native) return [];
  try {
    const { customerInfo } = await Purchases.restorePurchases();
    const owned = new Set(customerInfo.allPurchasedProductIdentifiers || []);
    return RESTORABLE_PRODUCT_IDS.filter(id => owned.has(id));
  } catch (e) {
    recordException(e, { where: 'restorablePurchases' });
    return [];
  }
}

export async function purchasesUserId() {
  if (!native) return null;
  try { const { appUserID } = await Purchases.getAppUserID(); return appUserID; } catch (e) { return null; }
}

// Links the RevenueCat anonymous user to the signed-in Firebase uid, so
// purchases follow the account across devices.
export async function linkPurchasesToUser(uid) {
  if (!native || !uid) return;
  try { await Purchases.logIn({ appUserID: uid }); } catch (e) { recordException(e, { where: 'linkPurchasesToUser' }); }
}
