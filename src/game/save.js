// Local save file: schema, defaults, validation/migration (clean()) and persistence.
// Extracted verbatim from the original single-file game.
import {
  ACH, AD_FREE_PER_DAY, AD_FREE_REWARD, ARENAS, BADGE_FAMS, BASE_MINIS, CARE, CATS, CAVES, CHAIN, DAILY, EVENTS, EVOLVE_AT, EXCL, FOODS, GEAR, GEM_CHANCE, GEM_COLORS, IAP, INTERSTITIAL_EVERY, MEDAL_CHANCE, MINI_IDS, MISSIONS, PAID_MINIS, RESET_VERSION, ROAD_MAX, ROAD_STEP, SKINS, SLOTS, TIERS, TOKEN_SHOP, UPGRADES, WEEKLY, batBonus, blankOutfit, gearBonus, reviveCost, roadReward, sum
} from './catalog.js';
import { clamp, arr, num } from './util.js';

  // ---------- save ----------
  const KEY = 'caveflap-save-v2';
  const DEF = () => ({ coins:0, bats:['night'], caves:['amethyst'], bat:'night', cave:'amethyst', sfx:true, music:true, vib:true,
    best:0, bestLevel:1, totalFlaps:0, bestRunFlaps:0, games:0, nick:'', mini:{}, gearOwned:[], gear:{ hat:null, face:null, back:null, trail:null },
    up:{}, pet:{ hunger:80, energy:80, fun:80, clean:80, health:100, sleeping:false, t:Date.now(), xp:0, lvl:1 },
    battle:{ w:0, l:0, d:0, pw:0, pl:0, pd:0, mw:0, ml:0, big:0 },
    stats:{ earned:0, time:0, minis:0, fed:0, baths:0, revives:0, powers:0, gems:0, pets:0, medals:0 },
    daily:{ day:'', m:[] }, streak:{ last:'', count:0, best:0 }, ach:{}, tut:false, rev:0, noAds:false, adCount:0, adFree:{ day:'', n:0 }, medals:0, care:{}, gemColor:'gold', gemColors:['gold'], minisOwned:[], player:{ lvl:1, xp:0 } });
  function clean(s) {
    const d = DEF(), o = { ...d, ...(s && typeof s === 'object' ? s : {}) };
    o.bats = arr(o.bats).filter(x => SKINS.some(k => k.id === x));
    o.caves = arr(o.caves).filter(x => CAVES.some(k => k.id === x));
    if (!o.bats.includes('night')) o.bats.unshift('night');
    if (!o.caves.includes('amethyst')) o.caves.unshift('amethyst');
    if (!o.bats.includes(o.bat)) o.bat = 'night';
    if (!o.caves.includes(o.cave)) o.cave = 'amethyst';
    for (const k of ['coins','best','bestLevel','totalFlaps','bestRunFlaps','games','rev']) o[k] = Math.max(0, Math.floor(num(o[k])));
    o.bestLevel = Math.max(1, o.bestLevel);
    o.nick = String(o.nick || '').slice(0, 16);
    const mi = {}, src = o.mini && typeof o.mini === 'object' ? o.mini : {};
    for (const k of MINI_IDS) mi[k] = Math.max(0, Math.floor(num(src[k])));
    o.mini = mi;
    o.gearOwned = arr(o.gearOwned).filter(id => GEAR.some(g => g.id === id));
    const srcO = o.outfits && typeof o.outfits === 'object' ? o.outfits : {}, outfits = {};
    for (const bid of o.bats) {
      const src = srcO[bid] || (bid === o.bat ? o.gear : null) || {}, og = blankOutfit();
      for (const sl of Object.keys(SLOTS)) { const it = GEAR.find(g => g.id === src[sl]); og[sl] = it && it.slot === sl && o.gearOwned.includes(it.id) && (!it.only || it.only === bid) ? it.id : null; }
      outfits[bid] = og;
    }
    o.outfits = outfits; o.gear = outfits[o.bat];
    o.devUsed = !!o.devUsed;
    o.owner = String(o.owner || '').slice(0, 80);
    o.sfxVol = clamp(num(o.sfxVol, o.sfx === false ? 0 : .8), 0, 1); o.musicVol = clamp(num(o.musicVol, o.music === false ? 0 : .6), 0, 1);
    o.fxLow = !!o.fxLow;
    o.adConsent = o.adConsent === 'yes' || o.adConsent === 'no' ? o.adConsent : null;
    o.age18 = o.age18 === true ? true : o.age18 === false ? false : null;
    o.seenUnlocks = arr(o.seenUnlocks).map(String); o.unlockInit = !!o.unlockInit;
    o.rating = clamp(Math.round(num(o.rating, 1000)), 0, 5000);
    o.trophies = Math.max(0, Math.floor(num(o.trophies))); o.bestTrophies = Math.max(o.trophies, Math.floor(num(o.bestTrophies)));
    o.troad = arr(o.troad).map(Number).filter(n => n >= 1 && n <= 60); o.arenaSeen = Math.max(0, Math.floor(num(o.arenaSeen)));
    o.trainTrophies = Math.max(0, Math.floor(num(o.trainTrophies)));
    o.stage = clamp(Math.floor(num(o.stage, 1)), 1, 10001);
    o.evo = clamp(Math.floor(num(o.evo)), 0, CHAIN.length - 1); o.evoSeen = Math.floor(num(o.evoSeen, -1)); o.resetV = Math.floor(num(o.resetV)); o.batLevels = Math.max(0, Math.floor(num(o.batLevels)));
    for (let i = 0; i <= o.evo; i++) if (!o.bats.includes(CHAIN[i])) o.bats.push(CHAIN[i]);
    if (CHAIN.includes(o.bat) && o.bat !== CHAIN[o.evo]) { o.bat = CHAIN[o.evo]; } o.season = String(o.season || ''); o.seasonGames = Math.max(0, Math.floor(num(o.seasonGames)));
    const ps = o.pass && typeof o.pass === 'object' ? o.pass : {};
    o.pass = { season:String(ps.season || ''), xp:Math.max(0, num(ps.xp)), f:arr(ps.f).map(Number).filter(n => n >= 1 && n <= 20), p:arr(ps.p).map(Number).filter(n => n >= 1 && n <= 20), premium:!!ps.premium };
    const wk = o.weekly && typeof o.weekly === 'object' ? o.weekly : {};
    o.weekly = { week:String(wk.week || ''), m:arr(wk.m).filter(m => m && WEEKLY.some(x => x.id === m.id)).map(m => ({ id:m.id, prog:Math.max(0, num(m.prog)), claimed:!!m.claimed })) };
    o.tokens = Math.max(0, Math.floor(num(o.tokens)));
    const ev = o.ev && typeof o.ev === 'object' ? o.ev : {};
    o.ev = { week:String(ev.week || ''), buys:ev.buys && typeof ev.buys === 'object' ? { ...ev.buys } : {}, earned:Math.max(0, num(ev.earned)) };
    const wb = o.wk && typeof o.wk === 'object' ? o.wk : {};
    o.wk = { week:String(wb.week || ''), best:Math.max(0, Math.floor(num(wb.best))) };
    o.toys = arr(o.toys).map(String); o.toyCd = o.toyCd && typeof o.toyCd === 'object' ? { ...o.toyCd } : {};
    o.vipUntil = Math.max(0, num(o.vipUntil)); o.vipDay = String(o.vipDay || ''); o.starterBought = !!o.starterBought;
    o.account = o.account && typeof o.account === 'object' ? { created:Math.max(0, num(o.account.created)) } : null;
    const up = {}; for (const u of UPGRADES) up[u.id] = clamp(Math.floor(num(o.up && o.up[u.id])), 0, u.max); o.up = up;
    const p = { ...d.pet, ...(o.pet && typeof o.pet === 'object' ? o.pet : {}) };
    for (const k of ['hunger','energy','fun','clean']) p[k] = clamp(num(p[k], 80), 0, 100);
    p.health = clamp(num(p.health, 100), 0, 100);
    const bt = { ...d.battle }; for (const k in bt) bt[k] = Math.max(0, Math.floor(num(o.battle && o.battle[k]))); o.battle = bt;
    p.sleeping = !!p.sleeping; p.t = num(p.t, Date.now()) || Date.now(); p.xp = Math.max(0, num(p.xp)); p.lvl = Math.max(1, Math.floor(num(p.lvl, 1)));
    o.pet = p;
    const st = { ...d.stats }; for (const k in st) st[k] = Math.max(0, num(o.stats && o.stats[k])); o.stats = st;
    o.daily = o.daily && typeof o.daily === 'object' && Array.isArray(o.daily.m)
      ? { day:String(o.daily.day || ''), m:o.daily.m.filter(m => m && MISSIONS.some(x => x.id === m.id)).map(m => ({ id:m.id, prog:Math.max(0, num(m.prog)), claimed:!!m.claimed })) }
      : d.daily;
    const sk = o.streak && typeof o.streak === 'object' ? o.streak : {};
    o.streak = { last:String(sk.last || ''), count:Math.max(0, Math.floor(num(sk.count))), best:Math.max(0, Math.floor(num(sk.best))) };
    const ach = {}; for (const a of ACH) if (o.ach && o.ach[a.id]) ach[a.id] = true; o.ach = ach;
    o.medals = Math.max(0, Math.floor(num(o.medals)));
    o.minisOwned = arr(o.minisOwned).filter(x => PAID_MINIS.includes(x));
    const pl = o.player && typeof o.player === 'object' ? o.player : {};
    o.player = { lvl:Math.max(1, Math.floor(num(pl.lvl, 1))), xp:Math.max(0, num(pl.xp)) };
    const care = {}; for (const c of CARE) care[c.id] = clamp(Math.floor(num(o.care && o.care[c.id])), 0, c.max); o.care = care;
    o.gemColors = arr(o.gemColors).filter(x => GEM_COLORS.some(g => g.id === x));
    if (!o.gemColors.includes('gold')) o.gemColors.unshift('gold');
    if (!o.gemColors.includes(o.gemColor)) o.gemColor = 'gold';
    o.noAds = !!o.noAds; o.adCount = Math.max(0, Math.floor(num(o.adCount)));
    o.adFree = o.adFree && typeof o.adFree === 'object' ? { day:String(o.adFree.day || ''), n:Math.max(0, Math.floor(num(o.adFree.n))) } : { day:'', n:0 };
    o.tut = !!o.tut; o.sfx = o.sfx !== false; o.music = o.music !== false; o.vib = o.vib !== false;
    return o;
  }
  let save;
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || 'null');
    save = clean(raw || {});
    if (!raw) { const old = parseInt(localStorage.getItem('caveflap-best') || '0', 10); if (old) save.best = old; }
  } catch (e) { save = clean({}); }
  function wipeTestSave(sv) {
    if (!sv.devUsed && sv.resetV === RESET_VERSION) return sv;
    const f = clean({});
    Object.assign(f, { sfx:sv.sfx, music:sv.music, vib:sv.vib, sfxVol:sv.sfxVol, musicVol:sv.musicVol, fxLow:sv.fxLow, adConsent:sv.adConsent, nick:sv.nick, tut:sv.tut, account:sv.account, owner:sv.owner, rev:sv.rev + 1, resetV:RESET_VERSION });
    return f;
  }
  if (save.devUsed || save.resetV !== RESET_VERSION) { save = clean(JSON.parse(JSON.stringify(wipeTestSave(save)))); try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
  function persist() { save.rev++; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
  const upLvl = id => save.up[id] || 0;


// Added for cross-module use: other modules cannot reassign an imported `save`
// binding directly (ES module live bindings are read-only to importers), so
// they call setSave() instead. Behaviour is identical to the original code,
// which reassigned the module-local `save` variable directly.
export function setSave(v) { save = v; }

export { DEF, KEY, clean, persist, upLvl, wipeTestSave, save };
