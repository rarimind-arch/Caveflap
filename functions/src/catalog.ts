// Mirrors the GRANTS table in src/game/engine.js (originally from the IAP
// catalog in src/game/catalog.js) — kept in sync manually since it's small
// and rarely changes. This is the server-side source of truth: consumable
// grants (crystals/medallions) are applied here directly by the RevenueCat
// webhook, and non-consumable/subscription entitlements are written to
// entitlements/{uid}, which Firestore rules treat as the only trustworthy
// source for noAds/VIP/premium-pass/starter-pack flags.

export type ConsumableGrant = { coins?: number; medals?: number };
export type EntitlementGrant = { noAds?: true } | { vipDays: number } | { pass_premium: true } | { starter: true };

export const CONSUMABLE_GRANTS: Record<string, ConsumableGrant> = {
  cf_crystals_500: { coins: 500 },
  cf_crystals_1200: { coins: 1200 },
  cf_crystals_3500: { coins: 3500 },
  cf_crystals_8000: { coins: 8000 },
  cf_crystals_18000: { coins: 18000 },
  cf_medals_5: { medals: 5 },
  cf_medals_12: { medals: 12 },
  cf_medals_35: { medals: 35 },
  cf_medals_80: { medals: 80 },
  cf_medals_180: { medals: 180 },
};

// cf_starter also grants a one-time 1500 coins alongside the entitlement
// flag (bat/gear unlock stays client-side cosmetic, applied when the client
// sees entitlements/{uid}.starter === true).
export const STARTER_BONUS_COINS = 1500;

export const ENTITLEMENT_PRODUCT_IDS = new Set(['cf_noads', 'cf_vip_month', 'cf_pass_premium', 'cf_starter']);
