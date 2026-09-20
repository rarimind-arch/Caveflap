// Main game engine: core flap gameplay, minigames, battles, pet care, store,
// progression systems and UI wiring. This is the original single-file game's
// logic, kept together deliberately: the code shares a dense web of mutable
// top-level state (t, dist, shake, state, cur, bat, trail, ...) that many
// short-named locals also shadow, which makes further splitting unsafe to do
// mechanically without a real scope-aware refactor tool. catalog data, saves,
// audio and legal text were safely extracted into their own modules below.
import { save, setSave, persist, upLvl, clean, wipeTestSave, KEY } from './save.js';
import { ACH, AD_FREE_PER_DAY, AD_FREE_REWARD, ARENAS, BADGE_FAMS, BASE_MINIS, CARE, CATS, CAVES, CHAIN, DAILY, EVENTS, EVOLVE_AT, EXCL, FOODS, GEAR, GEM_CHANCE, GEM_COLORS, IAP, INTERSTITIAL_EVERY, MEDAL_CHANCE, MINI_IDS, MISSIONS, PAID_MINIS, RESET_VERSION, ROAD_MAX, ROAD_STEP, SKINS, SLOTS, TIERS, TOKEN_SHOP, UPGRADES, WEEKLY, batBonus, blankOutfit, gearBonus, reviveCost, roadReward, sum } from './catalog.js';
import { AC, BUS, MUSIC, SFX, ac, bell, mNext, mStep, mLeadIdx, mTheme, noise, noteOf, semi, sfx, tone, vib } from './audio.js';
import { APP_VERSION, COMPANY, LEGAL, SUPPORT_EMAIL } from './legal.js';
  const W = 360;
  const IS_TOUCH = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  function availSize() {
    const cs = getComputedStyle(document.body);
    return [window.innerWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0), window.innerHeight - parseFloat(cs.paddingTop || 0) - parseFloat(cs.paddingBottom || 0)];
  }
  // Tall phones get a taller play area instead of black bars; everything anchors to H and FLOOR.
  const H = (() => { const [aw, ah] = availSize(); return ah > aw ? Math.round(Math.min(780, Math.max(640, W * ah / aw))) : 640; })();
  const FLOOR = H - 64;
  const DPR = () => Math.min(2, window.devicePixelRatio || 1);
  let lowFx = false;
  (() => { // Drop canvas glow when the device struggles; glow is the most expensive effect on phones.
    const d = Object.getOwnPropertyDescriptor(CanvasRenderingContext2D.prototype, 'shadowBlur');
    if (d && d.set) Object.defineProperty(CanvasRenderingContext2D.prototype, 'shadowBlur', { configurable:true, get() { return d.get.call(this); }, set(v) { d.set.call(this, lowFx ? 0 : v); } });
  })();
  const FONT = '"Bungee", "Arial Black", Impact, sans-serif';
  const EMOJI = 'system-ui, "Apple Color Emoji", "Segoe UI Emoji", "Noto Color Emoji", sans-serif';
  const $ = s => document.querySelector(s);
  const $$ = s => Array.from(document.querySelectorAll(s));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const arr = v => Array.isArray(v) ? v.slice() : [];
  const num = (v, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };

  // ---------- cloud (leaderboard + synced save) ----------
  let db = null, user = null, uid = null, boardStatus = 'loading', boardRows = [];
  let chain = Promise.resolve(), pushTimer = null;
  const queue = fn => { chain = chain.then(fn).catch(e => console.warn('db', e)); };
  function pushSave(now) {
    if (!db || !uid) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(() => {
      pushTimer = null;
      const copy = JSON.parse(JSON.stringify(save));
      queue(() => db.doc(`data/users/${uid}/save`).set(copy).then(() => { lastSync = Date.now(); if ($('#account').classList.contains('on')) renderAccount(); }));
    }, now ? 0 : 1200);
  }
  let lastSync = 0, acctMe = null, playerRows = [];
  // Public account card other players can see: name, levels, last played.
  function pushPlayer() {
    if (!db || !uid || !save.account) return;
    const doc = { name:save.nick || '', created:save.account.created, lvl:save.player.lvl, batLvl:save.pet.lvl, bat:save.bat, t:Date.now() };
    queue(() => db.doc(`players/${uid}`).set(doc));
  }
  function pushScore() {
    if (!db || !uid) return;
    pushPlayer();
    if (save.games < 1 && !Object.values(save.mini).some(v => v > 0)) return;
    const doc = { best:save.best, level:save.bestLevel, flaps:save.totalFlaps, runFlaps:save.bestRunFlaps, games:save.games, petLvl:save.pet.lvl, evo:save.evo + 1, plLvl:save.player.lvl, bWins:save.battle.pw, rating:(save.battle.pw + save.battle.pl + save.battle.pd) ? save.rating : 0, trophies:save.trophies, medals:save.stats.medals, wk:save.wk.week, wkBest:save.wk.week === weekKey() ? save.wk.best : 0, nick:save.nick, t:Date.now() };
    for (const k in save.mini) doc['m_' + k] = save.mini[k];
    queue(() => db.doc(`scores/${uid}`).set(doc));
  }
  let room = null, myUid = null;
  (async () => {
    await new Promise(r => setTimeout(r, 0));
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') return;
    try { const u = await cl.use('user'); if (u) { if (!user) user = u; myUid = await u.id(); } } catch (e) {}
    try { room = await cl.use('room'); } catch (e) { room = null; }
    if (room) room.onPeers(() => { if ($('#arena').classList.contains('on')) arenaPeersChanged(); }, () => { room = null; });
  })();
  (async () => {
    await new Promise(r => setTimeout(r, 0));
    const cl = window.claude;
    if (!cl || typeof cl.use !== 'function') { boardStatus = 'offline'; renderBoard(); return; }
    try { [db, user] = await Promise.all([cl.use('db'), cl.use('user')]); } catch (e) { db = null; }
    if (!db) { boardStatus = 'offline'; renderBoard(); return; }
    try { uid = user ? await user.id() : null; } catch (e) { uid = null; }
    try { acctMe = user ? await user.me() : null; } catch (e) { acctMe = null; }
    if (uid) {
      // A save left on this device by a different account never leaks into this one.
      if (save.owner && save.owner !== uid) { const keep = { sfx:save.sfx, music:save.music, vib:save.vib }; setSave({ ...clean({}), ...keep }); refreshUI(); }
      save.owner = uid;
      try {
        const snap = await db.doc(`data/users/${uid}/save`).get();
        if (snap.exists) {
          const c = clean(JSON.parse(JSON.stringify(wipeTestSave(clean(JSON.parse(JSON.stringify(snap.data())))))));
          if (c.rev > save.rev || (c.rev === save.rev && c.games > save.games)) {
            const keep = { sfx:save.sfx, music:save.music, vib:save.vib };
            setSave({ ...c, ...keep }); applyOffline();
            try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {}
            refreshUI(); if (state === 'menu' && dailyAvailable() && $('#menu').classList.contains('on')) { renderDaily(); show('daily'); }
          } else if (save.rev > c.rev) pushSave(true);
        } else if (save.rev > 0) { pushSave(true); pushScore(); }
      } catch (e) {}
    }
    if (uid) accountCheck();
    db.collection('players').onSnapshot(s => {
      playerRows = s.docs.map(d => ({ id:d.id, ...d.data() }));
      if ($('#account').classList.contains('on')) renderPlayers();
    }, () => {});
    boardStatus = 'live';
    db.collection('scores').onSnapshot(s => {
      boardRows = s.docs.map(d => ({ id:d.id, ...d.data() }));
      renderBoard();
    }, () => { boardStatus = 'offline'; renderBoard(); });
    renderBoard();
  })();

  // ---------- layout ----------
  const app = $('#app'), cv = $('#c'), ctx = cv.getContext('2d');
  function resize() {
    const [aw, ah] = availSize();
    const s = Math.min(aw / W, ah / H) * (IS_TOUCH ? 1 : 0.98);
    const dpr = DPR();
    document.body.classList.toggle('touch', IS_TOUCH);
    document.body.classList.toggle('rotate', IS_TOUCH && window.innerWidth > window.innerHeight && window.innerHeight < 520);
    const rails = !IS_TOUCH && !save.noAds && ah >= 600 && aw - W * s >= 2 * (160 + 24);
    document.body.classList.toggle('rails', rails);
    document.body.classList.toggle('noads', save.noAds);
    app.style.width = (W * s) + 'px'; app.style.height = (H * s) + 'px';
    app.style.fontSize = (16 * s) + 'px';
    cv.width = Math.round(W * s * dpr); cv.height = Math.round(H * s * dpr);
    ctx.setTransform(s * dpr, 0, 0, s * dpr, 0, 0);
  }
  window.addEventListener('resize', resize);
  app.addEventListener('scroll', () => { app.scrollLeft = 0; app.scrollTop = 0; });
  window.addEventListener('orientationchange', () => setTimeout(resize, 250));
  if (window.visualViewport) window.visualViewport.addEventListener('resize', resize);
  resize();
  document.addEventListener('gesturestart', e => e.preventDefault());
  document.addEventListener('dblclick', e => e.preventDefault(), { passive:false });
  document.addEventListener('contextmenu', e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); });
  document.addEventListener('touchmove', e => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive:false });

  // ---------- drawing helpers ----------
  const rnd = seed => { const x = Math.sin(seed * 12.9898) * 43758.5453; return x - Math.floor(x); };
  const wrap = (v, m) => ((v % m) + m) % m;
  function hexA(hex, a) {
    if (!hex.startsWith('#')) return hex;
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${a})`;
  }
  const skinOf = id => SKINS.find(s => s.id === id) || SKINS[0];
  const gemOf = id => GEM_COLORS.find(g => g.id === id) || GEM_COLORS[0];
  const gemCol = (id = save.gemColor, tt = t) => { const c = gemOf(id).c; return c === 'rainbow' ? `hsl(${(tt * 120) % 360},90%,65%)` : c; };
  function applyGemCss() {
    const c = gemOf(save.gemColor).c, r = document.documentElement.style;
    if (c === 'rainbow') { r.setProperty('--gemBg', 'linear-gradient(135deg,#ff4f6d,#ffcf5c,#4dff9a,#4f9dff,#c07cff)'); r.setProperty('--glow', '#ffcf5c'); }
    else r.setProperty('--gemBg', c);
  }
  const careLvl = id => save.care[id] || 0;
  const happyPct = () => 10 + careLvl('heart') * 2;
  function drawMedal(g, x, y, r, tt, ph = 0) {
    const sx = Math.max(.18, Math.abs(Math.cos(tt * 2.6 + ph)));
    g.save(); g.translate(x, y); g.scale(sx, 1);
    g.shadowColor = '#ffcf5c'; g.shadowBlur = 16;
    const gr = g.createRadialGradient(-r * .35, -r * .35, 1, 0, 0, r);
    gr.addColorStop(0, '#fff1b8'); gr.addColorStop(.45, '#d9a441'); gr.addColorStop(1, '#8a5a14');
    g.fillStyle = gr; g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.shadowBlur = 0;
    g.strokeStyle = '#fff1b8'; g.lineWidth = r * .12; g.beginPath(); g.arc(0, 0, r * .72, 0, Math.PI * 2); g.stroke();
    g.fillStyle = '#6b420c'; const k = r / 11;
    g.beginPath(); g.moveTo(0, -1 * k); g.lineTo(-4 * k, -4 * k); g.lineTo(-7 * k, -2 * k); g.lineTo(-5 * k, 2 * k); g.lineTo(-2 * k, 1 * k); g.lineTo(0, 4 * k);
    g.lineTo(2 * k, 1 * k); g.lineTo(5 * k, 2 * k); g.lineTo(7 * k, -2 * k); g.lineTo(4 * k, -4 * k); g.closePath(); g.fill();
    g.restore();
  }
  const caveOf = id => CAVES.find(c => c.id === id) || CAVES[0];
  const rr = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  function diamond(g, x, y, s) {
    g.beginPath(); g.moveTo(x, y - s * 1.6); g.lineTo(x + s, y); g.lineTo(x, y + s * 1.6); g.lineTo(x - s, y); g.closePath(); g.fill();
  }
  function heart(g, x, y, r) {
    g.beginPath(); g.moveTo(x, y + r * .9);
    g.bezierCurveTo(x - r * 1.6, y - r * .4, x - r * .6, y - r * 1.5, x, y - r * .5);
    g.bezierCurveTo(x + r * .6, y - r * 1.5, x + r * 1.6, y - r * .4, x, y + r * .9); g.fill();
  }
  function drawParticle(g, p, a) {
    g.globalAlpha = a; g.fillStyle = p.c;
    if (p.shape === 'diamond') diamond(g, p.x, p.y, p.r * .7);
    else if (p.shape === 'heart') heart(g, p.x, p.y, p.r);
    else if (p.shape === 'star') starShape(g, p.x, p.y, p.r * 1.2);
    else if (p.shape === 'ring') { g.strokeStyle = p.c; g.lineWidth = 1.3; g.beginPath(); g.arc(p.x, p.y, p.r * 1.1, 0, Math.PI * 2); g.stroke(); }
    else if (p.shape === 'square') g.fillRect(p.x - p.r * .7, p.y - p.r * .7, p.r * 1.4, p.r * 1.4);
    else if (p.shape === 'bolt') { g.strokeStyle = p.c; g.lineWidth = 1.4; g.beginPath(); g.moveTo(p.x - 2, p.y - p.r * 1.4); g.lineTo(p.x + 1.5, p.y - 1); g.lineTo(p.x - 1.5, p.y + 1); g.lineTo(p.x + 2, p.y + p.r * 1.4); g.stroke(); }
    else if (p.shape === 'feather') { g.save(); g.translate(p.x, p.y); g.rotate(p.x * .05); g.beginPath(); g.ellipse(0, 0, p.r * 1.5, p.r * .55, 0, 0, Math.PI * 2); g.fill(); g.restore(); }
    else if (p.shape === 'coin') { g.beginPath(); g.ellipse(p.x, p.y, p.r * .9 * Math.abs(Math.cos(p.x * .1)) + .6, p.r * .9, 0, 0, Math.PI * 2); g.fill(); }
    else { g.beginPath(); g.arc(p.x, p.y, p.r, 0, Math.PI * 2); g.fill(); }
    g.globalAlpha = 1;
  }
  function starShape(g, x, y, r) {
    g.beginPath();
    for (let k = 0; k < 10; k++) { const a = -Math.PI / 2 + k * Math.PI / 5, rr2 = k % 2 ? r * .45 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
    g.closePath(); g.fill();
  }
  const pickCol = cols => { const c = cols[Math.floor(Math.random() * cols.length)]; return c === 'rainbow' ? `hsl(${Math.random() * 360},90%,65%)` : c; };
  function trailStyle(trailId, sk) {
    const ex = trailId && trailId.startsWith('x_') ? GEAR.find(g => g.id === trailId) : null;
    if (ex) return { shape:ex.shape, c:() => pickCol(ex.colors), r:() => 2.2 + Math.random() * 2, up:ex.shape === 'feather' || ex.shape === 'ring' };
    switch (trailId) {
      case 'sparkle': return { shape:'diamond', c:() => '#ffffff', r:() => 2.5 + Math.random() * 2 };
      case 'hearts':  return { shape:'heart', c:() => ['#ff6fa8', '#ff9ec4'][Math.floor(Math.random() * 2)], r:() => 3 + Math.random() * 2, up:true };
      case 'fire':    return { shape:'dot', c:() => ['#ffcf3a', '#ff7a1f', '#ff3b1f'][Math.floor(Math.random() * 3)], r:() => 2.5 + Math.random() * 2.5, up:true };
      case 'smoke':   return { shape:'dot', c:() => 'rgba(185,182,200,0.7)', r:() => 3.5 + Math.random() * 3, grow:10 };
      default:        return { shape:'dot', c:() => sk.trail === 'rainbow' ? `hsl(${Math.random() * 360},90%,65%)` : sk.trail, r:() => 1.5 + Math.random() * 2 };
    }
  }

  function drawBg(g, th, w, dist, t) {
    const gr = g.createLinearGradient(0, 0, 0, H);
    gr.addColorStop(0, th.top); gr.addColorStop(1, th.bot);
    g.fillStyle = gr; g.fillRect(0, 0, w, H);
    g.fillStyle = th.far;
    const off = dist * 0.2;
    for (let b = -wrap(off, 40) - 40; b < w + 40; b += 40) {
      const idx = Math.round((b + off) / 40);
      const h1 = 30 + rnd(idx) * 90, h2 = 20 + rnd(idx + 500) * 70;
      g.beginPath(); g.moveTo(b, 0); g.lineTo(b + 30, 0); g.lineTo(b + 15, h1); g.closePath(); g.fill();
      g.beginPath(); g.moveTo(b + 20, FLOOR); g.lineTo(b + 54, FLOOR); g.lineTo(b + 37, FLOOR - h2); g.closePath(); g.fill();
    }
    const N = Math.round((lowFx ? 14 : 28) * w / W);
    for (let i = 0; i < N; i++) {
      const px = rnd(i * 7.1 + 1) * w, py = rnd(i * 3.3 + 2) * FLOOR, s = .5 + rnd(i * 1.7 + 3), ph = rnd(i * 9.9 + 4) * 6;
      let x, y, r, a;
      switch (th.fx) {
        case 'embers':
          x = wrap(px - dist * .3 + Math.sin(t * 1.3 + ph) * 12, w); y = FLOOR - wrap(py + t * 45 * s, FLOOR);
          r = 1 + s; a = Math.min(1, y / FLOOR + .1); g.fillStyle = th.glow; break;
        case 'snow':
          x = wrap(px - dist * .4 + Math.sin(t + ph) * 14, w); y = wrap(py + t * 35 * s, FLOOR);
          r = 1 + s; a = .75; g.fillStyle = '#ffffff'; break;
        case 'spores':
          x = wrap(px - dist * .25 + Math.sin(t * .7 + ph) * 20, w); y = py + Math.cos(t * .8 + ph) * 16;
          r = 1.5 + s * 1.5; a = .3 + .3 * Math.sin(t * 2 + ph); g.fillStyle = th.glow; break;
        case 'bubbles':
          x = wrap(px - dist * .3 + Math.sin(t * 2 + ph) * 6, w); y = FLOOR - wrap(py + t * 30 * s, FLOOR);
          g.globalAlpha = .5; g.strokeStyle = th.glow; g.lineWidth = 1;
          g.beginPath(); g.arc(x, y, 2 + s * 3, 0, Math.PI * 2); g.stroke(); g.globalAlpha = 1; continue;
        default:
          x = wrap(px - dist * .35, w); y = py + Math.sin(t + ph) * 4;
          r = .4 + s * 1.1; a = .25 + .25 * Math.sin(t * 2 + ph); g.fillStyle = th.glow;
      }
      g.globalAlpha = Math.max(0, a); g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
    }
    g.globalAlpha = 1;
  }

  function rockColumn(g, th, x, w, y1, y2, down, seed) {
    g.fillStyle = th.rock; g.beginPath();
    const n = 6;
    if (down) {
      g.moveTo(x, y1);
      for (let i = 0; i <= n; i++) g.lineTo(x + (rnd(seed + i) - .5) * 6, y1 + (y2 - y1) * i / n);
      g.lineTo(x + w * .2, y2 + 10); g.lineTo(x + w * .5, y2 + 22); g.lineTo(x + w * .8, y2 + 10);
      for (let i = n; i >= 0; i--) g.lineTo(x + w + (rnd(seed + i + 50) - .5) * 6, y1 + (y2 - y1) * i / n);
    } else {
      g.moveTo(x, y2);
      for (let i = 0; i <= n; i++) g.lineTo(x + (rnd(seed + i + 9) - .5) * 6, y2 - (y2 - y1) * i / n);
      g.lineTo(x + w * .2, y1 - 10); g.lineTo(x + w * .5, y1 - 22); g.lineTo(x + w * .8, y1 - 10);
      for (let i = n; i >= 0; i--) g.lineTo(x + w + (rnd(seed + i + 70) - .5) * 6, y2 - (y2 - y1) * i / n);
    }
    g.closePath(); g.fill();
    const top = Math.min(y1, y2), hh = Math.abs(y2 - y1);
    g.fillStyle = th.hi; g.fillRect(x + 6, top, 6, hh);
    g.fillStyle = th.lo; g.fillRect(x + w - 14, top, 10, hh);
    const ty = down ? y2 - 18 : y1 + 18;
    g.fillStyle = th.glow; g.shadowColor = th.glow; g.shadowBlur = 10;
    diamond(g, x + w * .35, ty, 4); diamond(g, x + w * .65, ty + (down ? -14 : 14), 3);
    g.shadowBlur = 0;
  }
  function drawPillar(g, th, p) {
    rockColumn(g, th, p.x, p.w, 0, p.top - 22, true, p.seed);
    rockColumn(g, th, p.x, p.w, p.bot + 22, FLOOR, false, p.seed + 3);
  }
  function drawFloor(g, th, w, dist, t) {
    if (th.lava) {
      const gr = g.createLinearGradient(0, FLOOR, 0, H);
      gr.addColorStop(0, '#ff9a3c'); gr.addColorStop(.3, '#e2461a'); gr.addColorStop(1, '#5a1206');
      g.fillStyle = gr; g.fillRect(0, FLOOR, w, H - FLOOR);
      g.fillStyle = '#ffd36b'; g.shadowColor = '#ff7a2e'; g.shadowBlur = 14;
      g.beginPath(); g.moveTo(0, FLOOR + 4);
      for (let x = 0; x <= w; x += 8) g.lineTo(x, FLOOR + 2 + Math.sin((x + dist) * .06 + t * 3) * 2.5);
      g.lineTo(w, FLOOR + 6); g.lineTo(0, FLOOR + 6); g.closePath(); g.fill(); g.shadowBlur = 0;
      return;
    }
    g.fillStyle = th.lo; g.fillRect(0, FLOOR, w, H - FLOOR);
    g.fillStyle = th.rock;
    for (let x = -wrap(dist, 24); x < w + 24; x += 24) { g.beginPath(); g.moveTo(x, FLOOR); g.lineTo(x + 12, FLOOR - 7); g.lineTo(x + 24, FLOOR); g.closePath(); g.fill(); }
    g.fillStyle = th.hi; g.fillRect(0, FLOOR, w, 3);
  }

  function drawBat(g, x, y, rot, sk, t, speed, dead, o = {}) {
    const gear = o.gear || save.gear;
    g.save(); g.translate(x, y); g.rotate(rot);
    const w = Math.sin(t * speed);
    if (!o.noHalo) {
      const hc = sk.trail === 'rainbow' ? `hsla(${(t * 120) % 360},90%,65%,0.24)` : hexA(sk.trail, .24);
      const halo = g.createRadialGradient(0, 0, 4, 0, 0, 40);
      halo.addColorStop(0, hc); halo.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = halo; g.beginPath(); g.arc(0, 0, 40, 0, Math.PI * 2); g.fill();
    }
    if (sk.rays) { g.strokeStyle = 'rgba(255,207,58,.7)'; g.lineWidth = 2; for (let k = 0; k < 10; k++) { const a = t * .8 + k * .628; g.beginPath(); g.moveTo(Math.cos(a) * 15, Math.sin(a) * 15); g.lineTo(Math.cos(a) * 23, Math.sin(a) * 23); g.stroke(); } }
    if (sk.eclipse) { g.strokeStyle = '#ff4a1c'; g.lineWidth = 3; g.shadowColor = '#ff4a1c'; g.shadowBlur = 14; g.beginPath(); g.arc(0, -2, 21 + Math.sin(t * 3), 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0; }
    if (gear.back) {
      const wave = Math.sin(t * 6) * 2;
      g.fillStyle = gear.back === 'royal' ? '#5b2a9e' : '#c8283a';
      g.beginPath(); g.moveTo(-9, -5); g.lineTo(9, -5); g.lineTo(14 + wave, 21); g.quadraticCurveTo(0, 26 + wave, -14 + wave, 21); g.closePath(); g.fill();
      if (gear.back === 'royal') {
        g.strokeStyle = '#f4f0ff'; g.lineWidth = 3;
        g.beginPath(); g.moveTo(14 + wave, 21); g.quadraticCurveTo(0, 26 + wave, -14 + wave, 21); g.stroke();
        g.fillStyle = '#ffcc33'; g.beginPath(); g.arc(0, -4, 2.5, 0, Math.PI * 2); g.fill();
      }
    }
    for (const dir of [-1, 1]) {
      g.beginPath();
      g.moveTo(0, -2); g.lineTo(dir * 14, -8 - w * 12); g.lineTo(dir * 26, -4 - w * 16);
      g.lineTo(dir * 22, 4 - w * 6); g.lineTo(dir * 16, 1 - w * 4); g.lineTo(dir * 11, 6 - w * 3); g.lineTo(0, 5);
      g.closePath();
      g.fillStyle = sk.prism ? `hsl(${(t * 140 + dir * 70 + 360) % 360},85%,58%)` : sk.nebula ? `hsl(${(t * 50 + dir * 40 + 280) % 360},70%,68%)` : sk.wing;
      g.fill();
      if (sk.neon) { g.strokeStyle = '#39f3ff'; g.lineWidth = 1.6; g.shadowColor = '#39f3ff'; g.shadowBlur = 8; g.stroke(); g.shadowBlur = 0; }
      if (sk.vamp) { g.strokeStyle = '#b0102a'; g.lineWidth = 1.3; g.stroke(); }
      if (sk.fins) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = .9; g.stroke(); }
      if (sk.plates) { g.strokeStyle = '#9ca3af'; g.lineWidth = 1.2; g.stroke(); }
      if (sk.angel) { g.strokeStyle = '#e8b62c'; g.lineWidth = 1; g.stroke(); g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(dir * 25, -3 - w * 15, 3, 1.6, dir * .5, 0, Math.PI * 2); g.ellipse(dir * 21, 4 - w * 6, 2.6, 1.4, dir * .3, 0, Math.PI * 2); g.fill(); }
      if (sk.bones) { g.strokeStyle = '#8a8474'; g.lineWidth = 1; g.beginPath(); g.moveTo(0, -1); g.lineTo(dir * 26, -4 - w * 16); g.moveTo(dir * 5, 1); g.lineTo(dir * 22, 4 - w * 6); g.stroke(); }
      if (sk.nebula) { g.fillStyle = '#ffffff'; g.beginPath(); g.arc(dir * 15, -4 - w * 9, .9, 0, Math.PI * 2); g.arc(dir * 20, -w * 8, .7, 0, Math.PI * 2); g.fill(); }
      if (sk.bolt && Math.sin(t * 7 + dir) > .4) { g.strokeStyle = '#8fe3ff'; g.lineWidth = 1.4; g.beginPath(); g.moveTo(dir * 24, -12 - w * 14); g.lineTo(dir * 20, -7 - w * 14); g.lineTo(dir * 23, -5 - w * 14); g.lineTo(dir * 18, 1 - w * 14); g.stroke(); }
      if (sk.drake) { g.strokeStyle = '#ff7a2e'; g.lineWidth = 1.4; g.shadowColor = '#ff7a2e'; g.shadowBlur = 6; g.stroke(); g.shadowBlur = 0; }
    }
    if (sk.shine) {
      const gg = g.createLinearGradient(-10, -12, 10, 12);
      gg.addColorStop(0, '#fff3b0'); gg.addColorStop(.5, '#e8b62c'); gg.addColorStop(1, '#8a5a0c');
      g.fillStyle = gg;
    } else g.fillStyle = sk.body;
    g.beginPath(); g.ellipse(0, 0, 11, 13, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.moveTo(-8, -8); g.lineTo(-6, -19); g.lineTo(-2, -10); g.closePath(); g.fill();
    g.beginPath(); g.moveTo(8, -8); g.lineTo(6, -19); g.lineTo(2, -10); g.closePath(); g.fill();
    if (sk.neon) {
      g.strokeStyle = '#ff4fd8'; g.lineWidth = 1.6; g.shadowColor = '#ff4fd8'; g.shadowBlur = 8;
      g.beginPath(); g.ellipse(0, 0, 11, 13, 0, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0;
    }
    if (sk.plates) { g.fillStyle = '#d1d5db'; for (const [px, py] of [[-6, -2], [6, -2], [-5, 6], [5, 6]]) { g.beginPath(); g.arc(px, py, .9, 0, Math.PI * 2); g.fill(); } }
    if (sk.fins) { g.fillStyle = '#ff7f6e'; for (const [px, py] of [[-5, 5], [4, 7], [0, 9]]) { g.beginPath(); g.arc(px, py, 1.2, 0, Math.PI * 2); g.fill(); } }
    if (sk.voidRing) { g.fillStyle = '#c46bff'; g.shadowColor = '#c46bff'; g.shadowBlur = 8; for (let k = 0; k < 3; k++) { const a = t * 2 + k * 2.09; g.beginPath(); g.arc(Math.cos(a) * 20, Math.sin(a) * 9, 1.8, 0, Math.PI * 2); g.fill(); } g.shadowBlur = 0; }
    if (sk.drake) {
      g.fillStyle = '#4a403a';
      for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 4, -11); g.quadraticCurveTo(d * 12, -18, d * 7, -27); g.quadraticCurveTo(d * 8, -18, d * 1, -12); g.closePath(); g.fill(); }
    }
    if (sk.shine) { g.fillStyle = 'rgba(255,255,255,.8)'; diamond(g, 12 + Math.sin(t * 3) * 2, -14, 1.6 + Math.abs(Math.sin(t * 4)) * 1.2); }
    const wear = typeof o.wear === 'number' ? o.wear : batWear();
    if (wear > .65) { g.fillStyle = 'rgba(170,170,185,.3)'; g.beginPath(); g.ellipse(0, 0, 11, 13, 0, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = sk.eye; g.strokeStyle = sk.eye; g.shadowColor = sk.eye; g.shadowBlur = 8; g.lineWidth = 1.6;
    const mood = o.mood !== undefined ? o.mood : (wear > .75 ? 'sad' : null);
    if (dead) {
      for (const ex of [-4, 4]) { g.beginPath(); g.moveTo(ex - 2, -5); g.lineTo(ex + 2, -1); g.moveTo(ex + 2, -5); g.lineTo(ex - 2, -1); g.stroke(); }
    } else if (mood === 'sleep') {
      for (const ex of [-4, 4]) { g.beginPath(); g.arc(ex, -4, 2.4, .15 * Math.PI, .85 * Math.PI); g.stroke(); }
    } else if (mood === 'happy') {
      for (const ex of [-4, 4]) { g.beginPath(); g.arc(ex, -2, 2.4, 1.15 * Math.PI, 1.85 * Math.PI); g.stroke(); }
    } else {
      const er = mood === 'sad' ? 1.8 : 2.4;
      g.beginPath(); g.arc(-4, -3, er, 0, Math.PI * 2); g.arc(4, -3, er, 0, Math.PI * 2); g.fill();
      if (mood === 'sad') { g.beginPath(); g.moveTo(-7.5, -6); g.lineTo(-2, -8.5); g.moveTo(7.5, -6); g.lineTo(2, -8.5); g.stroke(); }
    }
    g.shadowBlur = 0;
    if (!sk.ghost && mood !== 'sleep') {
      const fl = sk.vamp ? 10 : 8;
      g.fillStyle = '#f2e9ff';
      g.beginPath(); g.moveTo(-3, 4); g.lineTo(-1.5, fl); g.lineTo(0, 4); g.moveTo(0, 4); g.lineTo(1.5, fl); g.lineTo(3, 4); g.fill();
    }
    if (wear > .25 && !dead) {
      g.strokeStyle = 'rgba(255,95,115,.9)'; g.lineWidth = 1.1;
      g.beginPath(); g.moveTo(3, 3); g.lineTo(8, 8); g.moveTo(5.5, 1.5); g.lineTo(9.5, 5.5); g.stroke();
    }
    const bandage = (x, y, r) => { g.save(); g.translate(x, y); g.rotate(r); g.fillStyle = '#f1dcc0'; rr(g, -5.5, -1.9, 11, 3.8, 1.2); g.fill(); g.fillStyle = 'rgba(160,115,80,.7)'; g.fillRect(-1.6, -1.9, 3.2, 3.8); g.restore(); };
    if (wear > .45) bandage(-5.5, -9.5, -.55);
    if (wear > .65) bandage(3, 8, .45);
    const exH = GEAR.find(x => x.id === gear.hat && x.kind), exF = GEAR.find(x => x.id === gear.face && x.kind);
    if (exF) drawHead(g, exF, t);
    if (exH) drawHead(g, exH, t);
    if (gear.face === 'shades') {
      g.fillStyle = '#0d0d12'; rr(g, -8.5, -6, 7.5, 5, 1.5); g.fill(); rr(g, 1, -6, 7.5, 5, 1.5); g.fill(); g.fillRect(-1.5, -5, 3, 1.2);
      g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(-7, -5, 2, 1); g.fillRect(2.5, -5, 2, 1);
    } else if (gear.face === 'nerd') {
      g.strokeStyle = '#2a2320'; g.lineWidth = 1.3;
      g.beginPath(); g.arc(-4, -3, 3.7, 0, Math.PI * 2); g.stroke(); g.beginPath(); g.arc(4, -3, 3.7, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(-.4, -3.5); g.lineTo(.4, -3.5); g.stroke();
    } else if (gear.face === 'monocle') {
      g.strokeStyle = '#ffcc33'; g.lineWidth = 1.2;
      g.beginPath(); g.arc(4, -3, 3.8, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(7.6, -1.5); g.quadraticCurveTo(10.5, 5, 6, 9.5); g.stroke();
    }
    if (gear.hat === 'tophat') {
      g.fillStyle = '#15121c'; g.fillRect(-10, -17, 20, 3); g.fillRect(-6.5, -31, 13, 14.5);
      g.fillStyle = '#c8283a'; g.fillRect(-6.5, -20.5, 13, 3);
    } else if (gear.hat === 'party') {
      g.fillStyle = '#ff5ca8'; g.beginPath(); g.moveTo(-7, -15); g.lineTo(7, -15); g.lineTo(0, -33); g.closePath(); g.fill();
      g.strokeStyle = '#ffe14d'; g.lineWidth = 1.5;
      for (const yy of [-19, -24, -28]) { const hw = 7 * ((yy + 33) / 18); g.beginPath(); g.moveTo(-hw, yy); g.lineTo(hw, yy); g.stroke(); }
      g.fillStyle = '#ffffff'; g.beginPath(); g.arc(0, -34, 2.6, 0, Math.PI * 2); g.fill();
    } else if (gear.hat === 'crown') {
      g.fillStyle = '#ffcc33'; g.shadowColor = '#ffcc33'; g.shadowBlur = 6;
      g.beginPath(); g.moveTo(-9, -15); g.lineTo(-9, -25); g.lineTo(-4.5, -19); g.lineTo(0, -28); g.lineTo(4.5, -19); g.lineTo(9, -25); g.lineTo(9, -15); g.closePath(); g.fill();
      g.shadowBlur = 0; g.fillStyle = '#e0314b'; g.beginPath(); g.arc(0, -18.5, 1.9, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#4fd6ff'; g.beginPath(); g.arc(-5.5, -17.5, 1.2, 0, Math.PI * 2); g.arc(5.5, -17.5, 1.2, 0, Math.PI * 2); g.fill();
    } else if (gear.hat === 'witch') {
      g.fillStyle = '#3b1f5c'; g.beginPath(); g.ellipse(0, -15.5, 14, 3, 0, 0, Math.PI * 2); g.fill();
      g.beginPath(); g.moveTo(-7, -16); g.lineTo(7, -16); g.quadraticCurveTo(3, -26, 11, -36); g.quadraticCurveTo(-1, -29, -7, -16); g.closePath(); g.fill();
      g.fillStyle = '#8ce36b'; g.fillRect(-6.5, -19.5, 13, 2.4);
    }
    if (o.shield) {
      g.fillStyle = 'rgba(111,200,255,.13)'; g.strokeStyle = 'rgba(111,200,255,.85)'; g.lineWidth = 2;
      g.beginPath(); g.arc(0, 0, 27 + Math.sin(t * 6), 0, Math.PI * 2); g.fill(); g.stroke();
    }
    g.restore();
  }

  function drawHead(g, it, t) {
    const c1 = it.c1 === 'rainbow' ? `hsl(${(t * 100) % 360},85%,65%)` : it.c1, c2 = it.c2;
    g.fillStyle = c1; g.strokeStyle = c1;
    switch (it.kind) {
      case 'hood': g.beginPath(); g.moveTo(-11.5, -1); g.quadraticCurveTo(-13, -23, 0, -25); g.quadraticCurveTo(13, -23, 11.5, -1); g.lineTo(8.5, -3); g.quadraticCurveTo(0, -16, -8.5, -3); g.closePath(); g.fill(); g.strokeStyle = c2; g.lineWidth = 1; g.stroke(); break;
      case 'flamecrown': for (const k of [-6, -2, 2, 6]) { const hgt = 22 + (Math.abs(k) === 2 ? 4 : 0) + Math.sin(t * 10 + k) * 2; g.fillStyle = c1; g.beginPath(); g.moveTo(k - 3, -13); g.quadraticCurveTo(k - 2, -hgt + 4, k, -hgt); g.quadraticCurveTo(k + 2, -hgt + 4, k + 3, -13); g.fill(); g.fillStyle = c2; g.beginPath(); g.moveTo(k - 1.5, -13); g.lineTo(k, -hgt + 6); g.lineTo(k + 1.5, -13); g.fill(); } break;
      case 'icecrown': g.fillRect(-9, -16, 18, 3); g.strokeStyle = c2; g.lineWidth = .8; [[-7, 6], [-3.5, 9], [0, 13], [3.5, 9], [7, 6]].forEach(([x, h]) => { g.beginPath(); g.moveTo(x - 1.8, -15.5); g.lineTo(x, -15.5 - h); g.lineTo(x + 1.8, -15.5); g.closePath(); g.fill(); g.stroke(); }); break;
      case 'wisp': g.fillStyle = hexA(c1, .75); g.beginPath(); g.moveTo(-7, -13); g.bezierCurveTo(-8, -24, 4 + Math.sin(t * 5) * 3, -26, 2 + Math.sin(t * 4) * 4, -34); g.bezierCurveTo(9, -26, 9, -18, 7, -13); g.closePath(); g.fill(); g.fillStyle = c2; g.beginPath(); g.arc(-1.5, -20, 1, 0, Math.PI * 2); g.arc(2.5, -20, 1, 0, Math.PI * 2); g.fill(); break;
      case 'laurel': for (const d of [-1, 1]) for (let k = 0; k < 5; k++) { const a = Math.PI * (d < 0 ? 1.05 + k * .09 : 1.95 - k * .09); g.save(); g.translate(Math.cos(a) * 11, -9 + Math.sin(a) * 11); g.rotate(a + Math.PI / 2); g.beginPath(); g.ellipse(0, 0, 3, 1.4, 0, 0, Math.PI * 2); g.fill(); g.restore(); } break;
      case 'visor': g.fillStyle = hexA(c1, .85); g.shadowColor = c1; g.shadowBlur = 8; rr(g, -10.5, -6.5, 21, 5.5, 2.6); g.fill(); g.shadowBlur = 0; g.fillStyle = c2; g.fillRect(-9 + ((t * 20) % 16), -5.2, 2, 3); break;
      case 'crystal': g.shadowColor = c1; g.shadowBlur = 10; diamond(g, 0, -25, 5); g.shadowBlur = 0; g.fillStyle = c2; diamond(g, -6, -18, 1.8); diamond(g, 6, -18, 1.8); break;
      case 'tiara': g.lineWidth = 2; g.beginPath(); g.arc(0, -5, 11, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke(); g.fillStyle = c2; g.shadowColor = c2; g.shadowBlur = 6; diamond(g, 0, -18.5, 2.6); g.shadowBlur = 0; break;
      case 'helm': g.beginPath(); g.arc(0, -11, 10, Math.PI, 0); g.fill(); g.fillStyle = c2; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 7, -15); g.quadraticCurveTo(d * 15, -20, d * 13, -29); g.quadraticCurveTo(d * 11, -20, d * 4, -17); g.fill(); } g.fillRect(-1, -21, 2, 9); break;
      case 'mohawk': g.shadowColor = c1; g.shadowBlur = 6; for (let k = 0; k < 5; k++) { const x = -5 + k * 2.5, h = 10 + (k === 2 ? 5 : k % 2 ? 3 : 0); g.beginPath(); g.moveTo(x - 1.4, -13); g.lineTo(x + .6, -13 - h); g.lineTo(x + 1.6, -13); g.fill(); } g.shadowBlur = 0; break;
      case 'bow': g.beginPath(); g.moveTo(6, -15); g.lineTo(0, -20); g.lineTo(0, -10); g.closePath(); g.moveTo(6, -15); g.lineTo(12, -20); g.lineTo(12, -10); g.closePath(); g.fill(); g.fillStyle = c2; g.beginPath(); g.arc(6, -15, 1.8, 0, Math.PI * 2); g.fill(); break;
      case 'skull': g.beginPath(); g.arc(0, -13, 8.5, Math.PI, 0); g.fill(); g.fillStyle = c2; g.beginPath(); g.arc(-3, -16, 1.5, 0, Math.PI * 2); g.arc(3, -16, 1.5, 0, Math.PI * 2); g.fill(); g.fillRect(-.6, -14.5, 1.2, 2); break;
      case 'rays': g.lineWidth = 1.8; g.beginPath(); g.arc(0, -17, 7, 0, Math.PI * 2); g.stroke(); for (let k = 0; k < 8; k++) { const a = t * .6 + k * .785; g.beginPath(); g.moveTo(Math.cos(a) * 9, -17 + Math.sin(a) * 9); g.lineTo(Math.cos(a) * 14, -17 + Math.sin(a) * 14); g.stroke(); } break;
      case 'horns': g.shadowColor = c2; g.shadowBlur = 8; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 5, -11); g.quadraticCurveTo(d * 17, -16, d * 13, -31); g.quadraticCurveTo(d * 10, -18, d * 1, -13); g.closePath(); g.fill(); } g.shadowBlur = 0; break;
      case 'startiara': g.lineWidth = 1.8; g.beginPath(); g.arc(0, -5, 11, 1.2 * Math.PI, 1.8 * Math.PI); g.stroke(); g.fillStyle = c2; starShape(g, -6, -18, 2.6); starShape(g, 0, -22, 3.4); starShape(g, 6, -18, 2.6); break;
      case 'ironhelm': rr(g, -10.5, -23, 21, 13, 4); g.fill(); g.fillStyle = c2; g.fillRect(-7.5, -16, 15, 2.2); g.fillStyle = '#d1d5db'; g.beginPath(); g.arc(-8, -20, .9, 0, Math.PI * 2); g.arc(8, -20, .9, 0, Math.PI * 2); g.fill(); break;
      case 'halo': g.lineWidth = 2.4; g.shadowColor = c1; g.shadowBlur = 12; g.beginPath(); g.ellipse(0, -27 + Math.sin(t * 2) * 1.2, 9, 3, 0, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0; break;
      case 'corona': g.shadowColor = c1; g.shadowBlur = 12; g.lineWidth = 2; g.beginPath(); g.arc(0, -25, 8, 0, Math.PI * 2); g.stroke(); g.shadowBlur = 0; g.fillStyle = '#0b0b0b'; g.beginPath(); g.arc(0, -25, 6, 0, Math.PI * 2); g.fill(); g.strokeStyle = c2; g.lineWidth = 1; for (let k = 0; k < 8; k++) { const a = t + k * .785; g.beginPath(); g.moveTo(Math.cos(a) * 9, -25 + Math.sin(a) * 9); g.lineTo(Math.cos(a) * 12, -25 + Math.sin(a) * 12); g.stroke(); } break;
    }
  }
  function txt(str, x, y, size, color, alpha = 1, stroke = '#0b0a1c') {
    ctx.globalAlpha = alpha; ctx.font = `${size}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(3, size / 7); ctx.strokeStyle = stroke; ctx.lineJoin = 'round';
    ctx.strokeText(str, x, y); ctx.fillStyle = color; ctx.fillText(str, x, y); ctx.globalAlpha = 1;
  }
  const POW = { shield:{ c:'#6fc8ff', name:'Shield' }, magnet:{ c:'#ff5c6c', name:'Magnet' }, slow:{ c:'#c08cff', name:'Slow-mo' },
    double:{ c:'#ffcf5c', name:'Double crystals', lvl:5 }, ghost:{ c:'#e6f0ff', name:'Ghost', lvl:8 }, mini:{ c:'#7dffb0', name:'Tiny bat', lvl:11 } };
  function drawPowIcon(g, kind) {
    const c = POW[kind].c;
    g.fillStyle = c; g.strokeStyle = c; g.lineWidth = 2.6;
    if (kind === 'double') { g.font = `11px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('×2', 0, 1); return; }
    if (kind === 'ghost') { g.globalAlpha = .85; g.beginPath(); g.arc(0, -2, 5.5, Math.PI, 0); g.lineTo(5.5, 6); g.lineTo(3, 4); g.lineTo(0, 6); g.lineTo(-3, 4); g.lineTo(-5.5, 6); g.closePath(); g.fill(); g.globalAlpha = 1; g.fillStyle = '#1a2266'; g.beginPath(); g.arc(-2, -2, 1.2, 0, Math.PI * 2); g.arc(2, -2, 1.2, 0, Math.PI * 2); g.fill(); return; }
    if (kind === 'mini') { g.beginPath(); g.arc(0, 0, 3, 0, Math.PI * 2); g.fill(); g.lineWidth = 1.4; for (const d of [-1, 1]) { g.beginPath(); g.moveTo(d * 4, -4); g.lineTo(d * 7, -7); g.moveTo(d * 4, 4); g.lineTo(d * 7, 7); g.stroke(); } return; }
    if (kind === 'shield') { g.beginPath(); g.moveTo(0, -7); g.lineTo(6, -4); g.quadraticCurveTo(6, 4, 0, 8); g.quadraticCurveTo(-6, 4, -6, -4); g.closePath(); g.fill(); }
    else if (kind === 'magnet') {
      g.beginPath(); g.moveTo(-5, -6); g.lineTo(-5, -1); g.arc(0, -1, 5, Math.PI, 0, true); g.lineTo(5, -6); g.stroke();
      g.fillStyle = '#ffffff'; g.fillRect(-6.3, -8, 2.6, 2.4); g.fillRect(3.7, -8, 2.6, 2.4);
    } else { g.beginPath(); g.moveTo(-5, -7); g.lineTo(5, -7); g.lineTo(-5, 7); g.lineTo(5, 7); g.closePath(); g.fill(); }
  }
  function drawPower(g, p, t) {
    const y = p.y + Math.sin(t * 4 + p.ph) * 4, c = POW[p.kind].c;
    g.save(); g.translate(p.x, y);
    g.fillStyle = hexA(c, .2); g.strokeStyle = c; g.lineWidth = 2; g.shadowColor = c; g.shadowBlur = 12;
    g.beginPath(); g.arc(0, 0, 13, 0, Math.PI * 2); g.fill(); g.stroke(); g.shadowBlur = 0;
    drawPowIcon(g, p.kind);
    g.restore();
  }

  // ---------- game state ----------
  const GRAV = 1500, FLAP = -430;
  let state = 'menu', paused = false, resumeT = 0;
  let bat, pillars = [], gems = [], powers = [], stones = [], trail = [], floaters = [], banner = null;
  let commitScore = 0, runPXP = 0;
  let score = 0, level = 1, runFlaps = 0, runCoins = 0, runEarned = 0, commitCoins = 0, commitFlaps = 0, runCounted = false, runMedals = 0, commitMedals = 0, medals = [];
  let shield = false, magnetT = 0, magnetMax = 1, slowT = 0, slowMax = 1, invT = 0, revived = false;
  let t = 0, dist = 0, shake = 0, overAt = 0, lastMode = 'flap', cur = null, curId = null, lastEarned = 0, doubleUsed = false;
  const speed = () => Math.min(310, 150 + (level - 1) * 16);
  const spacing = () => Math.max(165, 215 - (level - 1) * 6);
  // Each main-game level needs 3 more points than the one before: 10, 13, 16, 19...
  function levelInfo(sc) { let l = 1, acc = 0, need = 10; while (sc >= acc + need) { acc += need; l++; need += 3; } return { l, into:sc - acc, need }; }
  let guided = false; // first-ever run: slower, wider gaps and on-screen tips
  const gapSize = () => Math.max(112, 172 - (level - 1) * 8 - levelInfo(score).into * .5) + (guided ? 34 : 0);
  const swayAmp = () => level >= 3 ? Math.min(80, (level - 2) * 13) : 0;
  const breathe = () => level >= 5 ? Math.min(24, (level - 4) * 6) : 0;
  const stoneChance = () => level >= 7 ? Math.min(.7, (level - 6) * .15) : 0;
  const LEVEL_NOTES = { 2:'Faster!', 3:'Pillars move', 5:'Gaps breathe', 7:'Falling rocks', 9:'No mercy' };
  const isWeekend = () => [0, 6].includes(new Date().getDay());
  const isVip = () => save.vipUntil > Date.now();
  const coinMult = () => 1 + batBonus(save.bat) / 100 + (isWeekend() ? .5 : 0) + upLvl('value') * .05 + gearBonus('crys') / 100 + (petHappy() ? happyPct() / 100 : 0);

  function newBat() { return { x:100, y:H * .42, vy:0, r:13, rot:0 }; }
  bat = newBat();

  function updateBar() {
    if (state === 'battle') {
      $('#readyBar').classList.add('on');
      $('#barBtn').textContent = B && B.confirmForfeit > 0 ? 'Sure?' : 'Give up';
      return;
    }
    const on = !$$('.screen.on').length && (state === 'ready' || state === 'play' || state === 'mini');
    $('#readyBar').classList.toggle('on', on);
    $('#barBtn').textContent = state === 'ready' ? 'Menu' : 'Pause';
  }
  function show(id) { $$('.screen').forEach(s => s.classList.toggle('on', s.id === id)); updateBar(); }
  function tweenNum(el, to) {
    const from = el.dataset.v === undefined ? to : Number(el.dataset.v);
    el.dataset.v = to; cancelAnimationFrame(el._raf);
    if (from === to || matchMedia('(prefers-reduced-motion: reduce)').matches) { el.textContent = to.toLocaleString(); return; }
    const t0 = performance.now(), d = Math.min(900, 350 + Math.abs(to - from) * 2);
    const step = now => {
      const k = Math.min(1, (now - t0) / d), e = 1 - Math.pow(1 - k, 3);
      el.textContent = Math.round(from + (to - from) * e).toLocaleString();
      if (k < 1) el._raf = requestAnimationFrame(step);
    };
    el._raf = requestAnimationFrame(step);
  }
  function animIn(el) { if (!el) return; el.classList.remove('swap'); void el.offsetWidth; el.classList.add('swap'); }
  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast'); el.textContent = msg; el.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.remove('show'), 1500);
  }
  // Gradually harder: each level needs a bit more than the last, growing faster the higher you go.
  const pNeed = l => Math.round(60 + 40 * (l - 1) + 10 * (l - 1) * (l - 1));
  function playerXP(n) {
    const p = save.player; p.xp += n; let up = false;
    while (p.xp >= pNeed(p.lvl)) {
      p.xp -= pNeed(p.lvl); p.lvl++; up = true; logEvent('level_up', { type:'player', lvl:p.lvl });
      const r = 25 * p.lvl; save.coins += r; save.stats.earned += r;
      toast(`Player level ${p.lvl}! +${r} crystals`); sfx('level'); vib(60);
    }
    if (up) pushScore();
  }

  function clearWorld() { medals = []; pillars = []; gems = []; powers = []; stones = []; trail = []; floaters = []; banner = null; }
  let scorePop = 0, sceneFade = 0, sceneGroup = null;
  const groupOf = st => ({ ready:'flap', play:'flap', over:'flap', mini:'mini', miniover:'mini', battle:'battle', battleover:'battle', home:'home' })[st] || 'menu';
  function startRun() {
    sceneFade = .35;
    guided = !save.tut;
    lastMode = 'flap'; paused = false; resumeT = 0; cur = null;
    state = 'ready'; bat = newBat(); clearWorld();
    score = 0; level = 1; runFlaps = 0; runCoins = 0; runEarned = 0; commitCoins = 0; commitFlaps = 0; runCounted = false; runMedals = 0; commitMedals = 0; commitScore = 0; runPXP = 0;
    shield = upLvl('head') > 0; magnetT = 0; slowT = 0; invT = 0; doubleT = 0; ghostT = 0; miniT = 0; revived = false; shake = 0; doubleUsed = false;
    if (save.pet.sleeping) save.pet.sleeping = false;
    show(null); cv.focus({ preventScroll:true });
  }
  function toMenu() {
    state = 'menu'; paused = false; cur = null; bat = newBat(); clearWorld();
    refreshUI(); menuQueue();
  }

  function pillarGap(p) {
    const g = p.g + (p.br ? Math.sin(t * 2.2 + p.ph) * p.br : 0);
    let cy = p.base + (p.amp ? Math.sin(t * p.freq + p.ph) * p.amp : 0);
    cy = clamp(cy, 70 + g / 2, FLOOR - 60 - g / 2);
    p.top = cy - g / 2; p.bot = cy + g / 2;
  }
  function spawn(x) {
    const g = gapSize(), amp = swayAmp(), min = 90 + g / 2, max = FLOOR - 70 - g / 2;
    const base = min + Math.random() * (max - min);
    const p = { x, w:62, g, base, amp:amp * (.5 + Math.random() * .5), freq:1 + Math.random() * 1.2, ph:Math.random() * 6, br:breathe(), passed:false, seed:Math.random() * 1000 };
    pillarGap(p); pillars.push(p);
    const sp = spacing(), mx = x + p.w + (sp - p.w) / 2, my = clamp(base + (Math.random() - .5) * 60, 110, FLOOR - 110);
    const r = Math.random(), luck = .12 + upLvl('luck') * .02 + gearBonus('luck') / 100;
    if (r < luck) {
      const kinds = ['magnet', 'slow', ...(shield ? [] : ['shield']), ...['double', 'ghost', 'mini'].filter(k => save.player.lvl >= POW[k].lvl)];
      powers.push({ x:mx, y:my, kind:kinds[Math.floor(Math.random() * kinds.length)], ph:Math.random() * 6 });
    } else if (r < luck + GEM_CHANCE) gems.push({ x:mx, y:my, ph:Math.random() * 6 });
    else if (r < luck + GEM_CHANCE + MEDAL_CHANCE) medals.push({ x:mx, y:my, ph:Math.random() * 6 });
    if (Math.random() < stoneChance()) stones.push({ x:x + p.w + (sp - p.w) * (.3 + Math.random() * .4), y:-30, vy:0, armed:false, r:9, spin:Math.random() * 6 });
  }

  function emit(n, px, py) {
    const st = trailStyle(save.gear.trail, skinOf(save.bat));
    for (let i = 0; i < n; i++) {
      trail.push({ x:(px ?? bat.x) - 8, y:(py ?? bat.y) + 4, vx:-60 - Math.random() * 80, vy:st.up ? -20 - Math.random() * 40 : (Math.random() - .3) * 90,
        life:.55, max:.55, c:st.c(), r:st.r(), shape:st.shape, grow:st.grow || 0 });
    }
  }

  function flap() {
    if (state === 'ready') { state = 'play'; updateBar(); spawn(W + 40); }
    if (state === 'play' && resumeT <= 0) { bat.vy = FLAP; runFlaps++; track('flaps', 1); sfx('flap'); emit(5); }
  }

  function hitRect(cx, cy, r, x, y, w, h) {
    const nx = clamp(cx, x, x + w), ny = clamp(cy, y, y + h);
    return (cx - nx) ** 2 + (cy - ny) ** 2 < r * r;
  }

  function hurt() {
    if (state !== 'play' || invT > 0) return;
    if (shield) {
      shield = false; invT = 1.2; shake = .2; sfx('shield'); vib(50);
      bat.vy = FLAP * .7; floaters.push({ x:bat.x + 20, y:bat.y - 30, text:'Shield broke', life:.9 });
      return;
    }
    die();
  }

  function fillOver(title, big, bestLine, stats, note) {
    $('#oTitle').textContent = title; $('#oScore').textContent = big; $('#oBest').textContent = bestLine;
    stats.forEach(([label, val], i) => { $('#oV' + i).textContent = val; $('#oL' + i).textContent = label; });
    $('#oNote').textContent = note || '';
    $('#adDoubleBtn').style.display = lastEarned > 0 && !doubleUsed ? '' : 'none';
    setTimeout(() => {
      if (state !== 'over' && state !== 'miniover' && state !== 'battleover') return;
      save.adCount++;
      if (!save.noAds && !isVip() && save.adCount >= INTERSTITIAL_EVERY && save.games + save.stats.minis > 3) { save.adCount = 0; showAd('interstitial', showOver); }
      else showOver();
    }, 650);
  }

  function commitRun() {
    const earned = Math.round((runCoins - commitCoins) * coinMult());
    commitCoins = runCoins; runEarned += earned;
    save.coins += earned; save.stats.earned += earned;
    save.totalFlaps += runFlaps - commitFlaps; commitFlaps = runFlaps;
    save.medals += runMedals - commitMedals; save.stats.medals += runMedals - commitMedals; commitMedals = runMedals;
    const pxp = (score - commitScore) * 3 + (runCounted ? 0 : 5); commitScore = score; runPXP += pxp;
    addPassXP(Math.min(60, Math.round(pxp * .7)));
    if (!runCounted) { runCounted = true; save.games++; petDrain(3, 2, 2, 0); }
    playerXP(pxp);
    save.best = Math.max(save.best, score); save.bestLevel = Math.max(save.bestLevel, level);
    if (save.wk.week !== weekKey()) save.wk = { week:weekKey(), best:0 };
    save.wk.best = Math.max(save.wk.best, score);
    save.bestRunFlaps = Math.max(save.bestRunFlaps, runFlaps);
    persist(); pushSave(); pushScore(); refreshDots();
  }

  function die() {
    if (state !== 'play') return;
    state = 'over'; overAt = t; shake = .35; sfx('hit'); vib(160); updateBar();
    const prevBest = save.best;
    commitRun();
    $('#againBtn').textContent = 'Fly again';
    const rc = reviveCost(upLvl('revive')), rb = $('#reviveBtn');
    $('#reviveRow').style.display = revived ? 'none' : '';
    rb.innerHTML = 'Revive <i class="gem"></i> ' + rc;
    rb.disabled = false;
    lastEarned = runEarned;
    logEvent('run_end', { score, level, flaps:runFlaps });
    addTokens('run', Math.floor(score / 5) + 1);
    shareText = `I scored ${score} and reached level ${level} in Cave Flap!`;
    fillOver('Crashed', score, score > prevBest && score > 0 ? 'New best score!' : 'Best ' + save.best,
      [['Level', level], ['Flaps', runFlaps], ['Crystals', '+' + runEarned]],
      [`+${runPXP} player XP.`, runMedals ? `+${runMedals} medallion${runMedals > 1 ? 's' : ''}.` : '', petHappy() ? `Happy bat bonus: +${happyPct()}% crystals.` : (petLow() ? `Your bat needs care. A happy bat earns ${happyPct()}% more.` : '')].filter(Boolean).join(' '));
  }

  function revive(free) {
    const rc = free ? 0 : reviveCost(upLvl('revive'));
    if (state !== 'over' || revived) return;
    if (save.coins < rc) return needMore('crystals');
    save.coins -= rc; save.stats.revives++; revived = true; persist(); pushSave();
    const next = pillars.find(p => p.x + p.w > bat.x - bat.r);
    bat.y = next ? (next.top + next.bot) / 2 : H * .42; bat.vy = 0; bat.rot = 0;
    stones = []; invT = 2.4; state = 'play'; resumeT = 1.5; sfx('power'); show(null);
  }

  function pause() {
    if (paused || (state !== 'play' && state !== 'mini')) return;
    paused = true; for (const k in keys) keys[k] = false; show('pause');
  }
  function resume() { if (!paused) return; paused = false; applyOffline(); show(null); if (state === 'play') resumeT = 1.5; }

  let doubleT = 0, ghostT = 0, miniT = 0;
  const POW_TIME = { double:8, ghost:4, mini:8 };
  function activate(kind) {
    if (POW_TIME[kind]) { if (kind === 'double') doubleT = POW_TIME[kind]; if (kind === 'ghost') ghostT = POW_TIME[kind]; if (kind === 'mini') miniT = POW_TIME[kind]; }
    if (kind === 'shield') shield = true;
    if (kind === 'magnet') { magnetMax = magnetT = 5 + upLvl('magnet') + gearBonus('magnet'); }
    if (kind === 'slow') { slowMax = slowT = 4 + upLvl('slow') * .6 + gearBonus('slow'); }
    save.stats.powers++; track('powers', 1); sfx('power'); vib(25);
    floaters.push({ x:bat.x + 30, y:bat.y - 30, text:POW[kind].name, life:.9 });
  }

  function update(dt) {
    if (paused) return;
    t += dt;
    petTick(dt);
    if (shake > 0) shake -= dt;
    if (banner) { banner.life -= dt; if (banner.life <= 0) banner = null; }
    for (const p of trail) { p.life -= dt; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.grow * dt; }
    trail = trail.filter(p => p.life > 0);
    for (const f of floaters) { f.life -= dt; f.y -= 40 * dt; }
    floaters = floaters.filter(f => f.life > 0);
    if (state === 'play' || state === 'mini') save.stats.time += dt;

    if (state === 'home') { homeUpdate(dt); return; }
    if (state === 'mini') { dist += 30 * dt; cur.update(dt); return; }
    if (state === 'battle') { dist += 8 * dt; battleUpdate(dt); return; }
    if (state === 'battleover') return;
    if (state === 'searching') { dist += 30 * dt; matchTick(); }
    if (state === 'miniover') return;

    const sk = skinOf(save.bat);
    if ((sk.shine || sk.prism || sk.ghost || save.gear.trail) && state !== 'over' && Math.random() < dt * 14) emit(1);

    if (state === 'menu' || state === 'ready') {
      if (state === 'menu') { bat.x = W / 2; bat.y = 178 + Math.sin(t * 2.4) * 10; }
      else bat.y = H * .42 + Math.sin(t * 3) * 8;
      bat.rot = 0; dist += 60 * dt; return;
    }
    if (state === 'play' && resumeT > 0) { resumeT -= dt; bat.rot = 0; bat.vy = 0; return; }

    bat.vy += GRAV * dt; bat.y += bat.vy * dt;
    bat.rot = clamp(bat.vy / 600, -.45, 1.2);
    if (bat.y - bat.r < 0) { bat.y = bat.r; bat.vy = 0; }

    if (state === 'play') {
      if (invT > 0) invT -= dt;
      if (doubleT > 0) doubleT -= dt; if (ghostT > 0) ghostT -= dt; if (miniT > 0) miniT -= dt;
      bat.r = miniT > 0 ? 8 : 13;
      if (magnetT > 0) magnetT -= dt;
      if (slowT > 0) slowT -= dt;
      const v = speed() * (slowT > 0 ? .6 : 1) * (guided ? .75 : 1) * dt; dist += v;
      for (const p of pillars) {
        p.x -= v; pillarGap(p);
        if (!p.passed && p.x + p.w < bat.x) {
          p.passed = true; score++; runCoins += doubleT > 0 ? 2 : 1; sfx('score'); scorePop = 1;
          if (guided && score >= 3) { guided = false; save.tut = true; persist(); logEvent('tutorial_done'); toast('Nice! You’ve got it. Now it gets real.'); }
          track('pillars', 1); track('runScore', score);
          const nl = levelInfo(score).l;
          if (nl > level) {
            level = nl; track('level', level);
            banner = { text:'Level ' + level, sub:LEVEL_NOTES[level] || 'Faster, tighter', life:1.8 };
            runCoins += level; floaters.push({ x:W / 2, y:250, text:'+' + level + ' level bonus', life:1.2 });
            sfx('level'); vib(40);
          }
        }
        const i = 5;
        if (ghostT <= 0) if (hitRect(bat.x, bat.y, bat.r, p.x + i, -50, p.w - i * 2, p.top + 50 - i) ||
            hitRect(bat.x, bat.y, bat.r, p.x + i, p.bot + i, p.w - i * 2, FLOOR - p.bot)) hurt();
      }
      for (const gm of gems) {
        gm.x -= v;
        if (magnetT > 0) {
          const dx = bat.x - gm.x, dy = bat.y - gm.y, d = Math.hypot(dx, dy);
          if (d < 170 && d > 1) { gm.x += dx / d * 460 * dt; gm.y += dy / d * 460 * dt; }
        }
        if (!gm.taken && Math.hypot(gm.x - bat.x, gm.y - bat.y) < bat.r + 12) {
          gm.taken = true; runCoins += doubleT > 0 ? 6 : 3; save.stats.gems++; track('gems', 1); sfx('coin'); vib(12);
          floaters.push({ x:gm.x, y:gm.y - 16, text:'+3', life:.7, c:gemCol() });
        }
      }
      gems = gems.filter(g => g.x > -20 && !g.taken);
      for (const md of medals) {
        md.x -= v;
        if (magnetT > 0) {
          const dx = bat.x - md.x, dy = bat.y - md.y, d = Math.hypot(dx, dy);
          if (d < 170 && d > 1) { md.x += dx / d * 460 * dt; md.y += dy / d * 460 * dt; }
        }
        if (!md.taken && Math.hypot(md.x - bat.x, md.y - bat.y) < bat.r + 14) {
          md.taken = true; runMedals++; sfx('medal'); vib([40, 40, 80]);
          floaters.push({ x:W / 2, y:230, text:'Medallion!', life:1.4, size:24, c:'#ffd97a' });
        }
      }
      medals = medals.filter(m => m.x > -20 && !m.taken);
      for (const pw of powers) {
        pw.x -= v;
        if (!pw.taken && Math.hypot(pw.x - bat.x, pw.y - bat.y) < bat.r + 14) { pw.taken = true; activate(pw.kind); }
      }
      powers = powers.filter(p => p.x > -20 && !p.taken);
      for (const s of stones) {
        s.x -= v;
        if (!s.armed && s.x - bat.x < 150) s.armed = true;
        if (s.armed) { s.vy += 900 * dt; s.y += s.vy * dt; s.spin += dt * 5; }
        if (!s.hit && Math.hypot(s.x - bat.x, s.y - bat.y) < bat.r + s.r - 3) { s.hit = true; hurt(); }
      }
      stones = stones.filter(s => s.x > -30 && s.y < FLOOR + 20);
      if (pillars.length && pillars[0].x + pillars[0].w < -10) pillars.shift();
      const last = pillars[pillars.length - 1];
      if (last && last.x < W - spacing() + 40) spawn(last.x + spacing());
    }
    if (bat.y + bat.r >= FLOOR) {
      bat.y = FLOOR - bat.r;
      if (state === 'play' && (shield || invT > 0)) { if (invT <= 0) hurt(); bat.vy = FLAP; }
      else { bat.vy = 0; die(); }
    }
  }

  function drawStone(g, s, th) {
    g.save(); g.translate(s.x, s.y); g.rotate(s.spin);
    g.fillStyle = th.hi; g.beginPath();
    for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, r = s.r * (.8 + rnd(k + 3) * .35); g.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
    g.closePath(); g.fill(); g.fillStyle = th.lo; g.fillRect(-3, -2, 5, 4);
    g.restore();
    if (!s.armed) { g.globalAlpha = .5 + .5 * Math.sin(t * 12); g.fillStyle = th.glow; diamond(g, s.x, 14, 3); g.globalAlpha = 1; }
  }
  function drawTrail(g = ctx) { for (const p of trail) drawParticle(g, p, Math.max(0, p.life / p.max)); }
  function drawFloaters(th) { for (const f of floaters) txt(f.text, f.x, f.y, f.size || 16, f.c || th.glow, Math.min(1, f.life / .5)); }
  function drawBanner(th) {
    if (!banner) return;
    const a = Math.min(1, banner.life / .4);
    txt(banner.text, W / 2, 180, 34, th.glow, a);
    if (banner.sub) txt(banner.sub, W / 2, 214, 14, '#f2e9ff', a);
  }
  function drawPowerHud() {
    let x = W - 24;
    const items = [];
    if (shield) items.push(['shield', 1]);
    if (doubleT > 0) items.push(['double', doubleT / POW_TIME.double]);
    if (ghostT > 0) items.push(['ghost', ghostT / POW_TIME.ghost]);
    if (miniT > 0) items.push(['mini', miniT / POW_TIME.mini]);
    if (magnetT > 0) items.push(['magnet', magnetT / magnetMax]);
    if (slowT > 0) items.push(['slow', slowT / slowMax]);
    for (const [k, f] of items) {
      const c = POW[k].c;
      ctx.save(); ctx.translate(x, 54);
      ctx.fillStyle = 'rgba(11,10,28,.6)'; ctx.beginPath(); ctx.arc(0, 0, 14, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = c; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, 0, 14, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); ctx.stroke();
      ctx.scale(.8, .8); drawPowIcon(ctx, k); ctx.restore();
      x -= 34;
    }
  }

  function draw() {
    const th = caveOf(save.cave), sk = skinOf(save.bat);
    ctx.save();
    if (shake > 0) ctx.translate((Math.random() - .5) * 10 * shake / .35, (Math.random() - .5) * 10 * shake / .35);
    if (state === 'home') { drawHome(th, sk); ctx.restore(); drawFloaters(th); drawBanner(th); return; }
    if (B && (state === 'battle' || state === 'battleover')) { drawBattle(th); ctx.restore(); drawFloaters(th); battleHud(); return; }
    if (cur && (state === 'mini' || state === 'miniover')) {
      cur.draw(th, sk); ctx.restore();
      drawFloaters(th); if (cur.hud) cur.hud(th); return;
    }
    drawBg(ctx, th, W, dist, t);
    for (const p of pillars) drawPillar(ctx, th, p);
    for (const s of stones) drawStone(ctx, s, th);
    for (const gm of gems) {
      const gc = gemCol(); ctx.fillStyle = gc; ctx.shadowColor = gc; ctx.shadowBlur = 14;
      diamond(ctx, gm.x, gm.y + Math.sin(t * 4 + gm.ph) * 4, 6); ctx.shadowBlur = 0;
    }
    for (const pw of powers) drawPower(ctx, pw, t);
    for (const md of medals) drawMedal(ctx, md.x, md.y + Math.sin(t * 3 + md.ph) * 4, 12, t, md.ph);
    drawFloor(ctx, th, W, dist, t);
    drawTrail();
    const fs = state === 'over' ? 0 : (bat.vy < 0 ? 28 : 14);
    if (invT > 0 && state === 'play' && Math.sin(t * 30) > 0) ctx.globalAlpha = .4;
    const mood = state === 'menu' && petLow() ? 'sad' : undefined;
    if (state === 'play' && ghostT > 0) ctx.globalAlpha = .45;
    if (state === 'play' && miniT > 0) { ctx.save(); ctx.translate(bat.x, bat.y); ctx.scale(.62, .62); drawBat(ctx, 0, 0, bat.rot, sk, t, fs, state === 'over', { shield:shield, mood }); ctx.restore(); }
    else drawBat(ctx, bat.x, bat.y, bat.rot, sk, t, fs, state === 'over', { shield:shield && state !== 'menu', mood });
    ctx.globalAlpha = 1;
    ctx.restore();

    drawFloaters(th);
    if (state === 'ready') {
      txt(guided ? 'Tap anywhere to flap' : 'Tap to flap', W / 2, 400, 20, '#f2e9ff', .6 + .4 * Math.sin(t * 4));
      if (guided) {
        const k = (t * 1.2) % 1;
        ctx.strokeStyle = `rgba(255,207,92,${1 - k})`; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, 480, 10 + k * 26, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = '#ffcf5c'; ctx.beginPath(); ctx.arc(W / 2, 480 + Math.sin(t * 6) * 3, 8, 0, Math.PI * 2); ctx.fill();
        txt('Keep your bat in the air and fly through the gaps', W / 2, 525, 11, '#f2e9ff', .8);
      }
      txt('Space or click works too', W / 2, 430, 11, '#f2e9ff', .6);
    }
    if (state === 'play' || state === 'ready') {
      if (state === 'play') txt(String(score), W / 2, 70, 52 * (1 + scorePop * .22), '#f2e9ff');
      txt('Level ' + level, W / 2, state === 'play' ? 112 : 70, 13, th.glow);
      ctx.save(); ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.font = `14px ${FONT}`; ctx.fillStyle = gemCol();
      ctx.fillText('+' + runCoins, W - 14, 24);
      if (runMedals) { ctx.fillStyle = '#e9b75a'; ctx.fillText(runMedals + ' ', W - 34, 82); drawMedal(ctx, W - 22, 82, 7, 0); }
      ctx.restore();
      drawPowerHud();
    }
    drawBanner(th);
    if (state === 'play' && guided) {
      const p = pillars.find(q => !q.passed && q.x + q.w > bat.x);
      if (p && p.x < W - 10) {
        const gy = (p.top + p.bot) / 2, a = .6 + .4 * Math.sin(t * 5);
        txt('Fly through here', Math.min(W - 70, p.x + p.w / 2), gy - 20, 13, '#ffcf5c', a);
        ctx.fillStyle = hexA('#ffcf5c', a); ctx.beginPath(); ctx.moveTo(p.x - 18, gy); ctx.lineTo(p.x - 30, gy - 8); ctx.lineTo(p.x - 30, gy + 8); ctx.closePath(); ctx.fill();
      }
      const gm = gems.find(g => g.x < W - 20 && g.x > bat.x);
      if (gm) txt('Grab crystals!', gm.x, gm.y - 26, 12, gemCol(), .9);
      txt(`${Math.max(0, 3 - score)} more to finish the tutorial`, W / 2, 140, 11, '#f2e9ff', .75);
    }
    if (state === 'play' && resumeT > 0) txt(String(Math.ceil(resumeT / .5)), W / 2, 300, 64, '#f2e9ff');
  }
  // ---------- minigames ----------
  const keys = {};
  const ptr = { x:W / 2, y:H / 2, has:false, down:false };
  function batAt(g, x, y, s, sk, rot = 0, spd = 16, dead = false, o = {}) { g.save(); g.translate(x, y); g.scale(s, s); drawBat(g, 0, 0, rot, sk, t, spd, dead, o); g.restore(); }
  function drawMoth(g, x, y, col, ph) {
    const f = Math.abs(Math.sin(t * 18 + ph));
    g.save(); g.translate(x, y); g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 8;
    for (const d of [-1, 1]) { g.beginPath(); g.ellipse(d * 7, -2, 8 * (.4 + f * .6), 6, d * .5, 0, Math.PI * 2); g.fill(); g.beginPath(); g.ellipse(d * 5, 5, 5 * (.4 + f * .6), 4, -d * .4, 0, Math.PI * 2); g.fill(); }
    g.shadowBlur = 0; g.fillStyle = '#3b2a1a'; g.fillRect(-1.5, -6, 3, 14); g.restore();
  }
  function drawSpider(g, x, y, s) {
    g.save(); g.translate(x, y); g.scale(s, s); g.strokeStyle = '#0a0a0a'; g.lineWidth = 2.2;
    for (const d of [-1, 1]) for (let k = 0; k < 4; k++) {
      const a = -.6 + k * .4; g.beginPath(); g.moveTo(0, 2); g.lineTo(d * 14, a * 14 - 2); g.lineTo(d * 20, a * 18 + 8); g.stroke();
    }
    g.fillStyle = '#16121c'; g.beginPath(); g.ellipse(0, 4, 11, 12, 0, 0, Math.PI * 2); g.fill();
    g.beginPath(); g.arc(0, -8, 7, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#ff3b3b'; g.beginPath(); g.arc(-3, -9, 2, 0, Math.PI * 2); g.arc(3, -9, 2, 0, Math.PI * 2); g.fill();
    g.restore();
  }
  let hudLast = null, hudPop = 0;
  function hudTop(th, left, right) {
    if (left !== hudLast) { if (hudLast !== null) hudPop = 1; hudLast = left; }
    txt(String(left), W / 2, 72, 44 * (1 + hudPop * .22), '#f2e9ff');
    if (right) txt(right, W / 2, 108, 13, th.glow);
  }

  const MINIS = {
    moths: {
      name:'Moth Catch', icon:'🦋', desc:'Slide the bat to snack on moths. Dodge falling rocks.',
      reward:s => s, statLabel:'Moths',
      init() { this.bx = W / 2; this.items = []; this.score = 0; this.lives = 3; this.time = 0; this.spawn = .5; this.hurt = 0; },
      update(dt) {
        this.time += dt; this.hurt -= dt;
        let tx = this.bx;
        if (keys.ArrowLeft || keys.KeyA) tx -= 400; else if (keys.ArrowRight || keys.KeyD) tx += 400; else if (ptr.has) tx = ptr.x;
        this.bx += (Math.max(24, Math.min(W - 24, tx)) - this.bx) * Math.min(1, dt * 12);
        this.spawn -= dt;
        if (this.spawn <= 0) {
          this.spawn = Math.max(.26, .85 - this.time * .012);
          const r = Math.random(), rockP = .25 + Math.min(.25, this.time * .005);
          const kind = r < .06 ? 'gold' : r < .06 + rockP ? 'rock' : 'moth';
          this.items.push({ x:20 + Math.random() * (W - 40), y:-20, vy:130 + this.time * 4 + Math.random() * 70, kind, ph:Math.random() * 6, sway:Math.random() * 30 });
        }
        const by = FLOOR - 44;
        for (const it of this.items) {
          it.y += it.vy * dt;
          const x = it.x + (it.kind !== 'rock' ? Math.sin(t * 3 + it.ph) * it.sway * .3 : 0);
          if (!it.done && Math.abs(x - this.bx) < 30 && Math.abs(it.y - by) < 24) {
            it.done = true;
            if (it.kind === 'rock') { this.lives--; this.hurt = .4; shake = .3; sfx('hit'); vib(80); if (this.lives <= 0) return endMini(this.score); }
            else { const v = it.kind === 'gold' ? 5 : 1; this.score += v; sfx(v > 1 ? 'level' : 'coin'); vib(10); floaters.push({ x, y:by - 30, text:'+' + v, life:.6 }); emit(3, this.bx, by); }
          }
        }
        this.items = this.items.filter(it => !it.done && it.y < FLOOR + 10);
      },
      draw(th, sk) {
        drawBg(ctx, th, W, dist, t);
        for (const it of this.items) {
          const x = it.x + (it.kind !== 'rock' ? Math.sin(t * 3 + it.ph) * it.sway * .3 : 0);
          if (it.kind === 'rock') drawStone(ctx, { x, y:it.y, r:12, spin:t * 3 + it.ph, armed:true }, th);
          else drawMoth(ctx, x, it.y, it.kind === 'gold' ? '#ffd24a' : '#efe2c8', it.ph);
        }
        drawFloor(ctx, th, W, dist, t); drawTrail();
        ctx.globalAlpha = this.hurt > 0 && Math.sin(t * 40) > 0 ? .4 : 1;
        batAt(ctx, this.bx, FLOOR - 44, 1.3, sk, 0, 16);
        ctx.globalAlpha = 1;
      },
      hud(th) { hudTop(th, this.score, 'Lives ' + '◆'.repeat(Math.max(0, this.lives))); },
    },

    echo: {
      name:'Echo Memory', icon:'🔮', desc:'Watch the crystals echo, then repeat the pattern.',
      reward:s => s * 3, statLabel:'Rounds',
      pads:[{ c:'#b07cff', f:330 }, { c:'#ff8a3d', f:392 }, { c:'#4fd6ff', f:494 }, { c:'#6dff9e', f:587 }],
      rect(i) { const s = 138, gap = 16, x0 = (W - s * 2 - gap) / 2, y0 = 250; return { x:x0 + (i % 2) * (s + gap), y:y0 + Math.floor(i / 2) * (s + gap), s }; },
      init() { this.seq = [Math.floor(Math.random() * 4)]; this.phase = 'wait'; this.timer = .9; this.lit = -1; this.litT = 0; this.idx = 0; this.score = 0; },
      light(i, d) { this.lit = i; this.litT = d; if (save.sfx) tone(this.pads[i].f, Math.max(.15, d), 'triangle', .12); },
      update(dt) {
        this.litT -= dt; if (this.litT <= 0) this.lit = -1;
        if (this.phase === 'wait') { this.timer -= dt; if (this.timer <= 0) { this.phase = 'show'; this.idx = 0; this.timer = 0; } }
        else if (this.phase === 'show') {
          this.timer -= dt;
          if (this.timer <= 0) {
            const step = Math.max(.26, .62 - this.seq.length * .03);
            if (this.idx < this.seq.length) { this.light(this.seq[this.idx], step * .65); this.idx++; this.timer = step; }
            else { this.phase = 'input'; this.idx = 0; }
          }
        }
      },
      down(x, y) {
        if (this.phase !== 'input') return;
        for (let i = 0; i < 4; i++) {
          const r = this.rect(i);
          if (x > r.x && x < r.x + r.s && y > r.y && y < r.y + r.s) {
            this.light(i, .2);
            if (this.seq[this.idx] === i) {
              this.idx++;
              if (this.idx === this.seq.length) { this.score = this.seq.length; this.seq.push(Math.floor(Math.random() * 4)); this.phase = 'wait'; this.timer = .8; floaters.push({ x:W / 2, y:215, text:'Round ' + this.score + ' clear', life:.8 }); }
            } else { shake = .3; sfx('hit'); this.phase = 'dead'; endMini(this.score); }
            return;
          }
        }
      },
      draw(th, sk) {
        drawBg(ctx, th, W, dist, t);
        batAt(ctx, W / 2, 175, 1.4, sk, 0, this.phase === 'input' ? 8 : 20);
        for (let i = 0; i < 4; i++) {
          const r = this.rect(i), p = this.pads[i], on = this.lit === i;
          ctx.shadowColor = p.c; ctx.shadowBlur = on ? 40 : 0;
          ctx.fillStyle = on ? p.c : hexA(p.c, .22); rr(ctx, r.x, r.y, r.s, r.s, 22); ctx.fill();
          ctx.shadowBlur = 0; ctx.strokeStyle = hexA(p.c, .8); ctx.lineWidth = 3; ctx.stroke();
          ctx.fillStyle = on ? '#ffffff' : hexA(p.c, .7); diamond(ctx, r.x + r.s / 2, r.y + r.s / 2, on ? 16 : 12);
        }
      },
      hud(th) { hudTop(th, this.score, this.phase === 'input' ? 'Your turn' : 'Listen and watch'); },
    },

    hop: {
      name:'Cave Hop', icon:'🪨', desc:'Bounce up the ledges. Crumbly ones break. Don’t fall.',
      reward:s => Math.floor(s / 12), statLabel:'Height',
      init() {
        this.x = W / 2; this.y = FLOOR - 40; this.vy = -760; this.cam = 0; this.score = 0; this.dead = false;
        this.plats = [{ x:0, y:FLOOR, w:W, type:'n', vx:0 }];
        let y = FLOOR - 90;
        while (y > -200) { this.addPlat(y); y -= 80; }
      },
      addPlat(y) {
        const d = this.score, w = Math.max(46, 80 - d * .02);
        const r = Math.random(), mv = Math.min(.45, d * .0015), cr = Math.min(.25, d * .001);
        const type = r < cr ? 'c' : r < cr + mv ? 'm' : 'n';
        this.plats.push({ x:Math.random() * (W - w), y, w, type, vx:type === 'm' ? (60 + Math.min(120, d * .1)) * (Math.random() < .5 ? -1 : 1) : 0 });
        if (type === 'c' && Math.random() < .7) this.plats.push({ x:Math.random() * (W - w), y:y - 30, w, type:'n', vx:0 });
      },
      update(dt) {
        let vx = 0;
        if (keys.ArrowLeft || keys.KeyA) vx = -280; else if (keys.ArrowRight || keys.KeyD) vx = 280;
        else if (ptr.has) { let dx = ptr.x - this.x; vx = Math.max(-320, Math.min(320, dx * 6)); }
        const py = this.y;
        this.vy += 1400 * dt; this.y += this.vy * dt; this.x = wrap(this.x + vx * dt, W);
        this.tilt = vx / 900;
        for (const p of this.plats) {
          if (p.vx) { p.x += p.vx * dt; if (p.x < 0 || p.x + p.w > W) p.vx *= -1; }
          if (this.vy > 0 && !p.broken && py + 13 <= p.y && this.y + 13 >= p.y && this.x > p.x - 10 && this.x < p.x + p.w + 10) {
            if (p.type === 'c') { p.broken = true; p.fall = 0; sfx('deny'); }
            else { this.vy = -760; this.y = p.y - 13; sfx('flap'); emit(4, this.x, this.y + 8); }
          }
          if (p.broken) { p.fall += dt; p.y += 300 * dt; }
        }
        if (this.y - this.cam < 260) this.cam = this.y - 260;
        this.score = Math.max(this.score, Math.floor((FLOOR - 40 - this.y) / 10));
        let top = Math.min(...this.plats.map(p => p.y));
        while (top > this.cam - 120) { top -= 62 + Math.random() * Math.min(55, 12 + this.score * .05); this.addPlat(top); }
        this.plats = this.plats.filter(p => p.y - this.cam < H + 60);
        if (this.y - this.cam > H + 30 && !this.dead) { this.dead = true; sfx('hit'); endMini(this.score); }
      },
      draw(th, sk) {
        drawBg(ctx, th, W, -this.cam * .3, t);
        ctx.save(); ctx.translate(0, -this.cam);
        for (const p of this.plats) {
          if (p.y === FLOOR && p.w === W) { ctx.save(); ctx.translate(0, 0); drawFloor(ctx, th, W, 0, t); ctx.restore(); continue; }
          ctx.globalAlpha = p.broken ? Math.max(0, 1 - p.fall * 2) : 1;
          ctx.fillStyle = p.type === 'c' ? th.lo : th.rock; rr(ctx, p.x, p.y, p.w, 14, 6); ctx.fill();
          ctx.fillStyle = p.type === 'm' ? th.glow : th.hi; ctx.fillRect(p.x + 4, p.y, p.w - 8, 3);
          if (p.type === 'c') { ctx.strokeStyle = th.top; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(p.x + p.w * .4, p.y); ctx.lineTo(p.x + p.w * .5, p.y + 8); ctx.lineTo(p.x + p.w * .45, p.y + 14); ctx.stroke(); }
          ctx.globalAlpha = 1;
        }
        ctx.restore();
        ctx.save(); ctx.translate(0, -this.cam); drawTrail(); ctx.restore();
        drawBat(ctx, this.x, this.y - this.cam, this.tilt || 0, sk, t, this.vy < 0 ? 26 : 10, false);
      },
      hud(th) { hudTop(th, this.score, 'Height'); },
    },

    whack: {
      name:'Whack-a-Bat', icon:'🔨', desc:'Tap bats as they pop out. Leave the spiders alone.',
      reward:s => s, statLabel:'Bats',
      init() {
        this.holes = []; for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) this.holes.push({ x:70 + c * 110, y:270 + r * 115, up:false, k:'bat', tt:0, dur:1 });
        this.time = 30; this.el = 0; this.score = 0; this.spawn = .6;
      },
      update(dt) {
        this.time -= dt; this.el += dt; this.spawn -= dt;
        for (const h of this.holes) if (h.up) { h.tt += dt; if (h.tt >= h.dur) h.up = false; }
        if (this.spawn <= 0) {
          this.spawn = Math.max(.3, .85 - this.el * .02);
          const free = this.holes.filter(h => !h.up);
          if (free.length) {
            const h = free[Math.floor(Math.random() * free.length)], r = Math.random();
            h.up = true; h.tt = 0; h.dur = Math.max(.5, 1.25 - this.el * .022);
            h.k = r < .08 ? 'gold' : r < .08 + Math.min(.4, .2 + this.el * .006) ? 'spider' : 'bat';
          }
        }
        if (this.time <= 0) { this.time = 0; endMini(this.score); }
      },
      pop(h) { const p = h.tt / h.dur; return p < .2 ? p / .2 : p > .8 ? (1 - p) / .2 : 1; },
      down(x, y) {
        for (const h of this.holes) {
          if (!h.up) continue;
          const cy = h.y - 30 * this.pop(h);
          if (Math.hypot(x - h.x, y - cy) < 40) {
            h.up = false;
            if (h.k === 'spider') { this.score = Math.max(0, this.score - 3); shake = .3; sfx('hit'); vib(80); floaters.push({ x:h.x, y:cy - 30, text:'-3', life:.7 }); }
            else { const v = h.k === 'gold' ? 3 : 1; this.score += v; sfx(v > 1 ? 'level' : 'coin'); floaters.push({ x:h.x, y:cy - 30, text:'+' + v, life:.6 }); }
            return;
          }
        }
      },
      draw(th, sk) {
        drawBg(ctx, th, W, dist, t);
        const gold = skinOf('gold');
        for (const h of this.holes) {
          ctx.fillStyle = th.lo; ctx.beginPath(); ctx.ellipse(h.x, h.y + 6, 44, 16, 0, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = '#05040c'; ctx.beginPath(); ctx.ellipse(h.x, h.y + 4, 36, 12, 0, 0, Math.PI * 2); ctx.fill();
          if (h.up) {
            const cy = h.y - 30 * this.pop(h);
            ctx.save(); ctx.beginPath(); ctx.rect(h.x - 60, h.y - 120, 120, 124); ctx.clip();
            if (h.k === 'spider') drawSpider(ctx, h.x, cy, 1.3);
            else batAt(ctx, h.x, cy, 1.5, h.k === 'gold' ? gold : sk, 0, 20);
            ctx.restore();
          }
          ctx.fillStyle = th.rock; ctx.beginPath(); ctx.ellipse(h.x, h.y + 10, 44, 9, 0, 0, Math.PI); ctx.fill();
        }
        ctx.fillStyle = hexA(th.glow, .25); rr(ctx, 30, 140, W - 60, 10, 5); ctx.fill();
        ctx.fillStyle = th.glow; rr(ctx, 30, 140, (W - 60) * Math.max(0, this.time / 30), 10, 5); ctx.fill();
      },
      hud(th) { hudTop(th, this.score, Math.ceil(this.time) + 's left'); },
    },

    pairs: {
      name:'Pair Match', icon:'🃏', desc:'Flip cards and match every pair before time runs out.',
      reward:s => Math.floor(s / 3), statLabel:'Pairs',
      icons:['🦋','🍄','🕷️','🌙','💎','🔥','🍎','⭐'],
      init() {
        const deck = [...this.icons, ...this.icons].sort(() => Math.random() - .5);
        this.cards = deck.map((ic, i) => ({ ic, i, up:false, done:false, flip:0 }));
        this.open = []; this.lock = 0; this.time = 60; this.pairs = 0; this.moves = 0; this.score = 0; this.over = false;
      },
      rect(i) { const w = 72, h = 84, gap = 9, x0 = (W - w * 4 - gap * 3) / 2, y0 = 170; return { x:x0 + (i % 4) * (w + gap), y:y0 + Math.floor(i / 4) * (h + gap), w, h }; },
      update(dt) {
        if (this.over) return;
        this.time -= dt;
        for (const c of this.cards) c.flip += ((c.up || c.done ? 1 : 0) - c.flip) * Math.min(1, dt * 14);
        if (this.lock > 0) { this.lock -= dt; if (this.lock <= 0) { this.open.forEach(c => c.up = false); this.open = []; } }
        if (this.time <= 0) { this.time = 0; this.over = true; this.score = this.pairs * 10; endMini(this.score); }
      },
      down(x, y) {
        if (this.lock > 0 || this.over) return;
        for (const c of this.cards) {
          const r = this.rect(c.i);
          if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h && !c.up && !c.done) {
            c.up = true; this.open.push(c); sfx('click');
            if (this.open.length === 2) {
              this.moves++;
              const [a, b] = this.open;
              if (a.ic === b.ic) {
                a.done = b.done = true; this.open = []; this.pairs++; sfx('coin');
                if (this.pairs === 8) { this.over = true; this.score = 80 + Math.ceil(this.time); sfx('level'); endMini(this.score); }
              } else this.lock = .7;
            }
            return;
          }
        }
      },
      draw(th) {
        drawBg(ctx, th, W, dist, t);
        for (const c of this.cards) {
          const r = this.rect(c.i), sx = Math.abs(Math.cos(c.flip * Math.PI)), face = c.flip > .5;
          ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.scale(Math.max(.04, sx), 1);
          ctx.fillStyle = face ? (c.done ? hexA(th.glow, .3) : '#f2e9ff') : th.rock;
          rr(ctx, -r.w / 2, -r.h / 2, r.w, r.h, 10); ctx.fill();
          ctx.strokeStyle = face ? th.glow : th.hi; ctx.lineWidth = 2; ctx.stroke();
          if (face) { ctx.font = '34px ' + EMOJI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(c.ic, 0, 2); }
          else { ctx.fillStyle = th.glow; diamond(ctx, 0, 0, 7); }
          ctx.restore();
        }
      },
      hud(th) { hudTop(th, this.pairs + '/8', Math.ceil(this.time) + 's left'); },
    },

    // ---------- unlockable games ----------
    sonar: {
      name:'Sonar Hunt', icon:'📡', desc:'The cave is pitch black. Tap to send a sonar ping, then tap the moths it lights up.',
      price:1500, req:4, tier:1, pay:50, reward:s => Math.round(s * 2.5), statLabel:'Moths',
      init() { this.time = 40; this.el = 0; this.score = 0; this.cd = 0; this.pings = []; this.moths = []; for (let i = 0; i < 5; i++) this.add(); },
      add() { this.moths.push({ x:40 + Math.random() * (W - 80), y:150 + Math.random() * (FLOOR - 230), vx:(Math.random() - .5) * 70, vy:(Math.random() - .5) * 70, rev:0, gold:Math.random() < .12, ph:Math.random() * 6 }); },
      update(dt) {
        this.time -= dt; this.el += dt; this.cd -= dt;
        const sp = 1 + this.el / 30;
        for (const m of this.moths) {
          m.x += m.vx * sp * dt; m.y += m.vy * sp * dt; m.rev -= dt;
          if (Math.random() < dt * .6) { m.vx = (Math.random() - .5) * 90; m.vy = (Math.random() - .5) * 90; }
          if (m.x < 30 || m.x > W - 30) m.vx *= -1;
          if (m.y < 140 || m.y > FLOOR - 80) m.vy *= -1;
          m.x = clamp(m.x, 30, W - 30); m.y = clamp(m.y, 140, FLOOR - 80);
        }
        for (const p of this.pings) {
          p.r += 280 * dt; p.life -= dt;
          for (const m of this.moths) if (Math.abs(Math.hypot(m.x - p.x, m.y - p.y) - p.r) < 16) m.rev = Math.max(.35, 1.1 - this.el * .012);
        }
        this.pings = this.pings.filter(p => p.life > 0);
        while (this.moths.length < 5 + Math.floor(this.el / 8)) this.add();
        if (this.time <= 0) { this.time = 0; endMini(this.score); }
      },
      down(x, y) {
        for (const m of this.moths) {
          if (m.rev > 0 && Math.hypot(m.x - x, m.y - y) < 32) {
            const v = m.gold ? 3 : 1; this.score += v; this.moths.splice(this.moths.indexOf(m), 1);
            sfx(v > 1 ? 'level' : 'coin'); vib(10); floaters.push({ x, y:y - 20, text:'+' + v, life:.6 }); return;
          }
        }
        if (this.cd > 0) return;
        this.cd = .8; this.pings.push({ x, y, r:6, life:.8 });
        if (save.sfx) tone(1500, .3, 'sine', .07, 600);
      },
      draw(th, sk) {
        drawBg(ctx, th, W, dist, t); drawFloor(ctx, th, W, dist, t);
        ctx.fillStyle = 'rgba(2,2,8,.87)'; ctx.fillRect(0, 0, W, H);
        for (const p of this.pings) { ctx.globalAlpha = Math.max(0, p.life / .8); ctx.strokeStyle = th.glow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.stroke(); }
        for (const m of this.moths) if (m.rev > 0) { ctx.globalAlpha = Math.min(1, m.rev * 2.5); drawMoth(ctx, m.x, m.y, m.gold ? '#ffd24a' : '#efe2c8', m.ph); }
        ctx.globalAlpha = 1;
        batAt(ctx, W / 2, FLOOR - 36, 1.3, sk, 0, 10);
        if (this.cd > 0) { ctx.strokeStyle = th.glow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(W / 2, FLOOR - 36, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - this.cd / .8)); ctx.stroke(); }
      },
      hud(th) { hudTop(th, this.score, Math.ceil(this.time) + 's left'); },
    },

    stack: {
      name:'Rock Stack', icon:'🧱', desc:'Drop sliding slabs to build the tallest tower. Only the overlapping part stays.',
      price:3500, req:6, tier:2, pay:80, reward:s => s * 4, statLabel:'Score',
      init() { this.slabs = [{ x:W / 2 - 100, w:200, y:FLOOR - 24 }]; this.falling = []; this.score = 0; this.cam = 0; this.dead = false; this.deadT = 0; this.next(); },
      next() {
        const top = this.slabs[this.slabs.length - 1], left = Math.random() < .5;
        this.cur = { x:left ? -top.w * .5 : W - top.w * .5, w:top.w, y:top.y - 24, dir:left ? 1 : -1 };
        this.sp = Math.min(430, 150 + this.slabs.length * 8);
      },
      update(dt) {
        const c = this.cur;
        if (c) { c.x += c.dir * this.sp * dt; if (c.x < -c.w * .6) c.dir = 1; if (c.x > W - c.w * .4) c.dir = -1; }
        for (const f of this.falling) { f.vy += 1200 * dt; f.y += f.vy * dt; f.x += f.vx * dt; f.rot += f.vr * dt; }
        this.falling = this.falling.filter(f => f.y - this.cam < H + 80);
        const want = Math.min(0, this.slabs[this.slabs.length - 1].y - 330);
        this.cam += (want - this.cam) * Math.min(1, dt * 4);
        if (this.dead) { this.deadT -= dt; if (this.deadT <= 0) endMini(this.score); }
      },
      drop() {
        if (this.dead || !this.cur) return;
        const c = this.cur, top = this.slabs[this.slabs.length - 1];
        let l = Math.max(c.x, top.x), r = Math.min(c.x + c.w, top.x + top.w);
        if (r - l <= 3) {
          this.dead = true; this.deadT = 1; this.falling.push({ x:c.x, w:c.w, y:c.y, vy:0, vx:c.dir * 60, rot:0, vr:c.dir * 2 });
          this.cur = null; sfx('hit'); shake = .3; vib(100); return;
        }
        if (Math.abs(c.x - top.x) < 5) {
          l = top.x; r = top.x + top.w; this.score += 2; sfx('level'); vib(20);
          floaters.push({ x:W / 2, y:c.y - this.cam - 40, text:'Perfect', life:.8 });
        } else {
          this.score += 1; sfx('score');
          if (c.x < l) this.falling.push({ x:c.x, w:l - c.x, y:c.y, vy:0, vx:-60, rot:0, vr:-2 });
          if (c.x + c.w > r) this.falling.push({ x:r, w:c.x + c.w - r, y:c.y, vy:0, vx:60, rot:0, vr:2 });
        }
        this.slabs.push({ x:l, w:r - l, y:c.y });
        this.next();
      },
      down() { this.drop(); },
      key(k) { if (k === 'Space' || k === 'ArrowUp' || k === 'ArrowDown') this.drop(); },
      slab(g, th, x, y, w, i) {
        g.fillStyle = i % 2 ? th.rock : th.lo; rr(g, x, y, w, 24, 4); g.fill();
        g.fillStyle = th.hi; g.fillRect(x + 3, y, Math.max(0, w - 6), 3);
        if (w > 24) { g.fillStyle = hexA(th.glow, .8); diamond(g, x + w / 2, y + 13, 3); }
      },
      draw(th, sk) {
        drawBg(ctx, th, W, -this.cam * .3, t);
        ctx.save(); ctx.translate(0, -this.cam);
        drawFloor(ctx, th, W, 0, t);
        this.slabs.forEach((s, i) => this.slab(ctx, th, s.x, s.y, s.w, i));
        if (this.cur) this.slab(ctx, th, this.cur.x, this.cur.y, this.cur.w, this.slabs.length);
        for (const f of this.falling) { ctx.save(); ctx.translate(f.x + f.w / 2, f.y + 12); ctx.rotate(f.rot); this.slab(ctx, th, -f.w / 2, -12, f.w, 1); ctx.restore(); }
        const top = this.slabs[this.slabs.length - 1];
        batAt(ctx, W / 2 + Math.sin(t * .9) * 90, top.y - 110 + Math.sin(t * 2) * 6, 1.1, sk, 0, 14, this.dead);
        ctx.restore();
      },
      hud(th) { hudTop(th, this.score, 'Tap to drop'); },
    },

    dash: {
      name:'Lane Dash', icon:'⚡', desc:'Race up a collapsing shaft. Switch lanes to dodge falling rocks and grab crystals.',
      price:8000, req:8, tier:3, pay:150, reward:s => s * 5, statLabel:'Score',
      lanes:[W * .22, W * .5, W * .78],
      init() { this.lane = 1; this.bx = this.lanes[1]; this.rows = []; this.v = 260; this.el = 0; this.acc = 0; this.score = 0; this.dead = false; this.deadT = 0; },
      move(d) { if (this.dead) return; const n = clamp(this.lane + d, 0, 2); if (n !== this.lane) { this.lane = n; sfx('flap'); } },
      down(x) { this.move(x < W / 2 ? -1 : 1); },
      key(k) { if (k === 'ArrowLeft' || k === 'KeyA') this.move(-1); if (k === 'ArrowRight' || k === 'KeyD') this.move(1); },
      update(dt) {
        if (this.dead) { this.deadT -= dt; if (this.deadT <= 0) endMini(this.score); return; }
        this.el += dt; this.v = Math.min(640, 260 + this.el * 9);
        this.bx += (this.lanes[this.lane] - this.bx) * Math.min(1, dt * 16);
        this.acc += this.v * dt; dist += this.v * dt * .2;
        if (this.acc >= Math.max(150, 240 - this.el * 2)) {
          this.acc = 0;
          const two = Math.random() < Math.min(.65, .2 + this.el * .012);
          const order = [0, 1, 2].sort(() => Math.random() - .5), blocked = order.slice(0, two ? 2 : 1), free = order.filter(l => !blocked.includes(l));
          this.rows.push({ y:-30, blocked, gem:Math.random() < .4 ? free[0] : -1, spin:Math.random() * 6 });
        }
        const by = FLOOR - 90;
        for (const r of this.rows) {
          r.y += this.v * dt; r.spin += dt * 3;
          if (!r.passed && r.y > by + 30) { r.passed = true; this.score++; }
          if (Math.abs(r.y - by) < 24) {
            if (r.blocked.some(l => Math.abs(this.bx - this.lanes[l]) < 36)) {
              this.dead = true; this.deadT = .8; shake = .35; sfx('hit'); vib(140); return;
            }
            if (r.gem >= 0 && !r.gemTaken && Math.abs(this.bx - this.lanes[r.gem]) < 36) {
              r.gemTaken = true; this.score += 2; sfx('coin'); vib(10); floaters.push({ x:this.lanes[r.gem], y:by - 40, text:'+2', life:.6, c:gemCol() });
            }
          }
        }
        this.rows = this.rows.filter(r => r.y < H + 40);
      },
      draw(th, sk) {
        drawBg(ctx, th, W, dist, t);
        ctx.strokeStyle = hexA(th.hi, .25); ctx.lineWidth = 2; ctx.setLineDash([10, 14]); ctx.lineDashOffset = -dist * 2;
        for (const x of [W * .36, W * .64]) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
        ctx.setLineDash([]);
        for (const r of this.rows) {
          for (const l of r.blocked) drawStone(ctx, { x:this.lanes[l], y:r.y, r:24, spin:r.spin + l, armed:true }, th);
          if (r.gem >= 0 && !r.gemTaken) { const c = gemCol(); ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 14; diamond(ctx, this.lanes[r.gem], r.y, 7); ctx.shadowBlur = 0; }
        }
        batAt(ctx, this.bx, FLOOR - 90, 1.3, sk, (this.lanes[this.lane] - this.bx) / 300, 26, this.dead);
      },
      hud(th) { hudTop(th, this.score, 'Tap left or right'); },
    },

    slash: {
      name:'Fruit Slash', icon:'🍉', desc:'Swipe to slice flying fruit. Never cut the spiky urchins, and don’t let fruit fall.',
      price:16000, req:10, tier:4, pay:250, reward:s => s * 6, statLabel:'Fruit',
      FR:['🥭', '🍉', '🍌', '🍎', '🍊', '🍑'], FC:['#ffb347', '#ff4f6d', '#ffe14d', '#ff3b3b', '#ff9a2e', '#ff9ec4'],
      init() { this.items = []; this.pts = []; this.bits = []; this.lives = 3; this.score = 0; this.el = 0; this.sp = .6; this.dead = false; this.deadT = 0; },
      kill() { if (this.dead) return; this.dead = true; this.deadT = .9; shake = .35; sfx('hit'); vib(150); },
      update(dt) {
        if (this.dead) { this.deadT -= dt; if (this.deadT <= 0) endMini(this.score); }
        this.el += dt; this.sp -= dt;
        if (!this.dead && this.sp <= 0) {
          this.sp = Math.max(.45, 1.3 - this.el * .015);
          const n = 1 + Math.floor(Math.random() * Math.min(3, 1 + this.el / 15));
          for (let i = 0; i < n; i++) {
            const x = 60 + Math.random() * (W - 120), k = Math.floor(Math.random() * 6);
            this.items.push({ x, y:H + 30, vx:(W / 2 - x) * (.4 + Math.random() * .6), vy:-(740 + Math.random() * 170), bomb:Math.random() < Math.min(.25, .1 + this.el * .003), k, rot:0, vr:(Math.random() - .5) * 6 });
          }
        }
        for (const it of this.items) {
          it.vy += 900 * dt; it.x += it.vx * dt; it.y += it.vy * dt; it.rot += it.vr * dt;
          if (!it.bomb && it.vy > 0 && it.y > H + 40 && !it.gone) { it.gone = true; if (!this.dead) { this.lives--; sfx('deny'); vib(40); if (this.lives <= 0) this.kill(); } }
        }
        this.items = this.items.filter(it => !it.gone && it.y < H + 60);
        for (const b of this.bits) { b.vy += 900 * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt; }
        this.bits = this.bits.filter(b => b.life > 0);
        this.pts = this.pts.filter(p => t - p.t < .15);
      },
      segDist(px, py, x1, y1, x2, y2) {
        const dx = x2 - x1, dy = y2 - y1, L = dx * dx + dy * dy, k = L ? clamp(((px - x1) * dx + (py - y1) * dy) / L, 0, 1) : 0;
        return Math.hypot(px - (x1 + dx * k), py - (y1 + dy * k));
      },
      down(x, y) { this.pts = [{ x, y, t }]; },
      move(x, y, isDown) {
        if (!isDown || this.dead) return;
        const last = this.pts[this.pts.length - 1];
        this.pts.push({ x, y, t });
        if (!last) return;
        for (const it of this.items) {
          if (it.gone || this.segDist(it.x, it.y, last.x, last.y, x, y) > 24) continue;
          if (it.bomb) { this.kill(); return; }
          it.gone = true; this.score++; sfx('coin'); vib(8);
          for (let i = 0; i < 9; i++) this.bits.push({ x:it.x, y:it.y, vx:(Math.random() - .5) * 320, vy:-Math.random() * 280, life:.6, c:this.FC[it.k] });
        }
      },
      draw(th) {
        drawBg(ctx, th, W, dist, t); drawFloor(ctx, th, W, dist, t);
        ctx.font = '40px ' + EMOJI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (const it of this.items) {
          ctx.save(); ctx.translate(it.x, it.y); ctx.rotate(it.rot);
          if (it.bomb) {
            ctx.strokeStyle = '#1a1024'; ctx.lineWidth = 3;
            for (let a = 0; a < 12; a++) { const an = a / 12 * Math.PI * 2; ctx.beginPath(); ctx.moveTo(Math.cos(an) * 12, Math.sin(an) * 12); ctx.lineTo(Math.cos(an) * 24, Math.sin(an) * 24); ctx.stroke(); }
            ctx.fillStyle = '#2a1838'; ctx.beginPath(); ctx.arc(0, 0, 15, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#ff3b3b'; ctx.beginPath(); ctx.arc(-5, -3, 2.5, 0, Math.PI * 2); ctx.arc(5, -3, 2.5, 0, Math.PI * 2); ctx.fill();
          } else ctx.fillText(this.FR[it.k], 0, 2);
          ctx.restore();
        }
        for (const b of this.bits) { ctx.globalAlpha = b.life / .6; ctx.fillStyle = b.c; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill(); }
        ctx.globalAlpha = 1;
        if (this.pts.length > 1) {
          ctx.strokeStyle = '#ffffff'; ctx.shadowColor = th.glow; ctx.shadowBlur = 12; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
          for (let i = 1; i < this.pts.length; i++) {
            const a = this.pts[i - 1], b = this.pts[i]; ctx.lineWidth = 2 + 5 * (i / this.pts.length);
            ctx.globalAlpha = Math.max(0, 1 - (t - b.t) / .15); ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
          }
          ctx.globalAlpha = 1; ctx.shadowBlur = 0;
        }
      },
      hud(th) { hudTop(th, this.score, 'Lives ' + '◆'.repeat(Math.max(0, this.lives))); },
    },

    beats: {
      name:'Echo Beats', icon:'🎵', desc:'Tap each lane as the echoes cross the line. Chain hits for a bigger combo.',
      price:32000, req:13, tier:5, pay:400, reward:s => Math.round(s * 1.3), statLabel:'Points',
      LC:['#b07cff', '#ff8a3d', '#4fd6ff', '#6dff9e'], LF:[392, 494, 587, 659], HIT:FLOOR - 70,
      lx(l) { return l * W / 4 + W / 8; },
      init() { this.notes = []; this.score = 0; this.combo = 0; this.miss = 0; this.time = 60; this.bt = 1; this.flash = [0, 0, 0, 0]; this.el = 0; this.judge = null; this.done = false; },
      update(dt) {
        if (this.done) return;
        this.time -= dt; this.el += dt;
        const v = 300 + this.el * 3.5, step = 60 / (100 + this.el * .7) / (this.el > 25 ? 2 : 1);
        this.bt -= dt;
        if (this.bt <= 0) {
          this.bt += step;
          if (this.time > 1.8 && !(this.el > 25 && Math.random() < .35)) {
            const lane = Math.floor(Math.random() * 4); this.notes.push({ lane, y:-20 });
            if (Math.random() < Math.min(.3, this.el * .006)) this.notes.push({ lane:(lane + 1 + Math.floor(Math.random() * 3)) % 4, y:-20 });
          }
        }
        for (const n of this.notes) { n.y += v * dt; if (!n.hit && n.y > this.HIT + 45) { n.hit = true; this.onMiss(); } }
        this.notes = this.notes.filter(n => !n.hit && n.y < H);
        for (let i = 0; i < 4; i++) this.flash[i] = Math.max(0, this.flash[i] - dt);
        if (this.judge) { this.judge.life -= dt; if (this.judge.life <= 0) this.judge = null; }
        if (this.time <= 0 || this.miss >= 15) { this.done = true; endMini(this.score); }
      },
      onMiss() { this.combo = 0; this.miss++; this.judge = { text:'Miss', life:.5, c:'#ff5c6c' }; vib(20); },
      hit(l) {
        if (this.done) return;
        this.flash[l] = .15;
        let best = null, bd = 1e9;
        for (const n of this.notes) if (!n.hit && n.lane === l) { const d = Math.abs(n.y - this.HIT); if (d < bd) { bd = d; best = n; } }
        if (best && bd < 44) {
          best.hit = true; const perfect = bd < 18;
          this.combo++; this.score += (perfect ? 2 : 1) + Math.floor(this.combo / 10);
          this.judge = { text:perfect ? 'Perfect' : 'Good', life:.45, c:perfect ? '#ffcf5c' : '#f2e9ff' };
          if (save.sfx) tone(this.LF[l], .18, 'triangle', .1);
        } else { this.combo = 0; sfx('deny'); }
      },
      down(x) { this.hit(clamp(Math.floor(x / (W / 4)), 0, 3)); },
      key(k) { const m = { KeyD:0, KeyF:1, KeyJ:2, KeyK:3, ArrowLeft:0, ArrowDown:1, ArrowUp:2, ArrowRight:3 }; if (k in m) this.hit(m[k]); },
      draw(th, sk) {
        drawBg(ctx, th, W, dist, t);
        ctx.fillStyle = 'rgba(5,4,16,.55)'; ctx.fillRect(0, 0, W, H);
        for (let l = 0; l < 4; l++) {
          const c = this.LC[l];
          ctx.fillStyle = hexA(c, .05 + this.flash[l] * 2); ctx.fillRect(l * W / 4 + 3, 130, W / 4 - 6, H);
          ctx.strokeStyle = hexA(c, .8); ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.lx(l), this.HIT, 22, 0, Math.PI * 2); ctx.stroke();
        }
        for (const n of this.notes) {
          const c = this.LC[n.lane];
          ctx.fillStyle = c; ctx.shadowColor = c; ctx.shadowBlur = 14; ctx.beginPath(); ctx.arc(this.lx(n.lane), n.y, 16, 0, Math.PI * 2); ctx.fill();
          ctx.shadowBlur = 0; ctx.fillStyle = '#ffffff'; diamond(ctx, this.lx(n.lane), n.y, 4);
        }
        batAt(ctx, W / 2, FLOOR + 30, 1.1, sk, 0, 8 + Math.min(30, this.combo));
        if (this.judge) txt(this.judge.text, W / 2, this.HIT - 90, 22, this.judge.c, Math.min(1, this.judge.life * 3));
      },
      hud(th) { hudTop(th, this.score, this.combo > 1 ? 'Combo ' + this.combo : Math.ceil(this.time) + 's left'); },
    },
    firefly: {
      name:'Firefly Jar', icon:'✨', desc:'Tap fireflies before their glow fades. Gold ones pay triple. Never tap a wasp.',
      price:45000, req:15, tier:6, pay:500, reward:s => s * 18, statLabel:'Fireflies',
      init() { this.time = 30; this.el = 0; this.score = 0; this.bugs = []; this.sp = .3; },
      update(dt) {
        this.time -= dt; this.el += dt; this.sp -= dt;
        if (this.sp <= 0) {
          this.sp = Math.max(.22, .6 - this.el * .012);
          const r = Math.random(), kind = r < .1 ? 'gold' : r < .1 + Math.min(.3, .12 + this.el * .006) ? 'wasp' : 'fly';
          const life = Math.max(.6, 1.5 - this.el * .025);
          this.bugs.push({ x:30 + Math.random() * (W - 60), y:150 + Math.random() * (FLOOR - 200), kind, life, max:life, ph:Math.random() * 6 });
        }
        for (const b of this.bugs) { b.life -= dt; b.x += Math.sin(t * 3 + b.ph) * 20 * dt; }
        this.bugs = this.bugs.filter(b => b.life > 0);
        if (this.time <= 0) { this.time = 0; endMini(this.score); }
      },
      down(x, y) {
        for (const b of this.bugs) {
          if (Math.hypot(b.x - x, b.y - y) > 30) continue;
          b.life = 0;
          if (b.kind === 'wasp') { this.score = Math.max(0, this.score - 3); shake = .3; sfx('hit'); vib(60); floaters.push({ x, y:y - 20, text:'-3', life:.7, c:'#ff6b7d' }); }
          else { const v = b.kind === 'gold' ? 3 : 1; this.score += v; sfx(v > 1 ? 'level' : 'coin'); vib(8); floaters.push({ x, y:y - 20, text:'+' + v, life:.6 }); }
          return;
        }
      },
      draw(th, sk) {
        drawBg(ctx, th, W, dist, t); drawFloor(ctx, th, W, dist, t);
        ctx.fillStyle = 'rgba(2,2,12,.55)'; ctx.fillRect(0, 0, W, H);
        for (const b of this.bugs) {
          const a = Math.min(1, b.life / b.max * 1.6);
          if (b.kind === 'wasp') {
            ctx.globalAlpha = a; ctx.fillStyle = '#ffcf3a'; ctx.beginPath(); ctx.ellipse(b.x, b.y, 11, 7, 0, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#1a1024'; ctx.fillRect(b.x - 4, b.y - 7, 3, 14); ctx.fillRect(b.x + 2, b.y - 7, 3, 14);
            ctx.fillStyle = 'rgba(220,240,255,.7)'; ctx.beginPath(); ctx.ellipse(b.x - 3, b.y - 9, 5, 3, -.5, 0, Math.PI * 2); ctx.ellipse(b.x + 4, b.y - 9, 5, 3, .5, 0, Math.PI * 2); ctx.fill();
          } else {
            const c = b.kind === 'gold' ? '#ffcf3a' : '#b6ff6b';
            ctx.globalAlpha = a; const gr = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, 26); gr.addColorStop(0, hexA(c, .9)); gr.addColorStop(1, hexA(c, 0));
            ctx.fillStyle = gr; ctx.beginPath(); ctx.arc(b.x, b.y, 26, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(b.x, b.y, 3.5, 0, Math.PI * 2); ctx.fill();
          }
        }
        ctx.globalAlpha = 1;
        batAt(ctx, W / 2, FLOOR - 30, 1.2, sk, 0, 10);
      },
      hud(th) { hudTop(th, this.score, Math.ceil(this.time) + 's left'); },
    },

    snake: {
      name:'Cave Snake', icon:'🐍', desc:'Guide a trail of baby bats to the moths. Swipe to turn. Don’t hit the walls or yourself.',
      price:60000, req:17, tier:7, pay:650, reward:s => s * 30, statLabel:'Moths',
      C:24, init() {
        this.cols = 15; this.rows = Math.floor((FLOOR - 170) / this.C); this.x0 = (W - this.cols * this.C) / 2; this.y0 = 150;
        this.body = [{ x:5, y:5 }, { x:4, y:5 }, { x:3, y:5 }]; this.dir = { x:1, y:0 }; this.next = this.dir; this.acc = 0; this.score = 0; this.dead = false; this.deadT = 0; this.place(); this.sx = null;
      },
      place() { let f; do { f = { x:Math.floor(Math.random() * this.cols), y:Math.floor(Math.random() * this.rows) }; } while (this.body.some(b => b.x === f.x && b.y === f.y)); this.food = f; },
      turn(dx, dy) { if (dx === -this.dir.x && dy === -this.dir.y) return; this.next = { x:dx, y:dy }; },
      key(k) { if (k === 'ArrowLeft' || k === 'KeyA') this.turn(-1, 0); if (k === 'ArrowRight' || k === 'KeyD') this.turn(1, 0); if (k === 'ArrowUp' || k === 'KeyW') this.turn(0, -1); if (k === 'ArrowDown' || k === 'KeyS') this.turn(0, 1); },
      down(x, y) { this.sx = x; this.sy = y; },
      move(x, y, isDown) {
        if (!isDown || this.sx === null) return;
        const dx = x - this.sx, dy = y - this.sy;
        if (Math.hypot(dx, dy) < 22) return;
        if (Math.abs(dx) > Math.abs(dy)) this.turn(Math.sign(dx), 0); else this.turn(0, Math.sign(dy));
        this.sx = x; this.sy = y;
      },
      update(dt) {
        if (this.dead) { this.deadT -= dt; if (this.deadT <= 0) endMini(this.score); return; }
        this.acc += dt;
        const step = Math.max(.075, .17 - this.score * .004);
        while (this.acc >= step) {
          this.acc -= step; this.dir = this.next;
          const h = { x:this.body[0].x + this.dir.x, y:this.body[0].y + this.dir.y };
          if (h.x < 0 || h.y < 0 || h.x >= this.cols || h.y >= this.rows || this.body.some(b => b.x === h.x && b.y === h.y)) { this.dead = true; this.deadT = .9; shake = .35; sfx('hit'); vib(120); return; }
          this.body.unshift(h);
          if (h.x === this.food.x && h.y === this.food.y) { this.score++; sfx('coin'); vib(10); this.place(); } else this.body.pop();
        }
      },
      draw(th, sk) {
        drawBg(ctx, th, W, dist, t); drawFloor(ctx, th, W, dist, t);
        const C = this.C;
        ctx.fillStyle = 'rgba(10,8,30,.6)'; rr(ctx, this.x0 - 4, this.y0 - 4, this.cols * C + 8, this.rows * C + 8, 10); ctx.fill();
        ctx.strokeStyle = hexA(th.hi, .6); ctx.lineWidth = 2; ctx.stroke();
        drawMoth(ctx, this.x0 + this.food.x * C + C / 2, this.y0 + this.food.y * C + C / 2, '#efe2c8', 0);
        for (let i = this.body.length - 1; i >= 1; i--) {
          const b = this.body[i]; ctx.fillStyle = i % 2 ? sk.wing === '#12051f' ? '#39f3ff' : hexA(sk.trail === 'rainbow' ? '#ff9ed8' : sk.trail, .85) : hexA(th.glow, .7);
          ctx.beginPath(); ctx.arc(this.x0 + b.x * C + C / 2, this.y0 + b.y * C + C / 2, C * .36, 0, Math.PI * 2); ctx.fill();
        }
        const h = this.body[0];
        batAt(ctx, this.x0 + h.x * C + C / 2, this.y0 + h.y * C + C / 2, .8, sk, 0, 20, this.dead, { noHalo:true });
      },
      hud(th) { hudTop(th, this.score, 'Swipe to turn'); },
    },

    bubble: {
      name:'Bubble Pop', icon:'🫧', desc:'Pop only the bubbles that match the target color. Wrong colors cost points.',
      price:80000, req:19, tier:8, pay:800, reward:s => s * 25, statLabel:'Bubbles',
      COL:['#ff6b7d', '#4fd6ff', '#7dffb0', '#ffcf5c'], NAMES:['red', 'blue', 'green', 'yellow'],
      init() { this.time = 40; this.el = 0; this.score = 0; this.bs = []; this.sp = 0; this.target = 0; this.tt = 5; },
      update(dt) {
        this.time -= dt; this.el += dt; this.sp -= dt; this.tt -= dt;
        if (this.tt <= 0) { this.tt = 5; let n; do { n = Math.floor(Math.random() * 4); } while (n === this.target); this.target = n; sfx('power'); }
        if (this.sp <= 0) { this.sp = Math.max(.18, .45 - this.el * .006); this.bs.push({ x:30 + Math.random() * (W - 60), y:FLOOR + 20, r:16 + Math.random() * 10, c:Math.floor(Math.random() * 4), vy:-(70 + Math.random() * 60 + this.el * 2), ph:Math.random() * 6 }); }
        for (const b of this.bs) { b.y += b.vy * dt; b.x += Math.sin(t * 2 + b.ph) * 18 * dt; }
        this.bs = this.bs.filter(b => b.y > 110 && !b.popped);
        if (this.time <= 0) { this.time = 0; endMini(this.score); }
      },
      down(x, y) {
        for (let i = this.bs.length - 1; i >= 0; i--) {
          const b = this.bs[i]; if (Math.hypot(b.x - x, b.y - y) > b.r + 6) continue;
          b.popped = true;
          if (b.c === this.target) { this.score++; sfx('bubble'); vib(6); }
          else { this.score = Math.max(0, this.score - 1); sfx('deny'); shake = .15; floaters.push({ x, y:y - 20, text:'-1', life:.6, c:'#ff6b7d' }); }
          return;
        }
      },
      draw(th) {
        drawBg(ctx, th, W, dist, t); drawFloor(ctx, th, W, dist, t);
        for (const b of this.bs) {
          const c = this.COL[b.c]; ctx.fillStyle = hexA(c, .35); ctx.strokeStyle = c; ctx.lineWidth = 2.5;
          ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
          ctx.fillStyle = 'rgba(255,255,255,.7)'; ctx.beginPath(); ctx.arc(b.x - b.r * .35, b.y - b.r * .35, b.r * .22, 0, Math.PI * 2); ctx.fill();
        }
        const c = this.COL[this.target];
        ctx.fillStyle = 'rgba(14,12,34,.85)'; rr(ctx, W / 2 - 80, 122, 160, 30, 15); ctx.fill(); ctx.strokeStyle = c; ctx.lineWidth = 2; ctx.stroke();
        txt('Pop ' + this.NAMES[this.target], W / 2, 137, 14, c);
      },
      hud(th) { hudTop(th, this.score, Math.ceil(this.time) + 's left'); },
    },

    spike: {
      name:'Spike Storm', icon:'🌪️', desc:'Drag your bat anywhere to dodge falling spikes and darts. Survive as long as you can.',
      price:100000, req:21, tier:9, pay:1000, reward:s => s * 12, statLabel:'Score',
      init() { this.bx = W / 2; this.by = FLOOR - 120; this.el = 0; this.score = 0; this.items = []; this.sp = .8; this.dead = false; this.deadT = 0; },
      update(dt) {
        if (this.dead) { this.deadT -= dt; if (this.deadT <= 0) endMini(this.score); return; }
        this.el += dt; this.score = Math.floor(this.el * 2);
        if (ptr.has) { this.bx += (clamp(ptr.x, 20, W - 20) - this.bx) * Math.min(1, dt * 14); this.by += (clamp(ptr.y - 40, 170, FLOOR - 30) - this.by) * Math.min(1, dt * 14); }
        if (keys.ArrowLeft || keys.KeyA) this.bx -= 260 * dt; if (keys.ArrowRight || keys.KeyD) this.bx += 260 * dt;
        this.bx = clamp(this.bx, 20, W - 20);
        this.sp -= dt;
        if (this.sp <= 0) {
          this.sp = Math.max(.18, .7 - this.el * .012);
          if (Math.random() < .7) this.items.push({ k:'spike', x:20 + Math.random() * (W - 40), y:110, vx:0, vy:220 + this.el * 5 + Math.random() * 80 });
          else { const left = Math.random() < .5; this.items.push({ k:'dart', x:left ? -20 : W + 20, y:180 + Math.random() * (FLOOR - 230), vx:(left ? 1 : -1) * (240 + this.el * 5), vy:0 }); }
        }
        for (const it of this.items) {
          it.x += it.vx * dt; it.y += it.vy * dt;
          if (Math.hypot(it.x - this.bx, it.y - this.by) < 18) { this.dead = true; this.deadT = .9; shake = .35; sfx('hit'); vib(140); return; }
        }
        this.items = this.items.filter(it => it.y < FLOOR + 20 && it.x > -40 && it.x < W + 40);
      },
      draw(th, sk) {
        drawBg(ctx, th, W, dist, t); drawFloor(ctx, th, W, dist, t);
        for (const it of this.items) {
          ctx.fillStyle = th.hi;
          if (it.k === 'spike') { ctx.beginPath(); ctx.moveTo(it.x - 8, it.y - 14); ctx.lineTo(it.x + 8, it.y - 14); ctx.lineTo(it.x, it.y + 12); ctx.closePath(); ctx.fill(); }
          else { const d = Math.sign(it.vx); ctx.beginPath(); ctx.moveTo(it.x + d * 14, it.y); ctx.lineTo(it.x - d * 10, it.y - 5); ctx.lineTo(it.x - d * 10, it.y + 5); ctx.closePath(); ctx.fill(); ctx.fillStyle = '#ff6b7d'; ctx.fillRect(it.x - d * 16 - 2, it.y - 2, 6, 4); }
        }
        batAt(ctx, this.bx, this.by, 1.1, sk, 0, 22, this.dead);
      },
      hud(th) { hudTop(th, this.score, 'Drag to dodge'); },
    },

    react: {
      name:'Echo Reflex', icon:'⚡', desc:'Wait for the screech, then tap as fast as you can. Tapping early costs the round. 10 rounds.',
      price:130000, req:23, tier:10, pay:1300, reward:s => s * 3, statLabel:'Points',
      init() { this.round = 0; this.score = 0; this.phase = 'wait'; this.timer = 1.2 + Math.random() * 2; this.msg = 'Wait for it…'; this.times = []; },
      update(dt) {
        if (this.phase === 'wait') { this.timer -= dt; if (this.timer <= 0) { this.phase = 'go'; this.goAt = performance.now(); sfx('power'); } }
        else if (this.phase === 'go') { if (performance.now() - this.goAt > 1200) this.finish(0, 'Too slow'); }
        else if (this.phase === 'gap') { this.timer -= dt; if (this.timer <= 0) { if (this.round >= 10) { this.phase = 'done'; endMini(this.score); } else { this.phase = 'wait'; this.timer = 1 + Math.random() * 2.5; this.msg = 'Wait for it…'; } } }
      },
      finish(pts, msg) { this.score += pts; this.round++; this.msg = msg; this.phase = 'gap'; this.timer = .9; if (pts) floaters.push({ x:W / 2, y:330, text:'+' + pts, life:.8 }); },
      down() {
        if (this.phase === 'wait') { sfx('deny'); vib(60); this.finish(0, 'Too early!'); }
        else if (this.phase === 'go') { const ms = Math.round(performance.now() - this.goAt); this.times.push(ms); sfx('coin'); vib(10); this.finish(Math.max(0, Math.round((700 - ms) / 10)), ms + ' ms'); }
      },
      key(k) { if (k === 'Space') this.down(); },
      draw(th, sk) {
        drawBg(ctx, th, W, dist, t);
        if (this.phase === 'go') { ctx.fillStyle = hexA(th.glow, .28); ctx.fillRect(0, 0, W, H); }
        drawFloor(ctx, th, W, dist, t);
        batAt(ctx, W / 2, 300, this.phase === 'go' ? 2.8 : 2.2, sk, 0, this.phase === 'go' ? 30 : 6, false, { mood:this.phase === 'go' ? 'happy' : undefined });
        txt(this.phase === 'go' ? 'NOW!' : this.msg, W / 2, 420, this.phase === 'go' ? 40 : 20, this.phase === 'go' ? th.glow : '#f2e9ff');
        txt(`Round ${Math.min(10, this.round + (this.phase === 'gap' ? 0 : 1))} of 10`, W / 2, 460, 12, '#f2e9ff', .7);
      },
      hud(th) { hudTop(th, this.score, this.times.length ? `Best ${Math.min(...this.times)} ms` : 'Tap when it screeches'); },
    },
  };
  Object.assign(MINIS.moths, { tier:0, pay:15 }); Object.assign(MINIS.echo, { tier:0, pay:20 }); Object.assign(MINIS.hop, { tier:0, pay:15 });
  Object.assign(MINIS.whack, { tier:0, pay:20 }); Object.assign(MINIS.pairs, { tier:0, pay:30 });
  const miniLocked = id => !!MINIS[id].price && !save.minisOwned.includes(id);
  const batXpFor = (m, coins) => Math.round(6 + (m.tier || 0) * 5 + Math.sqrt(Math.max(0, coins)) * 1.5);


  function startMini(id) {
    if (miniLocked(id)) { toMinis(); return; }
    lastMode = id; curId = id; cur = MINIS[id]; cur.init(); doubleUsed = false; sceneFade = .35; hudLast = null;
    state = 'mini'; paused = false; resumeT = 0; clearWorld(); shake = 0;
    if (save.pet.sleeping) save.pet.sleeping = false;
    for (const k in keys) keys[k] = false;
    ptr.has = false;
    show(null); cv.focus({ preventScroll:true });
  }
  function endMini(s) {
    if (state !== 'mini') return;
    state = 'miniover'; updateBar();
    const m = MINIS[curId], prev = save.mini[curId] || 0, coins = Math.round(m.reward(s) * coinMult());
    save.mini[curId] = Math.max(prev, s); save.coins += coins; save.stats.earned += coins; save.stats.minis++;
    track('minis', 1); addPassXP(15); addTokens('mini', 2); logEvent('mini_end', { game:curId, score:s });
    shareText = `I scored ${s} in ${m.name} on Cave Flap!`;
    if (curId === 'moths') track('moths', s);
    if (curId === 'echo') track('echo', s);
    if (curId === 'hop') track('hop', s);
    if (curId === 'whack') track('whack', s);
    if (curId === 'pairs' && MINIS.pairs.pairs === 8) track('pairsWin', 1);
    petDrain(2, 1, 1, 8);
    const bxp = batXpFor(m, coins); petXP(bxp);
    persist(); pushSave(); pushScore(); refreshDots();
    $('#againBtn').textContent = 'Play again';
    $('#reviveRow').style.display = 'none';
    lastEarned = coins;
    const extra = curId === 'pairs' ? ['Pairs', MINIS.pairs.pairs + '/8'] : [m.statLabel, s];
    fillOver(curId === 'whack' || curId === 'pairs' ? 'Time’s up' : 'Game over', s,
      s > prev && s > 0 ? 'New best!' : 'Best ' + save.mini[curId],
      [['Best', save.mini[curId]], extra, ['Crystals', '+' + coins]],
      `+${bxp} bat XP.` + (petHappy() ? ` Happy bat bonus: +${happyPct()}% crystals.` : ''));
    if (curId === 'pairs' && MINIS.pairs.pairs === 8) $('#oTitle').textContent = 'All matched';
  }
  function toMinis() { state = 'menu'; paused = false; cur = null; bat = newBat(); clearWorld(); refreshUI(); renderMinis(); show('minis'); }

  function renderMinis() {
    const list = $('#miniList'); list.textContent = '';
    for (const [id, m] of Object.entries(MINIS)) {
      const card = document.createElement('div'); card.className = 'mcard';
      const ic = document.createElement('div'); ic.className = 'micon'; ic.textContent = m.icon;
      const mid = document.createElement('div'); mid.className = 'mmid';
      const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = m.name;
      const ds = document.createElement('div'); ds.className = 'mdesc'; ds.textContent = m.desc;
      const bs = document.createElement('div'); bs.className = 'mbest';
      const locked = miniLocked(id);
      bs.textContent = locked ? `Earns about ${m.pay} crystals a game` : `Best ${save.mini[id] || 0}. Earns about ${m.pay} crystals a game`;
      mid.append(nm, ds, bs);
      const b = document.createElement('button'); b.className = 'btn small';
      if (locked) {
        ic.textContent = '🔒';
        const ll = document.createElement('div'); ll.className = 'lockline' + (save.player.lvl >= m.req ? ' ok' : '');
        ll.textContent = `Needs player level ${m.req} (yours: ${save.player.lvl})`;
        mid.appendChild(ll);
        priceBtn(b, m.price.toLocaleString());
        let armed = false, armT = null;
        b.addEventListener('click', () => {
          if (save.player.lvl < m.req) { sfx('deny'); return toast(`Needs player level ${m.req}`); }
          if (save.coins < m.price) return needMore('crystals');
          if (!armed) { armed = true; sfx('click'); b.textContent = 'Tap to buy'; armT = setTimeout(() => { armed = false; priceBtn(b, m.price.toLocaleString()); }, 2500); return; }
          clearTimeout(armT);
          save.coins -= m.price; save.minisOwned = [...save.minisOwned, id];
          sfx('buy'); vib(40); toast(`${m.name} unlocked`);
          persist(); pushSave(); refreshUI(); renderMinis();
        });
      } else {
        b.textContent = 'Play';
        b.addEventListener('click', () => { sfx('click'); startMini(id); });
      }
      card.append(ic, mid, b); list.appendChild(card);
    }
  }

  // ---------- pet care ----------
  const RATES = { hunger:4, fun:3, clean:2, energy:2.5 };
  const BAR_COL = { hunger:'#ffb347', energy:'#6fc8ff', fun:'#ff6fa8', clean:'#7dffb0', health:'#ff8fa3' };
  const BATX = W / 2, BATY = 330;
  let homeAnim = { kind:null, t:0 }, bathMode = false, bathGain = 0, bubbles = [], hparts = [], petCd = 0, zzzT = 0, homeUiT = 0, foodFly = null, petSaveT = 0;

  function petApply(hours) {
    const p = save.pet;
    p.hunger = clamp(p.hunger - RATES.hunger * (1 - careLvl('food') * .08) * hours, 0, 100);
    p.fun = clamp(p.fun - RATES.fun * (1 - careLvl('fun') * .08 - gearBonus('fun') / 100) * hours, 0, 100);
    p.clean = clamp(p.clean - RATES.clean * (1 - careLvl('clean') * .08) * hours, 0, 100);
    p.energy = clamp(p.energy + (p.sleeping ? 50 * (1 + careLvl('sleep') * .25) : -RATES.energy * (1 - careLvl('sleep') * .06)) * hours, 0, 100);
    p.health = clamp(p.health + (p.sleeping ? 40 : 8) * hours, 0, 100);
  }
  function applyOffline() { const p = save.pet, now = Date.now(); petApply(clamp((now - p.t) / 3.6e6, 0, 72)); p.t = now; }
  function petTick(dt) {
    const p = save.pet;
    petApply(dt / 3600);
    if (p.sleeping) {
      p.energy = clamp(p.energy + 1.5 * (1 + careLvl('sleep') * .25) * dt, 0, 100);
      p.health = clamp(p.health + dt, 0, 100);
      if (p.energy >= 100) {
        p.sleeping = false; petXP(5);
        if (state === 'home') { floaters.push({ x:BATX, y:230, text:'Fully rested', life:1.4 }); sfx('claim'); renderHome(); }
        persist(); pushSave();
      }
    }
    p.t = Date.now();
    petSaveT += dt;
    if (petSaveT > 20) { petSaveT = 0; try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} }
  }
  function petDrain(e, h, c, f) {
    const p = save.pet;
    p.energy = clamp(p.energy - e, 0, 100); p.hunger = clamp(p.hunger - h, 0, 100);
    p.clean = clamp(p.clean - c, 0, 100); p.fun = clamp(p.fun + f, 0, 100);
  }
  function petHappy() { const p = save.pet; return p.hunger >= 60 && p.energy >= 60 && p.fun >= 60 && p.clean >= 60; }
  function petLow() { const p = save.pet; return Math.min(p.hunger, p.energy, p.fun, p.clean, p.health) < 30; }
  function petMood() {
    const p = save.pet;
    if (p.sleeping) return 'sleep';
    if ((homeAnim.t > 0 && homeAnim.kind === 'pet') || toyPlay) return 'happy';
    return Math.min(p.hunger, p.energy, p.fun, p.clean, p.health) < 25 ? 'sad' : undefined;
  }
  // Each evolution makes its 10 levels a bit slower to fill than the last bat's.
  const xpNeed = l => Math.round((30 + 25 * (l - 1) + 6 * (l - 1) * (l - 1)) * (1 + (save ? save.evo : 0) * .25));
  function evolve() {
    if (save.evo >= CHAIN.length - 1) return false;
    const wearingChain = CHAIN.includes(save.bat);
    save.evo++;
    const id = CHAIN[save.evo];
    if (!save.bats.includes(id)) save.bats = [...save.bats, id];
    if (!save.outfits[id]) save.outfits[id] = blankOutfit();
    if (wearingChain) { save.bat = id; save.gear = save.outfits[id]; }
    save.pet.lvl = 1; save.pet.xp = 0;
    logEvent('evolve', { bat:id, step:save.evo });
    persist(); pushSave();
    return true;
  }
  function showBatPopup(id, evolved) {
    const sk = skinOf(id), bt = BATTLE[id] || BATTLE.night, last = save.evo >= CHAIN.length - 1;
    save.evoSeen = Math.max(save.evoSeen, CHAIN.indexOf(id)); persist();
    evoShown = id;
    $('#evoKicker').textContent = sk.exclusive ? 'New exclusive bat!' : evolved ? 'Your bat evolved!' : 'Meet your bat';
    $('#evoName').textContent = sk.name;
    $('#evoPower').textContent = `${(1 + (bt.atk - 1) * .5).toFixed(2)}×`;
    $('#evoCrys').textContent = `+${batBonus(id)}%`;
    $('#evoAt').textContent = sk.exclusive || last ? '—' : 'Lv ' + EVOLVE_AT;
    $('#evoSpec').textContent = `${bt.sp}: ${bt.spd.charAt(0).toLowerCase() + bt.spd.slice(1)}.`;
    $('#evoNext').textContent = sk.exclusive ? 'Exclusive bats keep your current bat level.' : last ? 'This is the final evolution. Level it as high as you like.' : `${evolved ? 'Bat level reset to 1. ' : ''}Evolves into ${skinOf(CHAIN[CHAIN.indexOf(id) + 1]).name} at level ${EVOLVE_AT}.`;
    sfx('claim'); show('evolve');
  }
  let evoShown = null;
  function petXP(n) {
    const p = save.pet; p.xp += Math.round(n * (1 + gearBonus('xp') / 100));
    while (p.xp >= xpNeed(p.lvl)) {
      p.xp -= xpNeed(p.lvl); p.lvl++; save.batLevels++;
      const r = 15 * p.lvl; save.coins += r; save.stats.earned += r;
      if (p.lvl >= EVOLVE_AT && evolve()) { sfx('medal'); vib([60, 40, 120]); pushScore(); if (state === 'home' || state === 'menu') setTimeout(() => showBatPopup(save.bat, true), 400); break; }
      if (state === 'home') banner = { text:'Bat level ' + p.lvl, sub:'+' + r + ' crystals', life:2.2 };
      else toast(`Bat level ${p.lvl}! +${r} crystals`);
      sfx('level'); vib(60); pushScore();
    }
  }

  function enterHome() {
    state = 'home'; paused = false; cur = null; clearWorld(); bathMode = false; bubbles = []; hparts = []; foodFly = null;
    $('#foodTray').classList.remove('on');
    $('#toyTray').classList.remove('on'); toyPlay = null;
    renderTray(); renderHome(); show('home');
  }
  function renderHome() {
    const p = save.pet;
    const bars = { hunger:'#bHunger', energy:'#bEnergy', fun:'#bFun', clean:'#bClean', health:'#bHealth' };
    for (const k in bars) { const el = $(bars[k]); el.style.width = p[k] + '%'; el.style.background = p[k] < 30 ? '#ff5c6c' : BAR_COL[k]; }
    $('#petLvl').textContent = 'Bat level ' + p.lvl;
    $('#petXp').style.width = Math.min(100, p.xp / xpNeed(p.lvl) * 100) + '%';
    $$('.coinCount').forEach(e => tweenNum(e, save.coins));
    $$('.medalCount').forEach(e => tweenNum(e, save.medals));
    const lowest = Object.keys(bars).reduce((a, b) => p[a] <= p[b] ? a : b);
    const tips = { hunger:'Your bat is hungry. Tap Feed.', energy:'Your bat is tired. Put it to sleep.', fun:'Your bat is bored. Tap it to play, or play a minigame.', clean:'Your bat is dirty. Give it a bath.', health:'Your bat is hurt from battle. Let it sleep or feed it a Healing Herb.' };
    $('#petHint').textContent = p.sleeping ? 'Sleeping. Energy refills fast while you wait.'
      : bathMode ? 'Rub your bat to scrub it clean.'
      : petHappy() ? `Happy bat: +${happyPct()}% crystals in every game. Tap it for a cuddle.`
      : p[lowest] < 60 ? tips[lowest] + ` Keep every bar above 60% for +${happyPct()}% crystals.` : 'Tap your bat to play with it.';
    $('#sleepBtn').textContent = p.sleeping ? 'Wake' : 'Sleep';
    $('#bathBtn').textContent = bathMode ? 'Done' : 'Bath';
    $('#feedBtn').disabled = p.sleeping; $('#bathBtn').disabled = p.sleeping;
    $$('#foodTray .food').forEach(b => { b.disabled = p.sleeping; });
  }
  function renderTray() {
    const tray = $('#foodTray'); tray.textContent = '';
    for (const f of FOODS) {
      const b = document.createElement('button'); b.className = 'food'; b.dataset.price = f.price;
      b.setAttribute('aria-label', `${f.name}, ${f.price} crystals`);
      const i = document.createElement('span'); i.className = 'fi'; i.textContent = f.icon;
      const pr = document.createElement('span'); pr.innerHTML = '<i class="gem"></i> '; pr.append(String(f.price));
      b.append(i, pr); b.addEventListener('click', () => feed(f)); tray.appendChild(b);
    }
  }
  function feed(f) {
    const p = save.pet;
    if (p.sleeping || foodFly) return;
    if (f.heal ? (p.health >= 99 && p.hunger >= 97) : p.hunger >= 97) { floaters.push({ x:BATX, y:250, text:f.heal ? 'Already healthy' : 'Too full', life:1 }); sfx('deny'); return; }
    if (save.coins < f.price) return needMore('crystals');
    save.coins -= f.price;
    foodFly = { f, t:0 };
    sfx('click');
    renderHome();
  }
  function finishFeed(f) {
    const p = save.pet;
    p.hunger = clamp(p.hunger + f.hunger, 0, 100); p.fun = clamp(p.fun + f.fun, 0, 100); p.health = clamp(p.health + (f.heal || 0), 0, 100);
    save.stats.fed++; track('feed', 1); petXP(5); addTokens('care', 1);
    homeAnim = { kind:'eat', t:.6 }; sfx('eat'); vib(15);
    floaters.push({ x:BATX + 40, y:BATY - 70, text:f.heal ? '+' + f.heal + ' health' : '+' + f.hunger + ' food', life:1 });
    persist(); pushSave(); renderHome(); refreshDots();
  }
  function toggleBath() {
    if (save.pet.sleeping) return;
    if (!bathMode) { bathMode = true; bathGain = 0; $('#foodTray').classList.remove('on'); sfx('bubble'); }
    else finishBath();
    renderHome();
  }
  function finishBath() {
    bathMode = false;
    if (bathGain >= 15) { save.stats.baths++; track('bath', 1); petXP(3); addTokens('care', 1); sfx('claim'); floaters.push({ x:BATX, y:BATY - 80, text:'Squeaky clean', life:1.2 }); }
    persist(); pushSave(); renderHome(); refreshDots();
  }
  function scrub(x, y) {
    const p = save.pet;
    if (Math.hypot(x - BATX, y - BATY) > 80) return;
    const sc = .9 * (1 + careLvl('clean') * .2); p.clean = clamp(p.clean + sc, 0, 100); bathGain += sc;
    bubbles.push({ x:x + (Math.random() - .5) * 20, y:y + (Math.random() - .5) * 20, r:3 + Math.random() * 7, life:1.3, vy:-20 - Math.random() * 20 });
    if (Math.random() < .25) sfx('bubble');
    if (p.clean >= 100) finishBath();
  }
  function toggleSleep() {
    const p = save.pet;
    p.sleeping = !p.sleeping; bathMode = false; $('#foodTray').classList.remove('on');
    sfx(p.sleeping ? 'click' : 'giggle'); persist(); pushSave(); renderHome();
  }
  function homeDown(x, y) {
    const p = save.pet;
    if (bathMode) { scrub(x, y); return; }
    const hy = p.sleeping ? 262 : BATY;
    if (Math.hypot(x - BATX, y - hy) > 75) return;
    if (p.sleeping) { floaters.push({ x:BATX + 30, y:hy - 40, text:'Zzz', life:.8 }); return; }
    if (petCd > 0) return;
    petCd = .22; p.fun = clamp(p.fun + 3 + Math.ceil(careLvl('fun') / 2), 0, 100); save.stats.pets++;
    if (save.stats.pets % 5 === 0) petXP(1);
    homeAnim = { kind:'pet', t:.35 }; sfx('giggle'); vib(10);
    for (let i = 0; i < 3; i++) hparts.push({ x:x + (Math.random() - .5) * 30, y:y - 10, vy:-50 - Math.random() * 40, vx:(Math.random() - .5) * 40, r:4 + Math.random() * 3, life:1, max:1, c:'#ff6fa8', shape:'heart' });
    renderHome();
  }
  // ---------- toys ----------
  const TOYS = [
    { id:'ball',  icon:'⚽', name:'Bouncy ball',  price:0,    fun:12, cd:30 },
    { id:'plush', icon:'🧸', name:'Moth plushie', price:400,  fun:22, cd:45 },
    { id:'yoyo',  icon:'🪀', name:'Glow yo-yo',   price:900,  fun:30, cd:60 },
    { id:'kite',  icon:'🪁', name:'Tiny kite',    price:1600, fun:40, cd:75 },
  ];
  let toyPlay = null;
  function renderToys() {
    const tray = $('#toyTray'); tray.textContent = '';
    for (const ty of TOYS) {
      const owned = !ty.price || save.toys.includes(ty.id), cd = Math.max(0, Math.ceil(((save.toyCd[ty.id] || 0) - Date.now()) / 1000));
      const b = document.createElement('button'); b.className = 'food';
      const i = document.createElement('span'); i.className = 'fi'; i.textContent = ty.icon;
      const pr = document.createElement('span');
      if (!owned) { pr.innerHTML = '<i class="gem"></i> '; pr.append(ty.price.toLocaleString()); }
      else pr.textContent = cd ? `${cd}s` : `+${ty.fun} fun`;
      b.setAttribute('aria-label', `${ty.name}${owned ? '' : ', ' + ty.price + ' crystals'}`);
      b.disabled = save.pet.sleeping || (owned && cd > 0);
      b.append(i, pr); b.addEventListener('click', () => useToy(ty)); tray.appendChild(b);
    }
  }
  function useToy(ty) {
    if (save.pet.sleeping || toyPlay) return;
    if (ty.price && !save.toys.includes(ty.id)) {
      if (save.coins < ty.price) return needMore('crystals');
      save.coins -= ty.price; save.toys = [...save.toys, ty.id]; sfx('buy'); toast(`${ty.name} bought!`); persist(); pushSave(); refreshUI(); renderToys(); return;
    }
    if ((save.toyCd[ty.id] || 0) > Date.now()) return;
    save.toyCd[ty.id] = Date.now() + ty.cd * 1000;
    toyPlay = { ty, t:0, dur:2.6 };
    $('#toyTray').classList.remove('on'); sfx('giggle');
  }
  function finishToy() {
    const ty = toyPlay.ty; toyPlay = null;
    const p = save.pet; p.fun = clamp(p.fun + ty.fun, 0, 100);
    track('toy', 1); addTokens('care', 1); petXP(3); sfx('claim'); vib(20);
    floaters.push({ x:BATX + 40, y:BATY - 70, text:`+${ty.fun} fun`, life:1 });
    for (let i = 0; i < 6; i++) hparts.push({ x:BATX + (Math.random() - .5) * 60, y:BATY - 20, vy:-60 - Math.random() * 40, vx:(Math.random() - .5) * 50, r:4 + Math.random() * 3, life:1.1, max:1.1, c:'#ff6fa8', shape:'heart' });
    persist(); pushSave(); renderHome();
  }
  function homeUpdate(dt) {
    if (toyPlay) { toyPlay.t += dt; if (toyPlay.t >= toyPlay.dur) finishToy(); }
    dist += 10 * dt; petCd -= dt;
    if (homeAnim.t > 0) homeAnim.t -= dt;
    for (const b of bubbles) { b.life -= dt; b.y += b.vy * dt; }
    bubbles = bubbles.filter(b => b.life > 0);
    for (const h of hparts) { h.life -= dt; h.x += h.vx * dt; h.y += h.vy * dt; }
    hparts = hparts.filter(h => h.life > 0);
    if (foodFly) { foodFly.t += dt; if (foodFly.t >= .45) { const f = foodFly.f; foodFly = null; finishFeed(f); } }
    if (save.pet.sleeping) { zzzT -= dt; if (zzzT <= 0) { zzzT = 1.1; floaters.push({ x:BATX + 26 + Math.random() * 10, y:250, text:'z', life:1.3, size:14, c:'#f2e9ff' }); } }
    homeUiT -= dt; if (homeUiT <= 0) { homeUiT = .5; renderHome(); }
  }
  function drawHome(th, sk) {
    drawBg(ctx, th, W, dist, t);
    drawFloor(ctx, th, W, 0, t);
    const p = save.pet;
    if (p.sleeping) {
      ctx.fillStyle = th.rock; rr(ctx, BATX - 60, 196, 120, 16, 8); ctx.fill();
      ctx.fillStyle = th.hi; ctx.fillRect(BATX - 54, 196, 108, 3);
      ctx.strokeStyle = '#0a0918'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(BATX - 6, 212); ctx.lineTo(BATX - 5, 230); ctx.moveTo(BATX + 6, 212); ctx.lineTo(BATX + 5, 230); ctx.stroke();
      ctx.save(); ctx.translate(BATX, 262 + Math.sin(t * 1.2) * 1.5); ctx.scale(2.6, 2.6);
      drawBat(ctx, 0, 0, Math.PI, sk, t, 0, false, { mood:'sleep', noHalo:true }); ctx.restore();
      ctx.fillStyle = 'rgba(4,3,20,.45)'; ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.beginPath(); ctx.ellipse(BATX, 440, 46, 9, 0, 0, Math.PI * 2); ctx.fill();
      let sy = 1;
      if (homeAnim.t > 0 && homeAnim.kind === 'eat') sy = 1 + Math.sin(homeAnim.t * 30) * .08;
      if (homeAnim.t > 0 && homeAnim.kind === 'pet') sy = 1 - Math.sin(homeAnim.t / .35 * Math.PI) * .12;
      const y = BATY + Math.sin(t * 2) * 6;
      ctx.save(); ctx.translate(BATX, y); ctx.scale(3, 3 * sy);
      drawBat(ctx, 0, 0, 0, sk, t, toyPlay ? 26 : bathMode ? 4 : 10, false, { mood:petMood() }); ctx.restore();
      if (toyPlay) {
        const k = toyPlay.t;
        ctx.font = '30px ' + EMOJI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(toyPlay.ty.icon, BATX + Math.cos(k * 4) * 80, BATY - 30 + Math.sin(k * 7) * 36 - Math.abs(Math.sin(k * 5)) * 20);
      }
      if (p.clean < 50) {
        const n = Math.ceil((50 - p.clean) / 8);
        ctx.fillStyle = 'rgba(110,80,40,.75)';
        for (let i = 0; i < n; i++) { ctx.beginPath(); ctx.arc(BATX + (rnd(i + 1) - .5) * 50, y + (rnd(i + 20) - .3) * 50, 3 + rnd(i + 40) * 3, 0, Math.PI * 2); ctx.fill(); }
      }
      for (const b of bubbles) {
        ctx.globalAlpha = Math.min(1, b.life); ctx.fillStyle = 'rgba(255,255,255,.25)'; ctx.strokeStyle = 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      }
      ctx.globalAlpha = 1;
      if (foodFly) {
        const k = foodFly.t / .45, fx = BATX + (1 - k) * 40, fy = (FLOOR - 16) + (BATY + 10 - (FLOOR - 16)) * k - Math.sin(k * Math.PI) * 60;
        ctx.font = '30px ' + EMOJI; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(foodFly.f.icon, fx, fy);
      }
    }
    for (const h of hparts) drawParticle(ctx, h, Math.max(0, h.life / h.max));
  }

  // ---------- store ----------
  let storeTab = 'bat', previews = [];
  function priceBtn(b, price) { b.innerHTML = '<i class="gem"></i> '; b.append(String(price)); }
  function denyShake(el, msg = 'Not enough crystals') { needMore(/medallion/i.test(msg) ? 'medals' : 'crystals', el); }
  // Short on a currency: say so, then jump straight to that currency's section of the Shop.
  let needPending = false;
  function needMore(kind, el) {
    sfx('deny');
    toast(kind === 'medals' ? 'Not enough medallions' : 'Not enough crystals');
    if (el) { el.classList.remove('shake'); void el.offsetWidth; el.classList.add('shake'); }
    if (needPending) return;
    needPending = true;
    setTimeout(() => { needPending = false; openShop(kind); }, 700);
  }
  function openShop(kind) {
    if (Q) cancelSearch();
    if (state === 'home' && bathMode) finishBath();
    if (state !== 'menu') { state = 'menu'; paused = false; cur = null; bat = newBat(); clearWorld(); }
    $('#foodTray').classList.remove('on');
    const already = $('#store').classList.contains('on');
    storeTab = 'shop'; refreshUI(); renderStore(); show('store');
    if (already) animIn($('#storeGrid'));
    const el = $(`#storeGrid [data-sec="${kind}"]`), sc = $('#store .scroll');
    if (el) setTimeout(() => sc.scrollTo({ top:el.offsetTop - sc.offsetTop - 4, behavior:'smooth' }), already ? 120 : 360);
  }
  function renderStore() {
    const grid = $('#storeGrid'); grid.textContent = ''; previews = [];
    $$('[data-store]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.store === storeTab)));
    if (storeTab === 'up') {
      grid.className = '';
      for (const u of UPGRADES) {
        const l = upLvl(u.id);
        const row = document.createElement('div'); row.className = 'mcard';
        const ic = document.createElement('div'); ic.className = 'micon'; ic.textContent = u.icon;
        const mid = document.createElement('div'); mid.className = 'mmid';
        const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = u.name;
        const ds = document.createElement('div'); ds.className = 'mdesc'; ds.textContent = l >= u.max ? u.desc(l) : `${u.desc(l)}. Next: ${u.desc(l + 1).toLowerCase()}`;
        const pips = document.createElement('div'); pips.className = 'pips';
        for (let i = 0; i < u.max; i++) { const p = document.createElement('i'); if (i < l) p.className = 'on'; pips.appendChild(p); }
        mid.append(nm, ds, pips);
        const b = document.createElement('button'); b.className = 'btn small';
        if (l >= u.max) { b.textContent = 'Maxed'; b.disabled = true; } else priceBtn(b, u.cost[l]);
        b.addEventListener('click', () => {
          const lv = upLvl(u.id); if (lv >= u.max) return;
          if (save.coins < u.cost[lv]) return denyShake(row);
          save.coins -= u.cost[lv]; save.up[u.id] = lv + 1; sfx('buy'); vib(20);
          persist(); pushSave(); refreshUI(); renderStore();
        });
        row.append(ic, mid, b); grid.appendChild(row);
      }
      return;
    }
    if (storeTab === 'shop') { renderShop(grid); return; }
    grid.className = 'grid';
    const items = storeTab === 'bat' ? SKINS : storeTab === 'cave' ? CAVES : storeTab === 'color' ? GEM_COLORS
      : [...GEAR.filter(g => g.only === save.bat), ...GEAR.filter(g => !g.only && (!g.event || save.gearOwned.includes(g.id)))];
    if (storeTab === 'gear') {
      const n = document.createElement('div'); n.className = 'gd'; n.style.gridColumn = '1 / -1'; n.style.textAlign = 'center';
      n.textContent = `Outfit for ${skinOf(save.bat).name}. Every bat keeps its own outfit, and the first two items only fit this bat.`;
      grid.appendChild(n);
    }
    for (const it of items) {
      let owned, eq;
      if (storeTab === 'gear') { owned = save.gearOwned.includes(it.id); eq = save.gear[it.slot] === it.id; }
      else if (storeTab === 'color') { owned = save.gemColors.includes(it.id); eq = save.gemColor === it.id; }
      else { const ok = storeTab === 'bat' ? 'bats' : 'caves'; owned = save[ok].includes(it.id); eq = save[storeTab] === it.id; }
      const ci = storeTab === 'bat' ? CHAIN.indexOf(it.id) : -1;
      const card = document.createElement('div'); card.className = 'card' + (eq ? ' eq' : '');
      const c = document.createElement('canvas'); card.appendChild(c);
      const meta = document.createElement('div'); meta.className = 'meta';
      const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = it.name;
      meta.appendChild(nm);
      if (storeTab === 'gear') { const sl = document.createElement('div'); sl.className = 'sub'; sl.textContent = `${it.only ? 'Exclusive ' + SLOTS[it.slot].toLowerCase() : SLOTS[it.slot]}. Bonus: ${it.btxt}`; meta.appendChild(sl); }
      if (storeTab === 'bat') { const bt = BATTLE[it.id]; const sl = document.createElement('div'); sl.className = 'sub'; sl.textContent = `${it.exclusive ? 'Medallion exclusive. ' : `Evolution ${CHAIN.indexOf(it.id) + 1}. `}+${batBonus(it.id)}% crystals. Power ${(1 + (bt.atk - 1) * .5).toFixed(2)}×, ${bt.sp}`; meta.appendChild(sl); }
      const b = document.createElement('button'); b.className = 'btn small' + (owned ? ' ghost' : '');
      if (ci >= 0) {
        b.className = 'btn small ghost';
        if (ci === save.evo) { b.textContent = eq ? 'Your bat' : 'Use'; b.disabled = eq; }
        else if (ci < save.evo) { b.textContent = 'Evolved'; b.disabled = true; }
        else { b.textContent = ci === save.evo + 1 ? `Evolves at Lv ${EVOLVE_AT}` : '🔒 Evolve to unlock'; b.disabled = true; card.style.opacity = '.7'; }
      }
      else if (storeTab === 'gear' && eq) b.textContent = 'Remove';
      else if (eq) { b.textContent = 'Equipped'; b.disabled = true; }
      else if (owned) b.textContent = 'Equip';
      else if (it.medals) medalBtn(b, it.medals.toLocaleString());
      else priceBtn(b, it.price.toLocaleString());
      b.addEventListener('click', () => buy(it, card));
      meta.appendChild(b); card.appendChild(meta); grid.appendChild(card);
      previews.push({ c, it, kind:storeTab });
    }
  }
  function buy(it, card) {
    if (storeTab === 'gear') {
      if (it.only && it.only !== save.bat) return;
      if (save.gearOwned.includes(it.id)) { save.gear[it.slot] = save.gear[it.slot] === it.id ? null : it.id; sfx('click'); }
      else if (it.medals ? save.medals >= it.medals : save.coins >= it.price) {
        if (it.medals) save.medals -= it.medals; else save.coins -= it.price;
        save.gearOwned = [...save.gearOwned, it.id]; save.gear[it.slot] = it.id; sfx('buy'); vib(20);
      } else return denyShake(card, it.medals ? 'Not enough medallions' : 'Not enough crystals');
    } else if (storeTab === 'color') {
      if (save.gemColors.includes(it.id)) { save.gemColor = it.id; sfx('click'); }
      else if (save.coins >= it.price) { save.coins -= it.price; save.gemColors = [...save.gemColors, it.id]; save.gemColor = it.id; sfx('buy'); vib(20); }
      else return denyShake(card);
      applyGemCss();
    } else {
      const ok = storeTab === 'bat' ? 'bats' : 'caves';
      if (storeTab === 'bat' && CHAIN.includes(it.id)) { if (CHAIN.indexOf(it.id) !== save.evo) return; save.bat = it.id; save.gear = save.outfits[it.id] || (save.outfits[it.id] = blankOutfit()); sfx('click'); persist(); pushSave(); refreshUI(); renderStore(); return; }
      const fresh = !save[ok].includes(it.id);
      if (save[ok].includes(it.id)) { save[storeTab] = it.id; sfx('click'); }
      else if (it.medals ? save.medals >= it.medals : save.coins >= it.price) {
        if (it.medals) save.medals -= it.medals; else save.coins -= it.price;
        save[ok] = [...save[ok], it.id]; save[storeTab] = it.id; sfx('buy'); vib(20);
      } else return denyShake(card, it.medals ? 'Not enough medallions' : 'Not enough crystals');
      if (storeTab === 'bat') { if (!save.outfits[it.id]) save.outfits[it.id] = blankOutfit(); save.gear = save.outfits[it.id]; if (fresh) setTimeout(() => showBatPopup(it.id, false), 300); }
    }
    persist(); pushSave(); refreshUI(); renderStore();
  }
  function drawPreviews() {
    const dpr = DPR();
    for (const { c, it, kind } of previews) {
      const cw = c.clientWidth, ch = c.clientHeight; if (!cw) continue;
      if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
      const g = c.getContext('2d');
      if (kind === 'cave') {
        const s = ch / 420, w = cw / s;
        g.setTransform(dpr * s, 0, 0, dpr * s, 0, 0); g.translate(0, -220);
        drawBg(g, it, w, t * 40, t);
        drawPillar(g, it, { x:w * .62, w:62, top:250, bot:420, seed:(it.price || 0) + 1 });
        drawFloor(g, it, w, t * 40, t);
        drawBat(g, w * .3, 340 + Math.sin(t * 3) * 6, 0, skinOf(save.bat), t, 16, false);
        continue;
      }
      if (kind === 'color') {
        const th = caveOf(save.cave), s = ch / 84, w = cw / s;
        g.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
        g.save(); g.translate(0, -270); drawBg(g, th, w, t * 30, t); g.restore();
        const c = gemCol(it.id);
        g.fillStyle = c; g.shadowColor = c; g.shadowBlur = 16;
        diamond(g, w / 2, 42 + Math.sin(t * 3) * 3, 11);
        diamond(g, w / 2 - 34, 52 + Math.sin(t * 3 + 1) * 3, 5); diamond(g, w / 2 + 34, 30 + Math.sin(t * 3 + 2) * 3, 5);
        g.shadowBlur = 0; continue;
      }
      const th = caveOf(save.cave), s = ch / 84, w = cw / s;
      g.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
      g.save(); g.translate(0, -270); drawBg(g, th, w, t * 30, t); g.restore();
      const sk = kind === 'bat' ? it : skinOf(save.bat);
      const gear = kind === 'gear' ? { ...save.gear, [it.slot]:it.id } : save.gear;
      const by = 46 + Math.sin(t * 3 + (it.price || it.medals || 0)) * 3;
      if (gear.trail) {
        const st = trailStyle(gear.trail, sk);
        for (let i = 0; i < 6; i++) {
          const ph = (t * 1.5 + i / 6) % 1;
          drawParticle(g, { x:w / 2 - 14 - ph * 40, y:by + 4 + Math.sin(i * 2.1 + t) * 5 - (st.up ? ph * 10 : 0), r:2.2 + rnd(i + 3) * 1.5 + (st.grow ? ph * 3 : 0), c:st.c(), shape:st.shape }, 1 - ph);
        }
      }
      drawBat(g, w / 2, by, 0, sk, t, 16, false, { gear });
    }
  }


  // ---------- battle ----------
  const BATTLE = {
    night:   { atk:1.00, sp:'Shadow Bite',   spd:'1.6× hit that heals 40% of the damage' },
    ember:   { atk:1.10, sp:'Flame Burst',   spd:'1.4× hit that burns for 3 turns' },
    frost:   { atk:1.18, sp:'Frost Fang',    spd:'1.4× hit that halves their next attack' },
    phantom: { atk:1.26, sp:'Vanish',        spd:'Dodge everything this turn and hit 1.3×' },
    gold:    { atk:1.35, sp:'Midas Touch',   spd:'1.6× hit that steals 2 energy' },
    neon:    { atk:1.45, sp:'Neon Pierce',   spd:'1.9× hit that ignores Guard' },
    prism:   { atk:1.55, sp:'Prism Beam',    spd:'Random 1.2× to 2.8× hit' },
    vampire: { atk:1.72, sp:'Blood Drain',   spd:'1.9× hit that heals 60% of the damage' },
    drake:   { atk:1.95, sp:'Obsidian Roar', spd:'2.4× hit that ignores Guard and burns' },
    storm:   { atk:1.62, sp:'Thunderclap',   spd:'1.8× hit that ignores Guard and halves their next attack' },
    coral:   { atk:1.66, sp:'Tidal Crash',   spd:'1.7× hit that heals 25% and halves their next attack' },
    bone:    { atk:1.80, sp:'Bone Shatter',  spd:'2.1× hit that ignores Guard' },
    solar:   { atk:1.86, sp:'Solar Burst',   spd:'2× hit that burns for 3 turns' },
    void:    { atk:2.05, sp:'Void Rift',     spd:'2.2× hit that ignores Guard and steals 2 energy' },
    nebula:  { atk:2.15, sp:'Starfall',      spd:'Random 1.6× to 3.2× hit' },
    titan:   { atk:2.25, sp:'Iron Crush',    spd:'2.6× hit that ignores Guard' },
    celestial:{ atk:2.45, sp:'Divine Light', spd:'2.4× hit that ignores Guard and heals 50%' },
    eclipse: { atk:2.70, sp:'Total Eclipse', spd:'2.8× hit that ignores Guard, burns and steals energy' },
  };
  const MOVES = { b:{ name:'Bite', cost:0 }, s:{ name:'Screech', cost:2 }, g:{ name:'Guard', cost:0 }, h:{ name:'Heal', cost:2 }, x:{ name:'Special', cost:3 } };
  const STAKES = [0];
  const BASE_DMG = 13, MAX_TURNS = 15, TURN_SECS = 20;
  // Level drives HP and part of the damage; a bat's price still helps, but half as much as before.
  const maxHpFor = (lvl, gear) => 80 + (lvl - 1) * 18 + gearBonus('hp', gear || {});
  const effAtk = (skin, lvl) => (1 + ((BATTLE[skin] || BATTLE.night).atk - 1) * .5) * (1 + (lvl - 1) * .04);
  const batWear = () => clamp((100 - save.pet.health) / 100, 0, 1);
  function myFighter() {
    const p = save.pet, max = maxHpFor(p.lvl, save.gear);
    return { uid:myUid || '', nick:save.nick || '', rating:save.rating, trophies:save.trophies, lvl:p.lvl, skin:save.bat, gear:{ ...save.gear }, max, hp:Math.max(1, Math.round(max * (.5 + .5 * p.health / 100))) };
  }
  function cleanFighter(f) {
    f = f && typeof f === 'object' ? f : {};
    const lvl = clamp(Math.floor(num(f.lvl, 1)), 1, 99);
    const gear = {};
    const skin = BATTLE[f.skin] ? f.skin : 'night';
    for (const sl of Object.keys(SLOTS)) { const it = GEAR.find(g => g.id === (f.gear && f.gear[sl])); gear[sl] = it && it.slot === sl && (!it.only || it.only === skin) ? it.id : null; }
    const max = maxHpFor(lvl, gear);
    return { uid:String(f.uid || '').slice(0, 80), nick:String(f.nick || '').slice(0, 16), rating:clamp(Math.round(num(f.rating, 1000)), 0, 5000), trophies:clamp(Math.round(num(f.trophies, 0)), 0, 99999), lvl, skin, gear, max, hp:clamp(Math.round(num(f.hp, max)), 1, max) };
  }
  function mkState(a, b) { return { f:[a, b].map(x => ({ ...x, start:x.hp, en:1, burn:0, burnT:0, chill:false })), turn:1, over:false, winner:-1 }; }
  function seeded(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = h << 13 | h >>> 19; }
    return () => { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); h ^= h >>> 16; return (h >>> 0) / 4294967296; };
  }
  const SPEC = {
    night:{ m:1.6, ls:.4 }, ember:{ m:1.4, burn:3 }, frost:{ m:1.4, chill:1 }, phantom:{ m:1.3, vanish:1 }, gold:{ m:1.6, steal:2 },
    neon:{ m:1.9, pierce:1 }, prism:{ rand:[1.2, 2.8] }, vampire:{ m:1.9, ls:.6 }, drake:{ m:2.4, pierce:1, burn:2 },
    storm:{ m:1.8, pierce:1, chill:1 }, coral:{ m:1.7, ls:.25, chill:1 }, bone:{ m:2.1, pierce:1 }, solar:{ m:2.0, burn:3 },
    void:{ m:2.2, pierce:1, steal:2 }, nebula:{ rand:[1.6, 3.2] }, titan:{ m:2.6, pierce:1 },
    celestial:{ m:2.4, pierce:1, ls:.5 }, eclipse:{ m:2.8, pierce:1, burn:3, steal:1 },
  };
  const specOf = sk => SPEC[sk] || SPEC.night;

  // Deterministic: both players run this with the same state, moves and seed and get the same result.
  function resolveTurn(S, mv, R) {
    const F = S.f, ev = [{}, {}];
    for (let i = 0; i < 2; i++) {
      let m = MOVES[mv[i]] ? mv[i] : 'g';
      if (F[i].en < MOVES[m].cost) m = 'b';
      mv[i] = m; F[i].en -= MOVES[m].cost; ev[i].move = m;
    }
    for (let i = 0; i < 2; i++) if (mv[i] === 'h') { const a = Math.min(F[i].max - F[i].hp, Math.round(F[i].max * .2)); F[i].hp += a; ev[i].heal = a; }
    const raw = [0, 0], pierce = [false, false], vanish = [false, false];
    for (let i = 0; i < 2; i++) {
      const a = F[i], m = mv[i];
      let mult = m === 'b' ? 1 : m === 's' ? 1.9 : 0;
      if (m === 'x') {
        const sp = specOf(a.skin);
        mult = sp.rand ? sp.rand[0] + R() * (sp.rand[1] - sp.rand[0]) : sp.m;
        if (sp.vanish) vanish[i] = true;
        if (sp.pierce) pierce[i] = true;
      }
      if (!mult) continue;
      let d = BASE_DMG * effAtk(a.skin, a.lvl) * (1 + gearBonus('dmg', a.gear) / 100) * mult * (.9 + R() * .2);
      if (R() < .08 + gearBonus('crit', a.gear) / 100) { d *= 1.5; ev[i].crit = true; }
      if (a.chill) { d *= .5; ev[i].chilled = true; }
      raw[i] = d;
    }
    for (let i = 0; i < 2; i++) F[i].chill = false;
    for (let i = 0; i < 2; i++) {
      if (!raw[i]) continue;
      const j = 1 - i; let d = raw[i];
      if (vanish[j]) { d = 0; ev[j].dodged = true; }
      else if (mv[j] === 'g' && !pierce[i]) { d *= .35; ev[j].guarded = true; }
      ev[i].dmg = Math.round(d);
    }
    for (let i = 0; i < 2; i++) if (ev[i].dmg) F[1 - i].hp -= ev[i].dmg;
    for (let i = 0; i < 2; i++) {
      if (mv[i] !== 'x') continue;
      const j = 1 - i, a = F[i], d = ev[i].dmg || 0;
      const sp = specOf(a.skin);
      if (sp.ls && d > 0) { const h = Math.max(0, Math.min(a.max - a.hp, Math.round(d * sp.ls))); a.hp += h; ev[i].heal = (ev[i].heal || 0) + h; }
      if (sp.burn && d > 0) { F[j].burn = Math.max(2, Math.round(F[j].max * .04)); F[j].burnT = sp.burn; ev[i].burn = true; }
      if (sp.chill && d > 0) { F[j].chill = true; ev[i].chill = true; }
      if (sp.steal && d > 0) { const st = Math.min(sp.steal, F[j].en); F[j].en -= st; a.en += st; ev[i].stole = st; }
    }
    for (let i = 0; i < 2; i++) if (F[i].burnT > 0) { F[i].hp -= F[i].burn; F[i].burnT--; ev[i].burnTick = F[i].burn; }
    for (let i = 0; i < 2; i++) F[i].en = Math.min(5, F[i].en + (mv[i] === 'g' ? 2 : 1));
    S.turn++;
    const dead = F.map(f => f.hp <= 0);
    if (dead[0] || dead[1] || S.turn > MAX_TURNS) {
      S.over = true;
      if (dead[0] && dead[1]) S.winner = F[0].hp === F[1].hp ? -1 : F[0].hp > F[1].hp ? 0 : 1;
      else if (dead[0]) S.winner = 1;
      else if (dead[1]) S.winner = 0;
      else { const a = F[0].hp / F[0].max, b = F[1].hp / F[1].max; S.winner = Math.abs(a - b) < .001 ? -1 : a > b ? 0 : 1; }
    }
    for (const f of F) f.hp = Math.max(0, f.hp);
    return ev;
  }

  // Training bot: reads the fight, but makes mistakes and hesitates on purpose.
  function botMove(S, me, mistake = .2) {
    const a = S.f[me], o = S.f[1 - me], atk = (BATTLE[a.skin] || BATTLE.night).atk, oAtk = (BATTLE[o.skin] || BATTLE.night).atk;
    const can = m => a.en >= MOVES[m].cost, rnd = Math.random;
    if (rnd() < mistake) { const all = ['b', 's', 'g', 'h', 'x'].filter(can); return all[Math.floor(rnd() * all.length)]; }
    const hit = m => BASE_DMG * atk * m * .9;
    const sp = specOf(a.skin);
    if (can('x') && hit(sp.rand ? sp.rand[0] : sp.m) >= o.hp) return 'x';
    if (can('s') && hit(1.9) >= o.hp) return 's';
    if (hit(1) >= o.hp) return 'b';
    const theirBurst = BASE_DMG * oAtk * (o.en >= 3 ? 2 : o.en >= 2 ? 1.9 : 1);
    if (a.hp / a.max < .35 && can('h') && rnd() < .65) return 'h';
    if (theirBurst >= a.hp && rnd() < .55) return a.skin === 'phantom' && can('x') ? 'x' : 'g';
    if (o.en >= 2 && rnd() < .22) return 'g';
    if (can('x') && rnd() < .6) return 'x';
    if (can('s') && rnd() < .5) return 's';
    if (a.en <= 1 && rnd() < .25) return 'g';
    return 'b';
  }

  let B = null, Q = null, arenaStake = 0;
  const isOpp = p => !p.isMe;
  function beginBattle(o) {
    B = { ...o, myMoves:[], oppMoves:[], anim:null, choice:null, turnT:TURN_SECS, waitT:0, goneT:0, dealt:0, taken:0, ended:false, log:['Choose your move.', ''], names:['', ''], confirmForfeit:0 };
    B.names[o.me] = save.nick || 'You';
    B.names[1 - o.me] = o.mode === 'bot' ? (o.S.f[1 - o.me].nick || 'Trail Bat') : (o.S.f[1 - o.me].nick || 'Opponent');
    if (o.mode === 'pvp' && user && B.S.f[1 - o.me].uid && !B.S.f[1 - o.me].nick) {
      const id = B.S.f[1 - o.me].uid, bb = B;
      user.profiles([id]).then(ps => { if (bb === B && ps && ps[id] && ps[id].name) B.names[1 - B.me] = ps[id].name.slice(0, 16); }).catch(() => {});
    }
    state = 'battle'; lastMode = 'battle'; paused = false; cur = null; clearWorld(); shake = 0;
    if (save.pet.sleeping) save.pet.sleeping = false;
    show('battleUi'); renderMoves();
  }
  // ---------- level trail: 10,000 bot battles, each a little harder ----------
  const TRAIL_MAX = 10000;
  const STAGE_NAMES = ['Cave Scout', 'Moth Hunter', 'Rock Biter', 'Echo Stalker', 'Night Glider', 'Shadow Wing', 'Crystal Fang', 'Storm Chaser', 'Dusk Raider'];
  const BOSS_NAMES = ['Cave Warden', 'Magma King', 'Frost Queen', 'Void Lord', 'Ancient Drake', 'Eclipse Tyrant'];
  const stageLvl = n => Math.max(1, Math.round(n * .12 + Math.sqrt(n) - .5));
  function stageBot(n) {
    const boss = n % 10 === 0, R = seeded('stage' + n), lvl = stageLvl(n);
    const skin = SKINS[Math.min(SKINS.length - 1, Math.floor(n / 12))].id;
    const gear = {};
    for (const sl of Object.keys(SLOTS)) { const opts = GEAR.filter(g => g.slot === sl && !g.event && (!g.only || g.only === skin)); gear[sl] = R() < Math.min(.9, .15 + n * .004) ? opts[Math.floor(R() * opts.length)].id : null; }
    const max = Math.round(maxHpFor(lvl, gear) * (boss ? 1.25 : 1));
    const nick = boss ? BOSS_NAMES[(n / 10 - 1) % BOSS_NAMES.length] : STAGE_NAMES[(n - 1) % STAGE_NAMES.length];
    return { uid:'bot', nick, lvl, skin, gear, max, hp:max, boss, mistake:Math.max(.03, .35 - n * .003) };
  }
  function stageReward(n) {
    if (n % 100 === 0) return { medals:3 + Math.floor(n / 1000), tokens:30 };
    if (n % 50 === 0) return { tokens:20 };
    if (n % 10 === 0) return { medals:1 };
    return { coins:Math.round(15 + n * 1.5) };
  }
  const rewardText = r => [r.coins ? `${r.coins.toLocaleString()} crystals` : '', r.medals ? `${r.medals} medallion${r.medals > 1 ? 's' : ''}` : '', r.tokens ? `${r.tokens} tokens` : ''].filter(Boolean).join(' + ');
  let stagePlaying = 1;
  function startStage(n) {
    n = clamp(n || save.stage, 1, Math.min(TRAIL_MAX, save.stage));
    if (save.pet.health < 15) { sfx('deny'); return toast('Your bat is too hurt. Let it rest first.'); }
    const bot = stageBot(n); stagePlaying = n;
    beginBattle({ mode:'bot', S:mkState(myFighter(), bot), me:0, stake:0, id:'stage' + n + '-' + Date.now(), mistake:bot.mistake, stage:n });
    toast(`Level ${n}${bot.boss ? ': boss battle!' : ''}`);
  }
  const startTraining = () => startStage(save.stage);
  function openTrail() { state = 'menu'; cur = null; clearWorld(); refreshUI(); renderTrail(); show('trail'); }
  function renderTrail() {
    const head = $('#trailHead'), body = $('#trailBody'); head.textContent = ''; body.textContent = '';
    const cur = Math.min(save.stage, TRAIL_MAX), done = save.stage > TRAIL_MAX;
    const ban = document.createElement('div'); ban.className = 'pbanner';
    const rib = document.createElement('div'); rib.className = 'pribbon'; rib.textContent = done ? 'Trail complete!' : `Level ${cur.toLocaleString()}`;
    const prog = document.createElement('div'); prog.className = 'pprog';
    const st = document.createElement('span'); st.className = 'pstar'; st.textContent = '🗺️';
    const bar = document.createElement('div'); bar.className = 'pbar'; const bi = document.createElement('i');
    const cleared = save.stage - 1, into = cleared % 10;
    const lab = document.createElement('span'); lab.textContent = `${cleared.toLocaleString()} / ${TRAIL_MAX.toLocaleString()} cleared`;
    bar.append(bi, lab); prog.append(st, bar);
    const sub = document.createElement('div'); sub.className = 'gd'; sub.style.cssText = 'position:relative;margin-top:.5em';
    sub.textContent = done ? 'You beat all 10,000 levels.' : `Next boss at level ${Math.ceil(cur / 10) * 10}. Every level is a bit tougher than the last.`;
    ban.append(rib, prog, sub); head.appendChild(ban);
    requestAnimationFrame(() => { bi.style.width = Math.max(2, into * 10) + '%'; });
    const track = document.createElement('div'); track.className = 'ptrack';
    const cols = document.createElement('div'); cols.className = 'pcols2';
    const c1 = document.createElement('div'); c1.className = 'pticket'; c1.textContent = 'Enemy';
    const c2 = document.createElement('div'); c2.className = 'pticket prem'; c2.textContent = 'First clear';
    cols.append(c1, document.createElement('span'), c2);
    const line = document.createElement('div'); line.className = 'pline'; const lf = document.createElement('i'); line.appendChild(lf);
    track.append(line, cols);
    const from = Math.max(1, cur - 4), to = Math.min(TRAIL_MAX, from + 29), rows = [];
    for (let n = from; n <= to; n++) {
      const bot = stageBot(n), r = stageReward(n), beaten = n < save.stage, isCur = n === save.stage;
      const row = document.createElement('div'); row.className = 'prow2';
      const lt = document.createElement('button'); lt.className = 'ptile ' + (bot.boss ? 'prem big' : 'free') + (isCur ? ' ready' : '');
      const li = document.createElement('span'); li.className = 'ico'; li.textContent = bot.boss ? '👑' : '⚔️';
      const la = document.createElement('span'); la.className = 'amt'; la.textContent = 'Lv ' + bot.lvl;
      lt.append(li, la);
      if (isCur) { const cl = document.createElement('span'); cl.className = 'cl'; cl.textContent = 'Play'; lt.appendChild(cl); }
      else if (beaten) { const cl = document.createElement('span'); cl.className = 'cl'; cl.style.background = '#3a4ab8'; cl.style.borderColor = '#121a5c'; cl.textContent = 'Replay'; lt.appendChild(cl); }
      else { const lk = document.createElement('span'); lk.className = 'lk'; lk.textContent = '🔒'; lt.appendChild(lk); }
      lt.setAttribute('aria-label', `Level ${n}: ${bot.nick}, bat level ${bot.lvl}${bot.boss ? ', boss' : ''}`);
      lt.addEventListener('click', () => { if (n > save.stage) { sfx('deny'); return toast(`Beat level ${save.stage} first`); } sfx('click'); startStage(n); });
      const nd = document.createElement('div'); nd.className = 'phex' + (beaten ? ' on' : ''); const nb = document.createElement('b'); nb.textContent = n; nb.style.fontSize = n >= 1000 ? '.5em' : n >= 100 ? '.62em' : '.78em'; nd.appendChild(nb);
      const rt = document.createElement('div'); rt.className = 'ptile prem' + (beaten ? ' done' : ''); rt.style.cursor = 'default';
      const ri = document.createElement('span'); ri.className = 'ico'; ri.innerHTML = r.medals ? '<i class="medal"></i>' : r.tokens ? '<i class="tok"></i>' : '<i class="gem"></i>';
      const ra = document.createElement('span'); ra.className = 'amt'; ra.textContent = (r.medals || r.tokens || r.coins).toLocaleString();
      rt.append(ri, ra); rt.title = rewardText(r);
      row.append(lt, nd, rt); track.appendChild(row); rows.push(row);
    }
    body.appendChild(track);
    const n = document.createElement('div'); n.className = 'note'; n.textContent = 'Each level pays its reward the first time you beat it. Replays pay a few crystals and bat XP. New clears also give 3 trophies, or 10 for a boss. Every 10th level is a boss with 25% more HP.'; body.appendChild(n);
    requestAnimationFrame(() => {
      const mid = r => r.offsetTop + r.offsetHeight / 2, top = mid(rows[0]), bottom = mid(rows[rows.length - 1]);
      line.style.top = (top - 14) + 'px'; line.style.height = (bottom - top + 28) + 'px';
      const idx = clamp(save.stage - from, 0, rows.length - 1), y = save.stage > to ? bottom + 14 : mid(rows[idx]);
      requestAnimationFrame(() => { lf.style.height = Math.max(0, y - (top - 14)) + 'px'; });
      body.scrollTop = Math.max(0, track.offsetTop - body.offsetTop + rows[Math.max(0, idx - 1)].offsetTop - 70);
    });
  }
  function renderMoves() {
    if (!B) return;
    const f = B.S.f[B.me], busy = !!(B.choice || B.anim || B.ended);
    $$('#bMoves .btn').forEach(btn => {
      const m = btn.dataset.mv, mvDef = MOVES[m];
      btn.disabled = busy || f.en < mvDef.cost;
      btn.classList.toggle('picked', B.choice === m);
    });
    $('#bSpecName').textContent = (BATTLE[f.skin] || BATTLE.night).sp;
  }
  function chooseMove(m) {
    if (!B || B.choice || B.anim || B.ended || state !== 'battle') return;
    const f = B.S.f[B.me];
    if (f.en < MOVES[m].cost) { sfx('deny'); return toast('Not enough energy'); }
    sfx('click'); B.choice = m; B.myMoves.push(m); B.waitT = 0;
    if (B.mode === 'bot') { B.oppMoves.push(botMove(B.S, 1 - B.me, B.mistake === undefined ? .2 : B.mistake)); setTimeout(() => { if (B && B.choice && !B.anim) playTurn(); }, 350); }
    else if (room) room.presence({ duel:{ id:B.id, role:B.me, moves:B.myMoves.join('') } }).catch(() => {});
    renderMoves();
  }
  function playTurn() {
    const n = B.S.turn, mv = [null, null];
    mv[B.me] = B.myMoves[n - 1]; mv[1 - B.me] = B.oppMoves[n - 1];
    const ev = resolveTurn(B.S, mv, seeded(B.id + ':' + n));
    const me = B.me, op = 1 - me;
    B.dealt += ev[me].dmg || 0; B.taken += (ev[op].dmg || 0) + (ev[me].burnTick || 0);
    const line = (i, who) => {
      const e = ev[i], nm = e.move === 'x' ? (BATTLE[B.S.f[i].skin] || BATTLE.night).sp : MOVES[e.move].name;
      let s = `${who} used ${nm}`;
      if (e.dmg !== undefined) s += e.dmg ? ` for ${e.dmg}` : ', but it missed';
      if (e.crit) s += ' (critical)';
      if (e.heal) s += `, healed ${e.heal}`;
      if (e.stole) s += `, stole ${e.stole} energy`;
      return s + '.';
    };
    B.log = [line(me, 'You'), line(op, B.names[op])];
    B.anim = { t:0, ev, mv, hit:false };
    B.choice = null; B.turnT = TURN_SECS;
    renderMoves();
  }
  function battleUpdate(dt) {
    if (!B) return;
    if (B.confirmForfeit > 0) { B.confirmForfeit -= dt; if (B.confirmForfeit <= 0) updateBar(); }
    if (B.anim) {
      const A = B.anim; A.t += dt;
      if (!A.hit && A.t >= .38) {
        A.hit = true;
        for (let i = 0; i < 2; i++) {
          const e = A.ev[i], pos = batPos(1 - i);
          if (e.dmg) { floaters.push({ x:pos.x, y:pos.y - 50, text:'-' + e.dmg, life:1, size:e.crit ? 26 : 20, c:e.crit ? '#ffcf5c' : '#ff6b7d' }); }
          else if (e.dmg === 0) floaters.push({ x:pos.x, y:pos.y - 50, text:A.ev[1 - i].dodged ? 'Dodged' : 'Blocked', life:.9, size:16, c:'#bfe6ff' });
          if (e.heal) { const p2 = batPos(i); floaters.push({ x:p2.x + 30, y:p2.y - 70, text:'+' + e.heal, life:1, size:18, c:'#7dffb0' }); }
        }
        const big = A.ev.some(e => e.crit) || (A.ev[1 - B.me].dmg || 0) > 20;
        if (A.ev[0].dmg || A.ev[1].dmg) { sfx(big ? 'hit' : 'score'); shake = big ? .3 : .15; vib(big ? 60 : 20); }
        else sfx('shield');
      }
      if (A.t >= 1.15) { B.anim = null; if (B.S.over) endBattle(); else renderMoves(); }
      return;
    }
    if (B.ended || B.mode !== 'pvp') return;
    const op = room ? room.peers().find(p => p.peer === B.oppPeer) : null;
    const d = op && op.presence && op.presence.duel;
    if (!op || !d || d.id !== B.id) { B.goneT += dt; if (B.goneT > 10) return forfeitWin('Your opponent left the battle.'); }
    else {
      B.goneT = 0;
      if (d.forfeit) return forfeitWin('Your opponent gave up.');
      const s = String(d.moves || '').slice(0, MAX_TURNS);
      if (/^[bsghx]*$/.test(s)) B.oppMoves = s.split('');
    }
    const n = B.S.turn;
    if (B.choice && B.oppMoves.length >= n) return playTurn();
    if (!B.choice) { B.turnT -= dt; if (B.turnT <= 0) { chooseMove('g'); toast('Time’s up, you guarded'); } }
    else { B.waitT += dt; if (B.waitT > 45) forfeitWin('Your opponent stopped responding.'); }
  }
  function forfeitWin(why) { if (!B || B.ended) return; B.S.over = true; B.S.winner = B.me; B.forfeitNote = why; endBattle(); }
  function forfeitBattle() {
    if (!B || B.ended) return;
    if (B.mode === 'pvp' && room) room.presence({ duel:{ id:B.id, role:B.me, moves:B.myMoves.join(''), forfeit:true } }).catch(() => {});
    B.S.over = true; B.S.winner = 1 - B.me; B.gaveUp = true; B.forfeitNote = 'You gave up.'; B.anim = null; endBattle();
  }
  function endBattle() {
    if (!B || B.ended) return;
    B.ended = true;
    const win = B.S.winner === B.me, draw = B.S.winner === -1, pvp = B.mode === 'pvp', f = B.S.f[B.me];
    const firstClear = !pvp && win && B.stage === save.stage && save.stage <= TRAIL_MAX, sr = firstClear ? stageReward(B.stage) : null;
    B.firstClear = firstClear && !B.gaveUp;
    const base = pvp ? (win ? 60 : draw ? 25 : 15) : firstClear ? (sr.coins || 10) : (win ? 5 : draw ? 3 : 2);
    const played = B.S.turn - 1, noPay = B.gaveUp || (pvp && played < 3);
    const coins = noPay ? 0 : Math.round(base * coinMult()), bxp = noPay ? 0 : pvp ? (win ? 30 : draw ? 18 : 12) : win ? 5 + Math.min(45, Math.floor((B.stage || 1) / 4)) : 3;
    let trailNote = '';
    if (firstClear && !noPay) {
      save.stage++;
      if (sr.medals) save.medals += sr.medals;
      if (sr.tokens) save.tokens += sr.tokens;
      trailNote = `Level ${B.stage} cleared! ${rewardText(sr)}.`;
      logEvent('stage_clear', { stage:B.stage });
    }
    save.coins += coins; save.stats.earned += coins;
    let medalNote = '';
    if (pvp && B.stake) {
      if (win) { save.medals += B.stake * 2; save.battle.mw += B.stake; if (B.stake >= 200) save.battle.big++; medalNote = `Won ${B.stake * 2} medallions.`; }
      else if (draw) { save.medals += B.stake; medalNote = `Draw: your ${B.stake} medallions were returned.`; }
      else { save.battle.ml += B.stake; medalNote = `Lost ${B.stake} medallions.`; }
    }
    const lost = Math.round(clamp((f.start - f.hp) / f.max, 0, 1) * (pvp ? 55 : 30));
    save.pet.health = clamp(save.pet.health - lost, 0, 100);
    petDrain(4, 2, 0, 6);
    const r = save.battle;
    if (pvp) { if (win) r.pw++; else if (draw) r.pd++; else r.pl++; } else { if (win) r.w++; else if (draw) r.d++; else r.l++; }
    if (win && !pvp) track('trainWin', 1);
    if (!noPay) { addPassXP(win ? 30 : 15); addTokens('battle', win ? 3 : 1); }
    let ratingNote = '';
    if (!noPay || pvp) {
      const before = save.trophies, delta = trophyDelta(pvp, win, draw, num(B.S.f[1 - B.me].trophies, save.trophies));
      applyTrophies(delta, pvp);
      const got = save.trophies - before;
      if (pvp) save.seasonGames++;
      if (got) ratingNote = `${got > 0 ? '+' : ''}${got} trophies (now ${save.trophies}).`;
    }
    lastBattleMode = B.mode;
    logEvent('battle_end', { mode:B.mode, win, draw, turns:B.S.turn - 1, stake:B.stake || 0 });
    shareText = win ? `My bat just won a battle in Cave Flap!` : `Tough battle in Cave Flap. Rematch?`;
    petXP(bxp);
    persist(); pushSave(); pushScore(); refreshUI();
    if (pvp && room) setTimeout(() => { if (!B || B.ended) room.presence({ duel:null }).catch(() => {}); }, 6000);
    state = 'battleover'; updateBar();
    sfx(win ? 'claim' : draw ? 'click' : 'deny'); vib(win ? [40, 60, 90] : 120);
    lastEarned = coins; doubleUsed = false;
    $('#againBtn').textContent = pvp ? 'New opponent' : win && B.stage && save.stage <= TRAIL_MAX ? `Next: level ${save.stage}` : 'Retry';
    $('#reviveRow').style.display = 'none';
    const rec = pvp ? `Online record ${r.pw}W ${r.pl}L` : `Level Trail: ${Math.min(save.stage, TRAIL_MAX)} of ${TRAIL_MAX.toLocaleString()}`;
    fillOver(win ? 'Victory!' : draw ? 'Draw' : 'Defeat', win ? 'WIN' : draw ? 'DRAW' : 'LOSS', rec,
      [['Turns', B.S.turn - 1], ['Damage', B.dealt], ['Crystals', '+' + coins]],
      [B.forfeitNote || '', trailNote, medalNote, ratingNote, bxp ? `+${bxp} bat XP.` : (B.gaveUp ? '' : 'Online battles shorter than 3 turns pay no crystals or XP.'), lost ? `Your bat lost ${lost} health.` : ''].filter(Boolean).join(' '));
  }
  const BYO = Math.round((H - 640) * .5);
  function batPos(i) { return i === B.me ? { x:92, y:392 + BYO } : { x:268, y:212 + BYO * .5 }; }
  function drawBattle(th) {
    drawBg(ctx, th, W, dist, t);
    drawFloor(ctx, th, W, dist, t);
    const S = B.S, A = B.anim;
    for (const i of [1 - B.me, B.me]) {
      const f = S.f[i], p = batPos(i), mine = i === B.me;
      ctx.fillStyle = hexA(th.rock, .9); ctx.beginPath(); ctx.ellipse(p.x, p.y + 52, 62, 13, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = th.hi; ctx.beginPath(); ctx.ellipse(p.x, p.y + 49, 56, 8, 0, Math.PI, 0); ctx.fill();
      let x = p.x, y = p.y + Math.sin(t * 2.2 + i) * 4;
      if (A) {
        const e = A.ev[i], k = A.t;
        if (e.dmg !== undefined && k > .1 && k < .6) { const q = Math.sin((k - .1) / .5 * Math.PI), o = batPos(1 - i); x += (o.x - p.x) * .35 * q; y += (o.y - p.y) * .35 * q; }
        if (A.ev[1 - i].dmg && k > .38 && k < .7) x += Math.sin(k * 90) * 4;
      }
      const sk = skinOf(f.skin), wear = clamp(1 - f.hp / f.max, 0, 1);
      ctx.save(); ctx.translate(x, y); ctx.scale(mine ? 2.5 : -2.2, mine ? 2.5 : 2.2);
      const guarding = A && A.mv[i] === 'g';
      drawBat(ctx, 0, 0, 0, sk, t, S.over && S.winner !== i ? 0 : 14, S.over && S.winner === 1 - i && f.hp <= 0, { gear:f.gear, wear, mood:wear > .75 ? 'sad' : null, shield:guarding });
      ctx.restore();
      if (A && A.ev[i].heal && A.t > .38) { ctx.fillStyle = hexA('#7dffb0', Math.max(0, 1 - (A.t - .38) * 1.5)); for (let k = 0; k < 6; k++) diamond(ctx, x + Math.cos(k + t * 3) * 34, y - (A.t - .38) * 60 - k * 6, 3); }
      if (f.burnT > 0) { ctx.fillStyle = '#ff7a2e'; for (let k = 0; k < 4; k++) { ctx.globalAlpha = .6 + .4 * Math.sin(t * 9 + k); ctx.beginPath(); ctx.arc(x - 20 + k * 13, y + 26 - ((t * 40 + k * 9) % 22), 3, 0, Math.PI * 2); ctx.fill(); } ctx.globalAlpha = 1; }
      drawPanel(i, th);
    }
    ctx.font = '600 12px Fredoka, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f2e9ff';
    B.log.forEach((l, k) => { ctx.globalAlpha = k ? .7 : 1; ctx.fillText(l, W / 2, 484 + BYO + k * 17); });
    ctx.globalAlpha = 1;
  }
  function drawPanel(i, th) {
    const f = B.S.f[i], mine = i === B.me, x = mine ? 150 : 14, y = mine ? 408 + BYO : 56, w = 196;
    ctx.fillStyle = 'rgba(14,12,34,.88)'; rr(ctx, x, y, w, 56, 10); ctx.fill();
    ctx.strokeStyle = mine ? hexA('#ffcf5c', .6) : 'rgba(242,233,255,.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.textAlign = 'left'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#f2e9ff'; ctx.font = '600 13px Fredoka, sans-serif';
    ctx.fillText((B.names[i] || 'Bat').slice(0, 14), x + 10, y + 13);
    ctx.textAlign = 'right'; ctx.fillStyle = '#ffcf5c'; ctx.fillText('Lv ' + f.lvl, x + w - 10, y + 13);
    f.shown = f.shown === undefined ? f.hp : f.shown + (f.hp - f.shown) * .12;
    if (Math.abs(f.shown - f.hp) < .3) f.shown = f.hp;
    const pct = clamp(f.shown / f.max, 0, 1);
    ctx.fillStyle = 'rgba(255,255,255,.12)'; rr(ctx, x + 10, y + 24, w - 20, 9, 4.5); ctx.fill();
    ctx.fillStyle = pct > .5 ? '#7dffb0' : pct > .25 ? '#ffcf5c' : '#ff5c6c'; rr(ctx, x + 10, y + 24, Math.max(0, (w - 20) * pct), 9, 4.5); ctx.fill();
    ctx.textAlign = 'left'; ctx.fillStyle = '#f2e9ff'; ctx.font = '600 11px Fredoka, sans-serif';
    ctx.fillText(`${Math.ceil(f.shown)} / ${f.max} HP`, x + 10, y + 45);
    let tag = []; if (f.burnT > 0) tag.push('Burning'); if (f.chill) tag.push('Chilled');
    if (tag.length) { ctx.fillStyle = '#ff9a5c'; ctx.fillText(tag.join(', '), x + 92, y + 45); }
    for (let k = 0; k < 5; k++) { ctx.fillStyle = k < f.en ? '#6fc8ff' : 'rgba(255,255,255,.14)'; diamond(ctx, x + w - 16 - (4 - k) * 11, y + 45, 3.4); }
  }
  function battleHud() {
    if (!B || B.ended) return;
    const S = B.S;
    txt('Turn ' + Math.min(S.turn, MAX_TURNS) + ' of ' + MAX_TURNS, W / 2, 30, 12, '#f2e9ff', .85);
    if (B.mode === 'pvp' && !B.anim) {
      const msg = B.choice ? 'Waiting for opponent…' : Math.ceil(Math.max(0, B.turnT)) + 's to choose';
      txt(msg, W / 2, 132, 12, B.choice ? '#bfe6ff' : '#ffcf5c', .6 + .4 * Math.sin(t * 4));
    } else if (B.choice && !B.anim) txt('…', W / 2, 132, 14, '#bfe6ff');
  }

  // ---------- arena + matchmaking ----------
  function openArena() {
    if (Q) cancelSearch();
    state = 'menu'; B = null; cur = null; clearWorld(); lastMode = 'battle';
    refreshUI(); renderArena(); show('arena');
  }
  function renderArena() {
    const f = myFighter(), bt = BATTLE[save.bat] || BATTLE.night, h = Math.round(save.pet.health);
    $('#aSkin').textContent = skinOf(save.bat).name;
    $('#aStats').textContent = `Bat level ${f.lvl}. ${f.hp} of ${f.max} HP. Power ${(1 + (bt.atk - 1) * .5).toFixed(2)}×.`;
    $('#aSpecial').textContent = `Special: ${bt.sp}, ${bt.spd.charAt(0).toLowerCase() + bt.spd.slice(1)}.`;
    const hl = $('#aHealth'); hl.textContent = `Health ${h}%` + (h < 40 ? '. Too hurt for online battles, let it rest.' : h < 80 ? '. A hurt bat starts battles with less HP.' : '');
    hl.className = 'lockline' + (h >= 80 ? ' ok' : '');
    const r = save.battle;
    $('#aRecord').textContent = `Trail wins ${r.w}. Online ${r.pw}W ${r.pl}L.`;
    const sb = stageBot(Math.min(save.stage, TRAIL_MAX));
    $('#trIcon').textContent = sb.boss ? '👑' : '🗺️';
    $('#trName').textContent = save.stage > TRAIL_MAX ? 'Trail complete!' : `Level ${save.stage.toLocaleString()} of ${TRAIL_MAX.toLocaleString()}`;
    $('#trDesc').textContent = save.stage > TRAIL_MAX ? 'Replay any level from the trail.' : `${sb.boss ? 'Boss: ' : ''}${sb.nick}, bat level ${sb.lvl}. First clear: ${rewardText(stageReward(save.stage))}.`;
    $('#trainBtn').textContent = sb.boss ? 'Fight boss' : 'Play';
    arenaStake = 0;
    const sd = seasonDaysLeft();
    $('#aRating').textContent = `${seasonName()} season, ${sd} day${sd === 1 ? '' : 's'} left.`;
    const ar = arenaOf(save.trophies), nx = ARENAS[arenaIdx(save.trophies) + 1], box = $('#aArena'); box.textContent = '';
    const rb = document.createElement('div'); rb.className = 'pribbon'; rb.textContent = `${ar.icon} ${ar.name}`;
    const pr = document.createElement('div'); pr.className = 'pprog';
    const st = document.createElement('span'); st.className = 'pstar'; st.textContent = '🏆';
    const br = document.createElement('div'); br.className = 'pbar'; const bi = document.createElement('i');
    bi.style.width = (nx ? clamp((save.trophies - ar.at) / (nx.at - ar.at), 0, 1) * 100 : 100) + '%';
    const bl = document.createElement('span'); bl.textContent = nx ? `${save.trophies} / ${nx.at}` : String(save.trophies);
    br.append(bi, bl); pr.append(st, br); box.append(rb, pr);
    $('#roadBtn').classList.toggle('dot', roadClaimable());
    $('#findBtn').classList.toggle('locked', !featOn('online'));
    arenaPeersChanged();
  }
  function arenaPeersChanged() {
    const el = $('#aOnline'); if (!el) return;
    if (!room) { el.textContent = 'Online battles work when the game is opened from its published link.'; return; }
    const others = room.peers().filter(p => isOpp(p) && p.kind === 'viewer');
    const waiting = others.filter(p => p.presence && p.presence.q).length;
    el.textContent = `${others.length} other player${others.length === 1 ? '' : 's'} online, ${waiting} looking for a battle.`;
  }
  function myPeer() { if (!room) return null; const me = room.peers().find(p => p.isMe && p.sameTab); return me ? me.peer : null; }
  function findMatch() {
    if (!featOn('online')) { sfx('deny'); return toast(`Online battles unlock at player level ${featLvl('online')}`); }
    if (save.medals < arenaStake) return needMore('medals');
    if (!room) { sfx('deny'); return toast('Online battles need the published page'); }
    if (save.pet.health < 40) { sfx('deny'); return toast('Your bat is too hurt. Let it rest.'); }
    const f = myFighter();
    Q = { stake:arenaStake, t0:Date.now(), f, offer:null, accept:null, rejected:{} };
    room.presence({ uid:myUid || '', q:{ stake:arenaStake, lvl:f.lvl, tr:save.trophies, t:Date.now(), f }, offer:null, accept:null, duel:null }).catch(() => {});
    sfx('click'); state = 'searching'; show('searching'); matchTick();
  }
  function cancelSearch() {
    Q = null;
    if (room) room.presence({ q:null, offer:null, accept:null }).catch(() => {});
    if (state === 'searching') state = 'menu';
  }
  function matchTick() {
    if (!Q || !room) return;
    const mp = myPeer(), wait = (Date.now() - Q.t0) / 1000, allow = Math.min(6, 1 + Math.floor(wait / 6)), allowT = Math.min(900, 150 + Math.floor(wait / 6) * 100);
    const mm = Math.floor(wait / 60), ss = String(Math.floor(wait % 60)).padStart(2, '0');
    $('#searchTxt').textContent = `Looking for a bat near ${Q.f.trophies} trophies (±${allowT}) and level ${Q.f.lvl} (±${allow}). ${mm}:${ss}`;
    $('#searchStake').textContent = Q.stake ? `Stake: ${Q.stake} medallions each, winner takes ${Q.stake * 2}.` : 'Friendly battle, no medallions at stake.';
    if (!mp) return;
    if (wait > 90) { cancelSearch(); openArena(); toast('No opponent found. Try again soon.'); return; }
    const peers = room.peers();
    const others = peers.filter(p => isOpp(p) && p.kind === 'viewer' && p.presence && p.presence.q && p.presence.q.stake === Q.stake && !p.presence.duel);
    const lvlOk = p => Math.abs(num(p.presence.q.lvl, 0) - Q.f.lvl) <= allow && Math.abs(num(p.presence.q.tr, 0) - num(Q.f.trophies, 0)) <= allowT;
    if (!Q.offer && !Q.accept) {
      const inc = others.find(p => p.presence.offer && p.presence.offer.to === mp && lvlOk(p));
      if (inc) { Q.accept = { id:String(inc.presence.offer.id).slice(0, 80), from:inc.peer, f:inc.presence.q.f, t:Date.now() }; room.presence({ accept:{ to:inc.peer, id:Q.accept.id } }).catch(() => {}); }
    }
    if (Q.accept) {
      const p = peers.find(x => x.peer === Q.accept.from), d = p && p.presence && p.presence.duel;
      if (d && d.id === Q.accept.id) return startPvp(Q.accept.id, 1, p.peer, Q.accept.f);
      if (!p || Date.now() - Q.accept.t > 5000) { Q.accept = null; room.presence({ accept:null }).catch(() => {}); }
      return;
    }
    if (Q.offer) {
      const p = peers.find(x => x.peer === Q.offer.to), a = p && p.presence && p.presence.accept;
      if (a && a.to === mp && a.id === Q.offer.id) return startPvp(Q.offer.id, 0, p.peer, p.presence.q ? p.presence.q.f : Q.offer.f);
      if (!p || Date.now() - Q.offer.t > 4000) { Q.rejected[Q.offer.to] = Date.now(); Q.offer = null; room.presence({ offer:null }).catch(() => {}); }
      return;
    }
    const cands = others.filter(p => mp < p.peer && lvlOk(p) && !(Q.rejected[p.peer] > Date.now() - 15000))
      .sort((a, b) => Math.abs(a.presence.q.lvl - Q.f.lvl) - Math.abs(b.presence.q.lvl - Q.f.lvl) || a.presence.q.t - b.presence.q.t);
    if (cands.length) {
      const c = cands[0];
      Q.offer = { to:c.peer, id:(mp + '.' + c.peer + '.' + Date.now().toString(36)).slice(0, 80), t:Date.now(), f:c.presence.q.f };
      room.presence({ offer:{ to:c.peer, id:Q.offer.id } }).catch(() => {});
    }
  }
  function startPvp(id, role, oppPeer, oppF) {
    const stake = Q.stake, mine = cleanFighter(Q.f), opp = cleanFighter(oppF);
    if (save.medals < stake) { cancelSearch(); return needMore('medals'); }
    Q = null;
    save.medals -= stake; persist(); pushSave();
    room.presence({ q:null, offer:null, accept:null, duel:{ id, role, moves:'' } }).catch(() => {});
    const S = role === 0 ? mkState(mine, opp) : mkState(opp, mine);
    sfx('power'); vib(40); toast('Opponent found!');
    beginBattle({ mode:'pvp', S, me:role, stake, id, oppPeer });
  }

  function drawArenaPreview() {
    const c = $('#aPrev'), dpr = DPR(), cw = c.clientWidth, ch = c.clientHeight;
    if (!cw) return;
    if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
    const g = c.getContext('2d'), s = ch / 70, w = cw / s;
    g.setTransform(dpr * s, 0, 0, dpr * s, 0, 0);
    g.save(); g.translate(0, -280); drawBg(g, caveOf(save.cave), w, t * 20, t); g.restore();
    drawBat(g, w / 2, 40 + Math.sin(t * 3) * 2, 0, skinOf(save.bat), t, 14, false);
  }

  // ---------- bat boosts (medallions) ----------
  function medalBtn(b, n) { b.innerHTML = '<i class="medal"></i> '; b.append(String(n)); }
  function renderCare() {
    const list = $('#careList'); list.textContent = '';
    for (const c of CARE) {
      const l = careLvl(c.id);
      const row = document.createElement('div'); row.className = 'mcard';
      const ic = document.createElement('div'); ic.className = 'micon'; ic.textContent = c.icon;
      const mid = document.createElement('div'); mid.className = 'mmid';
      const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = c.name;
      const ds = document.createElement('div'); ds.className = 'mdesc'; ds.textContent = l >= c.max ? c.desc(l) : `${c.desc(l)}. Next: ${c.desc(l + 1).charAt(0).toLowerCase() + c.desc(l + 1).slice(1)}`;
      const pips = document.createElement('div'); pips.className = 'pips';
      for (let i = 0; i < c.max; i++) { const pp = document.createElement('i'); if (i < l) pp.className = 'on'; pips.appendChild(pp); }
      mid.append(nm, ds, pips);
      const b = document.createElement('button'); b.className = 'btn small';
      if (l >= c.max) { b.textContent = 'Maxed'; b.disabled = true; } else medalBtn(b, c.cost[l]);
      b.addEventListener('click', () => {
        const lv = careLvl(c.id); if (lv >= c.max) return;
        if (save.medals < c.cost[lv]) return denyShake(row, 'Not enough medallions');
        save.medals -= c.cost[lv]; save.care[c.id] = lv + 1; sfx('medal'); vib(30); petXP(10);
        persist(); pushSave(); refreshUI(); renderCare();
      });
      row.append(ic, mid, b); list.appendChild(row);
    }
    const n = document.createElement('div'); n.className = 'note';
    n.textContent = 'Medallions only drop in the main game, about once every 50 gaps. Magnets pull them in too.';
    list.appendChild(n);
  }

  // ---------- shop, IAP and ads ----------
  function adFreeLeft() { const k = dayKey(); if (save.adFree.day !== k) save.adFree = { day:k, n:0 }; return AD_FREE_PER_DAY - save.adFree.n; }
  function shopRow(grid, icon, name, tag, desc, btnText, onClick, disabled) {
    const row = document.createElement('div'); row.className = 'mcard';
    const ic = document.createElement('div'); ic.className = 'micon'; ic.textContent = icon;
    const mid = document.createElement('div'); mid.className = 'mmid';
    const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = name;
    if (tag) { const tg = document.createElement('span'); tg.className = 'tag'; tg.textContent = tag; nm.appendChild(tg); }
    const ds = document.createElement('div'); ds.className = 'mdesc'; ds.textContent = desc;
    mid.append(nm, ds);
    const b = document.createElement('button'); b.className = 'btn small'; b.textContent = btnText; b.disabled = !!disabled;
    b.addEventListener('click', onClick);
    row.append(ic, mid, b); grid.appendChild(row);
  }
  function renderShop(grid) {
    grid.className = '';
    const sec = txt => { const d = document.createElement('div'); d.className = 'label sec'; d.textContent = txt; d.dataset.sec = txt === 'Medallions' ? 'medals' : txt.toLowerCase(); grid.appendChild(d); };
    sec('Free');
    const left = adFreeLeft();
    shopRow(grid, '🎬', 'Free crystals', null, `Watch a short ad for ${AD_FREE_REWARD} crystals. ${left} left today.`, left > 0 ? 'Watch' : 'Tomorrow', () => {
      sfx('click');
      showAd('rewarded', () => {
        if (adFreeLeft() <= 0) { renderStore(); return show('store'); }
        save.adFree.n++; save.coins += AD_FREE_REWARD; save.stats.earned += AD_FREE_REWARD;
        sfx('claim'); vib(30); persist(); pushSave(); refreshUI(); renderStore(); show('store');
      }, () => show('store'));
    }, left <= 0);
    for (const group of ['Crystals', 'Medallions', 'Specials']) {
      sec(group);
      for (const it of IAP.filter(x => x.group === group)) {
        if (it.id === 'cf_starter' && save.starterBought) continue;
        const owned = (it.id === 'cf_noads' && save.noAds) || (it.id === 'cf_pass_premium' && save.pass.premium);
        shopRow(grid, it.icon, it.name, it.tag, it.gives, owned ? 'Owned' : it.price, () => showIap(it), owned);
      }
    }
    const n = document.createElement('div'); n.className = 'note';
    n.textContent = 'Real-money purchases are placeholders until a payment provider is connected.';
    grid.appendChild(n);
  }
  function showIap(it) {
    sfx('click'); logEvent('purchase_tap', { id:it.id });
    const n = NATIVE();
    if (n && n.purchase) {
      Promise.resolve(n.purchase(it.id)).then(ok => { if (ok) grantIap(it.id); }).catch(() => toast('Purchase did not go through'));
      return;
    }
    $('#iapIcon').textContent = it.icon; $('#iapName').textContent = it.name;
    $('#iapGives').textContent = it.gives; $('#iapPrice').textContent = it.price;
    $('#iapNote').textContent = `Placeholder purchase, nothing is charged. Product ID: ${it.id}. Connect Google Play Billing, Apple In-App Purchase or Stripe, then grant this item when payment succeeds.`;
    show('iapPop');
  }
  let adTimer = null, adCb = null, adBack = null;
  function showAd(kind, onDone, onCancel) {
    const nat = NATIVE();
    if (nat && nat.showAd) {  // real ad SDK: resolves true when a rewarded ad was watched to the end
      Promise.resolve(nat.showAd(kind, save.adConsent === 'yes')).then(done => { if (done || kind !== 'rewarded') onDone(); else (onCancel || onDone)(); }).catch(() => (onCancel || onDone)());
      return;
    }
    const rewarded = kind === 'rewarded';
    adCb = onDone; adBack = onCancel || onDone;
    $('#adKind').textContent = rewarded ? 'Rewarded ad' : 'Advertisement';
    $('#adMsg').textContent = rewarded ? 'Watch to the end to get your reward.' : 'Get rid of these with Remove Ads in the Shop.';
    $('#adCancel').style.display = rewarded ? '' : 'none';
    $('#adPop .mrect').dataset.ad = kind;
    let n = rewarded ? 6 : 5;
    const btn = $('#adClose'), label = () => (rewarded ? 'Reward in ' : 'Close in ') + n;
    btn.disabled = true; btn.textContent = label();
    clearInterval(adTimer);
    adTimer = setInterval(() => {
      n--;
      if (n > 0) btn.textContent = label();
      else { clearInterval(adTimer); btn.disabled = false; btn.textContent = rewarded ? 'Claim reward' : 'Close'; btn.focus({ preventScroll:true }); }
    }, 1000);
    show('adPop');
  }
  function showOver() { show('over'); $('#againBtn').focus({ preventScroll:true }); }

  // ---------- missions, badges, daily ----------
  function dayKey(d = new Date()) { return d.getFullYear() + '-' + (d.getMonth() + 1) + '-' + d.getDate(); }
  function ensureDaily() {
    const k = dayKey();
    if (save.daily.day === k && save.daily.m.length) return;
    let h = 7; for (const ch of k) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    const pool = MISSIONS.slice(), pick = [];
    while (pick.length < 3 && pool.length) {
      h = (Math.imul(h, 1103515245) + 12345) >>> 0;
      const m = pool.splice(h % pool.length, 1)[0];
      if (!pick.some(p => p.type === m.type)) pick.push(m);
    }
    save.daily = { day:k, m:pick.map(m => ({ id:m.id, prog:0, claimed:false })) };
  }
  function weekKey(d = new Date()) { const m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7); return m.getFullYear() + '-' + (m.getMonth() + 1) + '-' + m.getDate(); }
  const weekIndex = () => { const d = new Date(), m = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7); return Math.floor((m.getTime() - m.getTimezoneOffset() * 6e4) / (7 * 864e5)); };
  const weekLeft = () => { const d = new Date(), end = new Date(d.getFullYear(), d.getMonth(), d.getDate() - (d.getDay() + 6) % 7 + 7), ms = end - d; const dd = Math.floor(ms / 864e5), hh = Math.floor(ms % 864e5 / 36e5); return dd ? `${dd}d ${hh}h` : `${hh}h`; };
  function ensureWeekly() {
    const k = weekKey();
    if (save.weekly.week === k && save.weekly.m.length) return;
    let h = 11; for (const ch of k) h = (h * 37 + ch.charCodeAt(0)) >>> 0;
    const pool = WEEKLY.slice(), pick = [];
    while (pick.length < 4 && pool.length) { h = (Math.imul(h, 1103515245) + 12345) >>> 0; const m = pool.splice(h % pool.length, 1)[0]; if (!pick.some(p => p.type === m.type)) pick.push(m); }
    save.weekly = { week:k, m:pick.map(m => ({ id:m.id, prog:0, claimed:false })) };
  }
  const missionDef = id => MISSIONS.find(x => x.id === id) || WEEKLY.find(x => x.id === id);
  function track(type, val) {
    ensureDaily(); ensureWeekly();
    for (const m of [...save.daily.m, ...save.weekly.m]) {
      const d = missionDef(m.id);
      if (!d || d.type !== type || m.claimed) continue;
      m.prog = Math.min(d.target, d.max ? Math.max(m.prog, val) : m.prog + val);
    }
  }
  function hasClaims() {
    ensureDaily(); ensureWeekly();
    if ([...save.daily.m, ...save.weekly.m].some(m => !m.claimed && m.prog >= missionDef(m.id).target)) return true;
    return ACH.some(a => !save.ach[a.id] && a.test(save));
  }
  function refreshDots() {
    $('#goalsBtn').classList.toggle('dot', hasClaims());
    $('#petBtn').classList.toggle('dot', petLow());
  }
  function giveReward(r) { save.coins += r; save.stats.earned += r; sfx('claim'); vib(30); persist(); pushSave(); refreshUI(); }

  let goalTab = 'missions';
  function goalRow(title, desc, frac, btnLabel, enabled, onClick, locked, reward) {
    const row = document.createElement('div'); row.className = 'goal' + (locked ? ' locked' : '');
    const mid = document.createElement('div'); mid.className = 'mmid';
    const tt = document.createElement('div'); tt.className = 'name'; tt.textContent = title;
    const dd = document.createElement('div'); dd.className = 'gd'; dd.textContent = desc;
    mid.append(tt, dd);
    if (frac !== null) { const m = document.createElement('div'); m.className = 'meter'; const i = document.createElement('i'); i.style.width = Math.min(100, frac * 100) + '%'; m.appendChild(i); mid.appendChild(m); }
    const b = document.createElement('button'); b.className = 'btn small' + (enabled ? '' : ' ghost');
    if (btnLabel) b.textContent = btnLabel; else { priceBtn(b, reward); if (enabled) b.prepend('Claim '); }
    b.disabled = !enabled; if (enabled) b.addEventListener('click', onClick);
    row.append(mid, b); return row;
  }
  function badgeRow(f) {
    const tiers = ACH.filter(a => a.fam === f.id), got = tiers.filter(a => save.ach[a.id]).length;
    const next = tiers.find(a => !save.ach[a.id]), v = f.val(save), ready = next && next.test(save);
    const row = document.createElement('div'); row.className = 'goal' + (!got && !ready ? ' dim' : '');
    const ic = document.createElement('div'); ic.className = 'tierIcon t' + (got - 1); ic.textContent = f.icon;
    ic.setAttribute('aria-label', got ? TIERS[got - 1] + ' badge' : 'No badge yet');
    const mid = document.createElement('div'); mid.className = 'mmid';
    const nm = document.createElement('div'); nm.className = 'name'; nm.textContent = f.name + (got ? ' ' + TIERS[got - 1] : '');
    const ds = document.createElement('div'); ds.className = 'gd';
    ds.textContent = next ? `${TIERS[next.tier]}: ${next.desc}` : 'All three tiers earned';
    mid.append(nm, ds);
    if (next) {
      const m = document.createElement('div'); m.className = 'meter'; const i = document.createElement('i');
      i.style.width = Math.min(100, v / next.n * 100) + '%'; i.style.background = ['#c47a3d', '#b8c0cc', '#e8b62c'][next.tier];
      m.appendChild(i); mid.appendChild(m);
    }
    const pips = document.createElement('div'); pips.className = 'tpips';
    for (let k = 0; k < 3; k++) { const pp = document.createElement('i'); if (k < got) pp.className = 'b' + k; pips.appendChild(pp); }
    mid.appendChild(pips);
    const b = document.createElement('button'); b.className = 'btn small' + (ready ? '' : ' ghost');
    if (!next) { b.textContent = 'Done'; b.disabled = true; }
    else { priceBtn(b, next.r); if (ready) b.prepend('Claim '); else b.disabled = true; }
    if (ready) b.addEventListener('click', () => {
      save.ach[next.id] = true; playerXP(10); giveReward(next.r);
      toast(`${f.name} ${TIERS[next.tier]} earned!`);
      renderGoals(); refreshDots();
    });
    row.append(ic, mid, b);
    return row;
  }
  function renderGoals() {
    ensureDaily();
    $$('[data-goal]').forEach(x => x.setAttribute('aria-selected', String(x.dataset.goal === goalTab)));
    const list = $('#goalList'); list.textContent = '';
    if (goalTab === 'missions') {
      ensureWeekly();
      const sec = (txt, sub) => { const d = document.createElement('div'); d.className = 'label sec'; d.textContent = txt; if (sub) { const sp = document.createElement('span'); sp.className = 'ptimer'; sp.style.marginLeft = '.5em'; sp.textContent = '⏳ ' + sub; d.appendChild(sp); } list.appendChild(d); };
      const hrsLeft = () => { const d = new Date(), e = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1); const ms = e - d; return `${Math.floor(ms / 36e5)}h ${Math.floor(ms % 36e5 / 6e4)}m`; };
      sec('Daily missions', hrsLeft());
      for (const m of save.daily.m) {
        const d = MISSIONS.find(x => x.id === m.id), done = m.prog >= d.target;
        list.appendChild(goalRow(d.text, `${Math.floor(m.prog)} / ${d.target}`, m.prog / d.target,
          m.claimed ? 'Done' : done ? null : null, done && !m.claimed,
          () => { m.claimed = true; playerXP(15); addPassXP(25); giveReward(d.r); renderGoals(); refreshDots(); }, false, d.r));
      }
      sec('Weekly missions', weekLeft());
      for (const m of save.weekly.m) {
        const d = missionDef(m.id), done = m.prog >= d.target;
        const row = goalRow(d.text, `${Math.floor(m.prog).toLocaleString()} / ${d.target.toLocaleString()}. Also pays ${d.tok} event tokens.`, m.prog / d.target,
          m.claimed ? 'Done' : null, done && !m.claimed,
          () => { m.claimed = true; playerXP(30); addPassXP(60); addTokens('mission', d.tok); giveReward(d.r); renderGoals(); refreshDots(); }, false, d.r);
        list.appendChild(row);
      }
      const n = document.createElement('div'); n.className = 'note'; n.textContent = 'Daily missions reset at midnight. Weekly missions reset every Monday.';
      list.appendChild(n);
    } else if (goalTab === 'badges') {
      const head = document.createElement('div'); head.className = 'gd'; head.style.textAlign = 'center'; head.style.margin = '0 0 .6em';
      const cnt = t => ACH.filter(a => a.tier === t && save.ach[a.id]).length;
      head.textContent = `${Object.keys(save.ach).length} of ${ACH.length} badges earned: ${cnt(2)} gold, ${cnt(1)} silver, ${cnt(0)} bronze`;
      list.appendChild(head);
      for (const f of BADGE_FAMS) list.appendChild(badgeRow(f));
    } else {
      const s = save, st = s.stats;
      const fmt = sec => { const m = Math.floor(sec / 60), h = Math.floor(m / 60); return h ? `${h}h ${m % 60}m` : `${m}m`; };
      const rows = [
        ['Player level', s.player.lvl], ['Bat health', Math.round(s.pet.health) + '%'], ['Trail battles', `${s.battle.w}W ${s.battle.l}L ${s.battle.d}D`], ['Online battles', `${s.battle.pw}W ${s.battle.pl}L ${s.battle.pd}D`], ['Medallions won in battle', s.battle.mw], ['Medallions lost in battle', s.battle.ml], ['Runs played', s.games], ['Best score', s.best], ['Top level', s.bestLevel], ['Total flaps', s.totalFlaps],
        ['Most flaps in a run', s.bestRunFlaps], ['Minigames played', st.minis], ['Crystals earned', st.earned],
        ['Crystals in the bank', s.coins], ['Time played', fmt(st.time)], ['Power-ups grabbed', st.powers],
        ['Floating crystals grabbed', st.gems], ['Medallions found', st.medals], ['Medallions in the bank', s.medals], ['Revives', st.revives], ['Bat level', s.pet.lvl],
        ['Times fed', st.fed], ['Baths', st.baths], ['Cuddles', st.pets], ['Daily streak', s.streak.count],
        ['Best streak', s.streak.best], ['Skins owned', `${s.bats.length}/${SKINS.length}`], ['Caves owned', `${s.caves.length}/${CAVES.length}`],
        ['Accessories owned', `${s.gearOwned.length}/${GEAR.length}`], ['Crystal colors owned', `${s.gemColors.length}/${GEM_COLORS.length}`], ['Premium games unlocked', `${s.minisOwned.length}/${PAID_MINIS.length}`], ['Badges claimed', `${Object.keys(s.ach).length}/${ACH.length}`],
        ...Object.entries(MINIS).map(([id, m]) => [m.name + ' best', s.mini[id] || 0]),
      ];
      for (const [k, v] of rows) {
        const r = document.createElement('div'); r.className = 'statrow';
        const a = document.createElement('span'); a.textContent = k;
        const b = document.createElement('b'); b.textContent = typeof v === 'number' ? Math.floor(v).toLocaleString() : v;
        r.append(a, b); list.appendChild(r);
      }
    }
  }

  function dailyAvailable() { return save.streak.last !== dayKey(); }
  function nextStreak() { return save.streak.last === dayKey(new Date(Date.now() - 864e5)) ? save.streak.count + 1 : 1; }
  function renderDaily() {
    const next = nextStreak(), idx = (next - 1) % 7, days = $('#days'); days.textContent = '';
    DAILY.forEach((r, i) => {
      const d = document.createElement('div'); d.className = 'day' + (i < idx ? ' done' : i === idx ? ' today' : '');
      const b = document.createElement('b'); b.textContent = r;
      const s = document.createElement('span'); s.textContent = 'Day ' + (i + 1);
      d.append(b, s); days.appendChild(d);
    });
    $('#streakTxt').textContent = next > 1 ? `${next}-day streak. Come back tomorrow to keep it going.` : 'Come back every day. Day 7 pays the most.';
    priceBtn($('#claimDaily'), DAILY[idx]); $('#claimDaily').prepend('Claim ');
  }
  function claimDaily() {
    if (!dailyAvailable()) { show('menu'); return; }
    const next = nextStreak(), r = DAILY[(next - 1) % 7];
    save.streak = { last:dayKey(), count:next, best:Math.max(save.streak.best, next) };
    const vip = isVip();
    giveReward(vip ? r * 2 + 100 : r); refreshDots();
    if (vip) toast(`VIP bonus: +${r + 100} crystals`);
    menuQueue();
  }

  // ---------- leaderboard ----------
  let boardCat = 'best', renderToken = 0;
  function buildTabs() {
    const wrapEl = $('#boardTabs');
    for (const c of CATS) {
      const b = document.createElement('button'); b.className = 'tab'; b.setAttribute('role', 'tab'); b.textContent = c.label; b.dataset.cat = c.k;
      b.addEventListener('click', () => { boardCat = c.k; sfx('click'); renderBoard().then(() => animIn($('#boardList'))); });
      wrapEl.appendChild(b);
    }
  }
  async function renderBoard() {
    $$('#boardTabs .tab').forEach(b => b.setAttribute('aria-selected', String(b.dataset.cat === boardCat)));
    const list = $('#boardList'), my = ++renderToken;
    const note = msg => { list.textContent = ''; const li = document.createElement('div'); li.className = 'note'; li.textContent = msg; list.appendChild(li); };
    if (boardStatus === 'offline') return note('The shared leaderboard runs on the published page. Open it from its claude.ai link to compete.');
    if (boardStatus === 'loading') return note('Loading ranks…');
    const wkNow = weekKey();
    const rows = boardRows.map(r => ({ id:r.id, nick:String(r.nick || '').slice(0, 16), v:Math.max(0, Math.floor(Number(boardCat === 'week' ? (r.wk === wkNow ? r.wkBest : 0) : r[boardCat]) || 0)) }))
      .filter(r => r.v > 0).sort((a, b) => b.v - a.v);
    if (!rows.length) return note('No scores here yet. Play one and take first place.');
    const top = rows.slice(0, 30);
    const meIdx = rows.findIndex(r => r.id === uid);
    const shown = meIdx >= 30 ? [...top, rows[meIdx]] : top;
    let ps = {};
    if (user) { try { ps = await user.profiles(shown.map(r => r.id)); } catch (e) {} }
    if (my !== renderToken) return;
    list.textContent = '';
    for (const r of shown) {
      const li = document.createElement('li'); if (r.id === uid) li.className = 'me';
      const a = document.createElement('span'); a.className = 'rank'; a.textContent = rows.indexOf(r) + 1;
      const b = document.createElement('span'); b.className = 'who';
      b.textContent = (r.nick || (ps[r.id] && ps[r.id].name) || 'Player') + (r.id === uid ? ' (you)' : '');
      const c = document.createElement('span'); c.className = 'val'; c.textContent = r.v.toLocaleString();
      li.append(a, b, c); list.appendChild(li);
    }
  }

  // ---------- native app bridge ----------
  // When wrapped as an app, the native layer sets window.CaveFlapNative = { purchase(id) -> Promise<bool>, showAd(kind, personalized) -> Promise<bool>, log(name, params) }.
  // Without it (web), purchases and ads fall back to the placeholders above.
  const NATIVE = () => window.CaveFlapNative || null;
  function logEvent(name, params = {}) { try { const n = NATIVE(); if (n && n.log) n.log(name, params); } catch (e) {} }
  window.addEventListener('error', e => logEvent('js_error', { msg:String(e.message || '').slice(0, 200), line:e.lineno || 0 }));
  window.addEventListener('unhandledrejection', e => logEvent('js_rejection', { msg:String(e.reason || '').slice(0, 200) }));
  const GRANTS = {
    cf_crystals_500:{ coins:500 }, cf_crystals_1200:{ coins:1200 }, cf_crystals_3500:{ coins:3500 }, cf_crystals_8000:{ coins:8000 }, cf_crystals_18000:{ coins:18000 },
    cf_medals_5:{ medals:5 }, cf_medals_12:{ medals:12 }, cf_medals_35:{ medals:35 }, cf_medals_80:{ medals:80 }, cf_medals_180:{ medals:180 },
    cf_starter:{ coins:1500, bat:'neon', gear:'crown', starter:true }, cf_noads:{ noAds:true }, cf_vip_month:{ vipDays:30 }, cf_pass_premium:{ pass:true },
  };
  // Called only after the app store confirms payment.
  function grantIap(id) {
    const g = GRANTS[id]; if (!g) return;
    if (g.coins) save.coins += g.coins;
    if (g.medals) save.medals += g.medals;
    if (g.bat && !save.bats.includes(g.bat)) { save.bats = [...save.bats, g.bat]; save.outfits[g.bat] = blankOutfit(); }
    if (g.gear && !save.gearOwned.includes(g.gear)) save.gearOwned = [...save.gearOwned, g.gear];
    if (g.starter) save.starterBought = true;
    if (g.noAds) { save.noAds = true; resize(); }
    if (g.vipDays) save.vipUntil = Math.max(Date.now(), save.vipUntil) + g.vipDays * 864e5;
    if (g.pass) { ensureSeason(); save.pass.premium = true; }
    persist(); pushSave(true); refreshUI(); sfx('claim'); vib(40);
    toast('Purchase complete. Thank you!'); logEvent('purchase_done', { id });
    if ($('#store').classList.contains('on')) renderStore();
    if ($('#pass').classList.contains('on')) renderPass();
  }
  // Restoring purchases on a new device (non-consumables and subscriptions) goes through the same grants.
  if (NATIVE()) window.CaveFlapRestore = ids => (ids || []).forEach(id => { if (['cf_noads', 'cf_vip_month', 'cf_pass_premium', 'cf_starter'].includes(id)) grantIap(id); });

  // ---------- step-by-step unlocks ----------
  const FEATURES = [
    { id:'goals',    lvl:2, btn:'#goalsBtn',  icon:'🎯', name:'Goals', text:'Daily missions and badges. Finish them for free crystals.', open:() => { renderGoals(); show('goals'); } },
    { id:'games',    lvl:3, btn:'#minisBtn',  icon:'🎮', name:'Minigames', text:'Fifteen minigames that pay crystals and give your bat XP.', open:() => toMinis() },
    { id:'battle',   lvl:5, btn:'#battleBtn', icon:'⚔️', name:'Battles', text:'Fight through the Level Trail: 10,000 bot battles, each a little harder, with a boss every 10 levels.', open:() => openArena() },
    { id:'events',   lvl:4, btn:'#eventBtn',  icon:'🎫', name:'Weekly events', text:'Each week has a theme. Earn tokens by playing and spend them in the event shop, including medallions and an event-only item.', open:() => openEvents() },
    { id:'pass',     lvl:4, btn:'#passBtn',   icon:'🎟️', name:'Season pass', text:'Earn pass XP from every game and claim a reward at each of 20 tiers.', open:() => openPass() },
    { id:'upgrades', lvl:4, icon:'🔧', name:'Upgrades', text:'Longer magnets, slower slow-mo and more crystals, in the Store.', open:() => { storeTab = 'up'; renderStore(); show('store'); } },
    { id:'online',   lvl:7, icon:'🏟️', name:'Online battles', text:'Battle real players near your level and climb the battle rating.', open:() => openArena() },
    { id:'boosts',   lvl:6, btn:'#boostBtn',  icon:'🏅', name:'Bat boosts', text:'Spend rare medallions on permanent boosts for your bat.', open:() => { enterHome(); renderCare(); show('care'); } },
    { id:'stakes_removed', lvl:999, icon:'💰', name:'Medallion stakes', text:'Put medallions on the line in online battles. The winner takes all. Players 18+ only.', open:() => openArena() },
  ];
  const featLvl = id => (FEATURES.find(f => f.id === id) || { lvl:1 }).lvl;
  const featOn = id => save.player.lvl >= featLvl(id);
  function gate(id, fn) { if (featOn(id)) return fn(); sfx('deny'); toast(`Unlocks at player level ${featLvl(id)}`); }
  let unlockShown = null;
  function seeUnlock() { if (unlockShown && !save.seenUnlocks.includes(unlockShown.id)) { save.seenUnlocks = [...save.seenUnlocks, unlockShown.id]; persist(); pushSave(); } unlockShown = null; }
  // What the main menu shows next: daily reward first, then any newly unlocked feature, then the menu itself.
  function menuQueue() {
    if (state !== 'menu') return;
    if (dailyAvailable()) { renderDaily(); show('daily'); return; }
    if (save.evoSeen < save.evo) { showBatPopup(CHAIN[save.evo], save.evo > 0); return; }
    const f = FEATURES.find(x => featOn(x.id) && !save.seenUnlocks.includes(x.id));
    if (f) {
      unlockShown = f; logEvent('unlock', { id:f.id });
      $('#unIcon').textContent = f.icon; $('#unName').textContent = f.name; $('#unText').textContent = f.text;
      sfx('level'); show('unlock'); return;
    }
    show('menu');
  }

  // ---------- seasons (battle rating + season pass) ----------
  const seasonKey = () => { const d = new Date(); return d.getFullYear() + '-' + (d.getMonth() + 1); };
  const seasonName = () => new Date().toLocaleString('en', { month:'long' });
  const seasonDaysLeft = () => { const d = new Date(), end = new Date(d.getFullYear(), d.getMonth() + 1, 1); return Math.max(1, Math.ceil((end - d) / 864e5)); };
  // ---------- trophies ----------
  const arenaIdx = tr => { let i = 0; ARENAS.forEach((a, k) => { if (tr >= a.at) i = k; }); return i; };
  const arenaOf = tr => ARENAS[arenaIdx(tr)];
  function trophyDelta(pvp, win, draw, oppT) {
    if (draw) return 0;
    if (!pvp) return win && B && B.firstClear ? (B.stage % 10 === 0 ? 10 : 3) : 0;  // trail: first clears only, never a loss
    const diff = Math.round((oppT - save.trophies) / 40);
    if (win) return clamp(30 + diff, 20, 40);
    const loss = clamp(25 - diff, 15, 35);
    return -(save.trophies < 300 ? Math.min(10, loss) : loss);
  }
  function applyTrophies(delta, pvp) {
    let floor = 0; ARENAS.forEach(a => { if (a.floor && save.bestTrophies >= a.at) floor = a.at; });
    save.trophies = delta >= 0 ? save.trophies + delta : Math.max(Math.min(floor, save.trophies), save.trophies + delta);
    if (save.trophies > save.bestTrophies) save.bestTrophies = save.trophies;
    const ai = arenaIdx(save.bestTrophies);
    if (ai > save.arenaSeen) {
      for (let i = save.arenaSeen + 1; i <= ai; i++) {
        const a = ARENAS[i], r = a.reward || {};
        if (r.coins) { save.coins += r.coins; save.stats.earned += r.coins; }
        if (r.medals) save.medals += r.medals;
        setTimeout(() => { toast(`New arena: ${a.icon} ${a.name}!${r.coins ? ` +${r.coins} crystals` : ''}${r.medals ? `, +${r.medals} medallions` : ''}`); sfx('medal'); }, 1400 + (i - save.arenaSeen) * 1600);
      }
      save.arenaSeen = ai; logEvent('arena_up', { arena:ai });
    }
  }
  const roadClaimable = () => { for (let i = 1; i <= ROAD_MAX; i++) if (save.bestTrophies >= i * ROAD_STEP && !save.troad.includes(i)) return true; return false; };
  function openRoad() { state = 'menu'; cur = null; clearWorld(); refreshUI(); renderRoad(true); show('road'); }
  function renderRoad(jump) {
    const body = $('#roadBody'), head = $('#roadHead'), keep = body.scrollTop; body.textContent = ''; head.textContent = '';
    const a = arenaOf(save.trophies), ai = arenaIdx(save.trophies), next = ARENAS[ai + 1];
    const ban = document.createElement('div'); ban.className = 'pbanner';
    const rib = document.createElement('div'); rib.className = 'pribbon'; rib.textContent = `${a.icon} ${a.name}`;
    const prog = document.createElement('div'); prog.className = 'pprog';
    const star = document.createElement('span'); star.className = 'pstar'; star.textContent = '🏆';
    const bar = document.createElement('div'); bar.className = 'pbar'; const fi = document.createElement('i');
    const lo = a.at, hi = next ? next.at : a.at + 1000, frac = clamp((save.trophies - lo) / (hi - lo), 0, 1);
    const lab = document.createElement('span'); lab.textContent = next ? `${save.trophies} / ${next.at}` : `${save.trophies}`;
    bar.append(fi, lab); prog.append(star, bar);
    const sub = document.createElement('div'); sub.className = 'gd'; sub.style.cssText = 'position:relative;margin-top:.5em';
    sub.textContent = next ? `Next arena: ${next.icon} ${next.name}. Best ever: ${save.bestTrophies} trophies.` : `Top arena reached. Best ever: ${save.bestTrophies} trophies.`;
    ban.append(rib, prog, sub); head.appendChild(ban);
    requestAnimationFrame(() => { fi.style.width = frac * 100 + '%'; });
    const track = document.createElement('div'); track.className = 'ptrack';
    const cols = document.createElement('div'); cols.className = 'pcols2';
    const t1 = document.createElement('div'); t1.className = 'pticket'; t1.textContent = 'Trophies';
    const t2 = document.createElement('div'); t2.className = 'pticket prem'; t2.textContent = 'Reward';
    cols.append(t1, document.createElement('span'), t2);
    const line = document.createElement('div'); line.className = 'pline'; const lf = document.createElement('i'); line.appendChild(lf);
    track.append(line, cols);
    const rows = [], best = save.bestTrophies, reached = Math.min(ROAD_MAX, Math.floor(best / ROAD_STEP));
    for (let i = 1; i <= ROAD_MAX; i++) {
      const gate = ARENAS.find(x => x.at && x.at > (i - 1) * ROAD_STEP && x.at <= i * ROAD_STEP);
      if (gate) {
        const g = document.createElement('div'); g.className = 'prow2'; g.style.gridTemplateColumns = '1fr';
        const gb = document.createElement('div'); gb.className = 'pribbon'; gb.style.cssText = `justify-self:center;font-size:.8em;background:linear-gradient(${gate.color},#2a3bb8)`;
        gb.textContent = `${gate.icon} ${gate.name} at ${gate.at}`; g.appendChild(gb); track.appendChild(g);
      }
      const row = document.createElement('div'); row.className = 'prow2';
      const lt = document.createElement('div'); lt.className = 'ptile free'; lt.style.cursor = 'default';
      const lti = document.createElement('span'); lti.className = 'ico'; lti.textContent = '🏆'; const lta = document.createElement('span'); lta.className = 'amt'; lta.textContent = (i * ROAD_STEP).toLocaleString();
      lt.append(lti, lta);
      const nd = document.createElement('div'); nd.className = 'phex' + (i <= reached ? ' on' : ''); const nb = document.createElement('b'); nb.textContent = i; nd.appendChild(nb);
      const r = roadReward(i), got = save.troad.includes(i), ready = i <= reached && !got;
      const rt = document.createElement('button'); rt.className = 'ptile prem' + (got ? ' done' : '') + (ready ? ' ready' : '');
      const ri = document.createElement('span'); ri.className = 'ico'; ri.innerHTML = r.medals ? '<i class="medal"></i>' : r.tokens ? '<i class="tok"></i>' : '<i class="gem"></i>';
      const ra = document.createElement('span'); ra.className = 'amt'; ra.textContent = (r.medals || r.tokens || r.coins).toLocaleString();
      rt.append(ri, ra);
      if (ready) { const cl = document.createElement('span'); cl.className = 'cl'; cl.textContent = 'Claim'; rt.appendChild(cl); }
      if (i > reached) { const lk = document.createElement('span'); lk.className = 'lk'; lk.textContent = '🔒'; rt.appendChild(lk); }
      rt.addEventListener('click', () => {
        if (got) return;
        if (i > reached) { sfx('deny'); return toast(`Reach ${i * ROAD_STEP} trophies first`); }
        save.troad.push(i);
        if (r.medals) { save.medals += r.medals; sfx('medal'); toast(`+${r.medals} medallions`); }
        else if (r.tokens) { save.tokens += r.tokens; sfx('claim'); toast(`+${r.tokens} event tokens`); }
        else { save.coins += r.coins; save.stats.earned += r.coins; sfx('claim'); toast(`+${r.coins} crystals`); }
        vib(25); persist(); pushSave(); refreshUI(); renderRoad();
      });
      row.append(lt, nd, rt); track.appendChild(row); rows.push(row);
    }
    body.appendChild(track);
    const n = document.createElement('div'); n.className = 'note'; n.textContent = 'Win online battles to earn trophies. Beating a new trail level also gives 3, or 10 for a boss. Each season, trophies above 4,000 are reset halfway.'; body.appendChild(n);
    requestAnimationFrame(() => {
      const mid = r => r.offsetTop + r.offsetHeight / 2, top = mid(rows[0]), bottom = mid(rows[rows.length - 1]);
      line.style.top = (top - 14) + 'px'; line.style.height = (bottom - top + 28) + 'px';
      const k = Math.floor(best / ROAD_STEP), f = (best % ROAD_STEP) / ROAD_STEP;
      const y = k >= ROAD_MAX ? bottom + 14 : k === 0 ? top - 14 + 14 * f : mid(rows[k - 1]) + (mid(rows[k]) - mid(rows[k - 1])) * f;
      requestAnimationFrame(() => { lf.style.height = Math.max(0, y - (top - 14)) + 'px'; });
      if (jump) body.scrollTop = Math.max(0, track.offsetTop - body.offsetTop + rows[Math.max(0, Math.min(rows.length - 1, k - 1))].offsetTop - 70);
      else body.scrollTop = keep;
    });
  }

  function ensureSeason() {
    const k = seasonKey();
    if (save.season !== k) {
      if (save.season && save.seasonGames > 0) {
        const reward = 100 + arenaIdx(save.trophies) * 150;
        save.coins += reward; save.stats.earned += reward;
        setTimeout(() => toast(`New battle season! +${reward} crystals for reaching ${arenaOf(save.trophies).name}.`), 1200);
      }
      if (save.season && save.trophies > 4000) save.trophies = Math.round(4000 + (save.trophies - 4000) * .5);
      save.seasonGames = 0; save.season = k;
    }
    if (save.pass.season !== k) save.pass = { season:k, xp:0, f:[], p:[], premium:false };
  }
  const PASS_TIERS = 20, PASS_XP = 100;
  const passTier = () => Math.min(PASS_TIERS, Math.floor(save.pass.xp / PASS_XP));
  const passReward = (i, prem) => prem ? (i % 4 === 0 ? { medals:5 + (i === 20 ? 20 : 0) } : { coins:60 + i * 20 }) : (i % 5 === 0 ? { medals:2 } : { coins:20 + i * 8 });
  function addPassXP(n) {
    ensureSeason();
    const before = passTier();
    save.pass.xp = Math.min(PASS_TIERS * PASS_XP, save.pass.xp + n);
    const after = passTier();
    if (after > before) { toast(`Season pass tier ${after} reached!`); logEvent('pass_tier', { tier:after }); }
  }
  function passClaimable() {
    const t = passTier();
    for (let i = 1; i <= t; i++) { if (!save.pass.f.includes(i)) return true; if (save.pass.premium && !save.pass.p.includes(i)) return true; }
    return false;
  }
  function openPass() { ensureSeason(); state = 'menu'; cur = null; clearWorld(); refreshUI(); renderPass(true); show('pass'); }
  function rewardLabel(b, r) { if (r.medals) medalBtn(b, r.medals); else priceBtn(b, r.coins); }
  function timeLeft() {
    const d = new Date(), end = new Date(d.getFullYear(), d.getMonth() + 1, 1), ms = end - d;
    const dd = Math.floor(ms / 864e5), hh = Math.floor(ms % 864e5 / 36e5);
    return dd ? `${dd}d ${hh}h` : `${hh}h ${Math.floor(ms % 36e5 / 6e4)}m`;
  }
  function passTile(i, prem, t) {
    const r = passReward(i, prem), list = prem ? save.pass.p : save.pass.f;
    const got = list.includes(i), unlockedTrack = !prem || save.pass.premium, ready = i <= t && unlockedTrack && !got;
    const b = document.createElement('button');
    b.className = 'ptile ' + (prem ? 'prem' : 'free') + (got ? ' done' : '') + (ready ? ' ready' : '') + (prem && i === PASS_TIERS ? ' big' : '');
    const ico = document.createElement('span'); ico.className = 'ico';
    ico.innerHTML = r.medals ? '<i class="medal"></i>' : '<i class="gem"></i>';
    const amt = document.createElement('span'); amt.className = 'amt'; amt.textContent = (r.medals || r.coins).toLocaleString();
    b.append(ico, amt);
    b.setAttribute('aria-label', `Tier ${i} ${prem ? 'premium' : 'free'} reward: ${r.medals ? r.medals + ' medallions' : r.coins + ' crystals'}${got ? ', claimed' : ready ? ', ready to claim' : ''}`);
    if (prem && !save.pass.premium) { const lk = document.createElement('span'); lk.className = 'lk'; lk.textContent = '🔒'; b.appendChild(lk); }
    if (ready) { const cl = document.createElement('span'); cl.className = 'cl'; cl.textContent = 'Claim'; b.appendChild(cl); }
    b.addEventListener('click', () => {
      if (got) return;
      if (prem && !save.pass.premium) { sfx('deny'); return toast('Activate the premium pass to unlock these'); }
      if (i > t) { sfx('deny'); return toast(`Reach tier ${i} first`); }
      list.push(i);
      if (r.medals) { save.medals += r.medals; toast(`+${r.medals} medallions`); sfx('medal'); vib(30); persist(); pushSave(); refreshUI(); }
      else giveReward(r.coins);
      renderPass();
    });
    return b;
  }
  function renderPass(jump) {
    const body = $('#passBody'), head = $('#passHead'), keepScroll = body.scrollTop; body.textContent = ''; head.textContent = '';
    const t = passTier(), into = t >= PASS_TIERS ? PASS_XP : save.pass.xp - t * PASS_XP;
    // Banner: title, time left, progress bar with current tier, premium button
    const ban = document.createElement('div'); ban.className = 'pbanner';
    const rib = document.createElement('div'); rib.className = 'pribbon'; rib.textContent = `${seasonName()} Pass`;
    const tm = document.createElement('div'); tm.className = 'ptimer'; tm.textContent = '⏳ ' + timeLeft();
    const prog = document.createElement('div'); prog.className = 'pprog';
    const star = document.createElement('span'); star.className = 'pstar'; star.textContent = '⭐';
    const bar = document.createElement('div'); bar.className = 'pbar';
    const fill = document.createElement('i'); fill.style.width = '0%';
    const lab = document.createElement('span'); lab.textContent = t >= PASS_TIERS ? 'Complete' : `${Math.floor(into)}/${PASS_XP}`;
    bar.append(fill, lab);
    const hex = document.createElement('div'); hex.className = 'phex on'; const hb = document.createElement('b'); hb.textContent = Math.min(PASS_TIERS, t + (t >= PASS_TIERS ? 0 : 1)); hex.appendChild(hb);
    hex.setAttribute('aria-label', 'Next tier');
    const act = document.createElement('button'); act.className = 'btn pact' + (save.pass.premium ? ' done' : '');
    if (save.pass.premium) { act.textContent = 'Active'; act.disabled = true; }
    else { const it = IAP.find(x => x.id === 'cf_pass_premium'); act.textContent = 'Activate'; act.addEventListener('click', () => showIap(it)); }
    prog.append(star, bar, hex, act);
    ban.append(rib, document.createElement('br'), tm, prog);
    head.appendChild(ban);
    requestAnimationFrame(() => { fill.style.width = (into / PASS_XP * 100) + '%'; });

    // Track: free column, numbered line, premium column
    const track = document.createElement('div'); track.className = 'ptrack';
    const cols = document.createElement('div'); cols.className = 'pcols2';
    const tf = document.createElement('div'); tf.className = 'pticket'; tf.textContent = 'Free';
    const tp = document.createElement('div'); tp.className = 'pticket prem'; tp.textContent = 'Premium';
    cols.append(tf, document.createElement('span'), tp);
    const line = document.createElement('div'); line.className = 'pline'; const lf = document.createElement('i'); line.appendChild(lf);
    const lock = document.createElement('div'); lock.className = 'plock'; lock.textContent = '🔒';
    track.append(line, cols);
    const rows = [];
    for (let i = 1; i <= PASS_TIERS; i++) {
      const row = document.createElement('div'); row.className = 'prow2';
      const nd = document.createElement('div'); nd.className = 'phex' + (i <= t ? ' on' : ''); const nb = document.createElement('b'); nb.textContent = i; nd.appendChild(nb);
      row.append(passTile(i, false, t), nd, passTile(i, true, t));
      track.appendChild(row); rows.push(row);
    }
    if (t < PASS_TIERS) track.appendChild(lock);
    body.appendChild(track);
    const note = document.createElement('div'); note.className = 'note'; note.textContent = 'Every run, minigame, battle and mission earns pass XP. The pass resets when the month ends.';
    body.appendChild(note);

    // Place the line and its green fill once the rows have a size.
    requestAnimationFrame(() => {
      const mid = r => r.offsetTop + r.offsetHeight / 2;
      const top = mid(rows[0]), bottom = mid(rows[rows.length - 1]);
      line.style.top = (top - 14) + 'px'; line.style.height = (bottom - top + 28) + 'px';
      const frac = into / PASS_XP;
      const y = t >= PASS_TIERS ? bottom + 14 : t === 0 ? top - 14 + 14 * frac : mid(rows[t - 1]) + (mid(rows[t]) - mid(rows[t - 1])) * frac;
      lock.style.top = y + 'px';
      requestAnimationFrame(() => { lf.style.height = Math.max(0, y - (top - 14)) + 'px'; });
      if (jump) { const target = rows[Math.min(rows.length - 1, Math.max(0, t - 1))]; body.scrollTop = Math.max(0, track.offsetTop - body.offsetTop + target.offsetTop - 70); }
      else body.scrollTop = keepScroll;
    });
  }

  // ---------- weekly events + token shop ----------
  const currentEvent = () => EVENTS[((weekIndex() % EVENTS.length) + EVENTS.length) % EVENTS.length];
  function ensureEvent() { const k = weekKey(); if (save.ev.week !== k) save.ev = { week:k, buys:{}, earned:0 }; }
  function addTokens(src, n) {
    if (!n) return;
    ensureEvent();
    const amt = n * (currentEvent().src === src ? 2 : 1);
    save.tokens += amt; save.ev.earned += amt;
    $$('.tokCount').forEach(e => tweenNum(e, save.tokens));
  }
  function openEvents() { ensureEvent(); state = 'menu'; cur = null; clearWorld(); refreshUI(); renderEvents(); show('events'); }
  function renderEvents() {
    const ev = currentEvent(), head = $('#evHead'), body = $('#evBody'); head.textContent = ''; body.textContent = '';
    const ban = document.createElement('div'); ban.className = 'pbanner';
    const rib = document.createElement('div'); rib.className = 'pribbon'; rib.textContent = `${ev.icon} ${ev.name}`;
    const tm = document.createElement('div'); tm.className = 'ptimer'; tm.textContent = '⏳ ' + weekLeft();
    const ds = document.createElement('div'); ds.className = 'gd'; ds.style.cssText = 'position:relative;margin-top:.55em'; ds.textContent = ev.desc;
    ban.append(rib, document.createElement('br'), tm, ds); head.appendChild(ban);
    const track = document.createElement('div'); track.className = 'ptrack';
    const cols = document.createElement('div'); cols.className = 'pcols2'; cols.style.gridTemplateColumns = '1fr';
    const tk = document.createElement('div'); tk.className = 'pticket prem'; tk.textContent = 'Token shop'; cols.appendChild(tk); track.appendChild(cols);
    const grid = document.createElement('div'); grid.className = 'evgrid';
    const items = [...TOKEN_SHOP, { id:'gear_' + ev.gear, name:GEAR.find(g => g.id === ev.gear).name, icon:'gear', gear:ev.gear, cost:120, limit:1 }];
    for (const it of items) {
      const cell = document.createElement('div'); cell.className = 'evitem';
      const tile = document.createElement('div'); tile.className = 'ptile ' + (it.gear ? 'prem big' : 'free'); tile.style.cursor = 'default';
      const ico = document.createElement('span'); ico.className = 'ico';
      if (it.icon === 'medal') ico.innerHTML = '<i class="medal"></i>'; else if (it.icon === 'gem') ico.innerHTML = '<i class="gem"></i>'; else if (it.icon === 'gear') ico.textContent = '🎁'; else ico.textContent = it.icon;
      tile.appendChild(ico);
      if (it.amt) { const a = document.createElement('span'); a.className = 'amt'; a.textContent = it.amt.toLocaleString(); tile.appendChild(a); }
      const nm = document.createElement('div'); nm.className = 'nm';
      const bought = save.ev.buys[it.id] || 0, owned = it.gear && save.gearOwned.includes(it.gear), left = it.limit - bought;
      nm.textContent = it.gear ? `${it.name} (event exclusive)` : `${it.name}${it.limit > 1 ? ` (${left} left)` : ''}`;
      const b = document.createElement('button'); b.className = 'btn';
      if (owned || left <= 0) { b.textContent = owned ? 'Owned' : 'Sold out'; b.disabled = true; b.classList.add('ghost'); }
      else { b.innerHTML = '<i class="tok"></i> '; b.append(String(it.cost)); }
      b.addEventListener('click', () => buyToken(it));
      cell.append(tile, nm, b); grid.appendChild(cell);
    }
    track.appendChild(grid); body.appendChild(track);
    const earn = document.createElement('div'); earn.className = 'passhead'; earn.style.marginTop = '.7em';
    const t1 = document.createElement('div'); t1.className = 'name'; t1.textContent = 'How to earn tokens'; earn.appendChild(t1);
    const list = document.createElement('div'); list.className = 'evearn';
    for (const [src, label, amt] of [['run', 'Main game run', '1 + 1 per 5 points'], ['mini', 'Minigame', '2'], ['battle', 'Battle win', '3'], ['care', 'Feed, bath or toy', '1'], ['mission', 'Weekly mission', '15 to 25']]) {
      const a = document.createElement('span'); a.textContent = label; const bb = document.createElement('span'); bb.className = 'x2'; bb.textContent = ev.src === src ? '×2 this week' : '';
      const c = document.createElement('b'); c.style.fontFamily = 'Bungee, sans-serif'; c.style.fontWeight = '400'; c.textContent = amt; list.append(a, bb, c);
    }
    earn.appendChild(list); body.appendChild(earn);
    const n = document.createElement('div'); n.className = 'note'; n.textContent = 'A new event starts every Monday. Tokens carry over, but shop limits reset each week.'; body.appendChild(n);
  }
  function buyToken(it) {
    ensureEvent();
    const bought = save.ev.buys[it.id] || 0;
    if (bought >= it.limit || (it.gear && save.gearOwned.includes(it.gear))) return;
    if (save.tokens < it.cost) { sfx('deny'); return toast('Not enough tokens. Play to earn more!'); }
    save.tokens -= it.cost; save.ev.buys[it.id] = bought + 1;
    const g = it.give || {};
    if (g.medals) save.medals += g.medals;
    if (g.coins) { save.coins += g.coins; save.stats.earned += g.coins; }
    if (g.heal) save.pet.health = 100;
    if (g.batxp) petXP(g.batxp);
    if (it.gear) { save.gearOwned = [...save.gearOwned, it.gear]; const gi = GEAR.find(x => x.id === it.gear); save.gear[gi.slot] = it.gear; }
    sfx(g.medals ? 'medal' : 'buy'); vib(30); toast(`${it.name} bought!`);
    logEvent('token_buy', { id:it.id });
    persist(); pushSave(); refreshUI(); renderEvents();
  }

  // ---------- settings, legal, consent, sharing ----------
  let legalReturn = 'settings', pendingStake = 0, lastBattleMode = 'bot', shareText = 'Come play Cave Flap with me!', autoLow = false;
  function openSettings() { state = 'menu'; cur = null; clearWorld(); refreshUI(); $('#verTxt').textContent = `Cave Flap version ${APP_VERSION}. Support: ${SUPPORT_EMAIL}`; show('settings'); }
  function openLegal(which) {
    const L = LEGAL[which]; if (!L) return;
    legalReturn = ($$('.screen.on')[0] || { id:'settings' }).id;
    $('#legalTitle').textContent = L.title;
    const body = $('#legalBody'); body.textContent = '';
    for (const [h, t] of L.body) { const hh = document.createElement('h3'); hh.textContent = h; const pp = document.createElement('p'); pp.textContent = t; body.append(hh, pp); }
    body.scrollTop = 0; sfx('click'); show('legal');
  }
  function setConsent(v) {
    save.adConsent = v; persist(); pushSave(); sfx('click'); logEvent('ad_consent', { value:v });
    if (needSetup) { needSetup = false; openSetup(); } else toMenu();
  }
  function shareResult() {
    const url = location.href, text = shareText;
    if (navigator.share) { navigator.share({ title:'Cave Flap', text, url }).catch(() => {}); return; }
    const done = () => toast('Copied. Paste it anywhere to share.');
    if (navigator.clipboard) navigator.clipboard.writeText(text + ' ' + url).then(done).catch(() => toast(text)); else toast(text);
  }

  // ---------- accounts ----------
  let needSetup = false;
  function accountCheck() {
    if (save.account) { pushPlayer(); return; }
    if (save.nick) { save.account = { created:Date.now() }; persist(); pushSave(); pushPlayer(); return; }
    if (!save.adConsent) { needSetup = true; return; }
    openSetup();
  }
  function openSetup() {
    const nm = acctMe && acctMe.name ? acctMe.name : '';
    $('#setupWho').textContent = nm ? `Linked to your Claude account (${nm}). Your progress saves to it automatically, on any device.` : 'Your progress saves to your account automatically, on any device.';
    $('#setupName').value = (nm.split(' ')[0] || '').slice(0, 16);
    $('#setupErr').textContent = '';
    show('setup');
  }
  function createAccount() {
    const name = $('#setupName').value.trim().replace(/\s+/g, ' ').slice(0, 16);
    if (name.length < 2) { $('#setupErr').textContent = 'Pick a name with at least 2 characters.'; sfx('deny'); return; }
    save.nick = name; save.account = { created:Date.now() }; if (uid) save.owner = uid;
    persist(); pushSave(true); pushPlayer(); pushScore();
    sfx('claim'); toast(`Welcome, ${name}!`);
    toMenu();
  }
  const ago = ts => { const d = (Date.now() - ts) / 1000; return d < 60 ? 'just now' : d < 3600 ? Math.floor(d / 60) + 'm ago' : d < 86400 ? Math.floor(d / 3600) + 'h ago' : Math.floor(d / 86400) + 'd ago'; };
  function renderAccount() {
    const guest = !uid, name = save.nick || 'Player';
    const av = $('#acAvatar'); av.textContent = '';
    if (acctMe && acctMe.avatarUrl && !guest) { const img = document.createElement('img'); img.className = 'avatar'; img.alt = ''; img.src = acctMe.avatarUrl; av.replaceWith(img); img.id = 'acAvatar'; }
    else av.textContent = name.charAt(0).toUpperCase();
    $('#acName').textContent = name;
    $('#acWho').textContent = guest ? 'Guest. Progress is saved on this device only. Open the published link while signed in to keep it in your account.'
      : `Signed in through Claude${acctMe && acctMe.name ? ' as ' + acctMe.name : ''}. Your progress follows you to every device.`;
    $('#acSync').textContent = guest ? 'Saved on this device' : pushTimer ? 'Saving…' : lastSync ? `All progress saved ${ago(lastSync)}` : 'Progress saved to your account';
    if (document.activeElement !== $('#nickInput')) $('#nickInput').value = save.nick;
    const st = $('#acStats'); st.textContent = '';
    const rows = [['Player level', save.player.lvl], ['Bat level', save.pet.lvl], ['Crystals', save.coins.toLocaleString()], ['Medallions', save.medals.toLocaleString()],
      ['Bats owned', `${save.bats.length}/${SKINS.length}`], ['Badges', `${Object.keys(save.ach).length}/${ACH.length}`],
      ['Member since', save.account && save.account.created ? new Date(save.account.created).toLocaleDateString() : 'Today']];
    for (const [k, v] of rows) { const r = document.createElement('div'); r.className = 'statrow'; const a = document.createElement('span'); a.textContent = k; const b = document.createElement('b'); b.textContent = v; r.append(a, b); st.appendChild(r); }
    $('#acSaveNow').style.display = guest ? 'none' : '';
    renderPlayers();
  }
  function renderPlayers() {
    const box = $('#acPlayers'); box.textContent = '';
    if (!db) { const n = document.createElement('div'); n.className = 'note'; n.textContent = 'The player list shows on the published page.'; box.appendChild(n); return; }
    const rows = playerRows.filter(r => r.name).sort((a, b) => num(b.t) - num(a.t)).slice(0, 50);
    if (!rows.length) { const n = document.createElement('div'); n.className = 'note'; n.textContent = 'No other players yet.'; box.appendChild(n); return; }
    for (const r of rows) {
      const row = document.createElement('div'); row.className = 'prow' + (r.id === uid ? ' me' : '');
      const who = document.createElement('span'); who.className = 'who'; who.textContent = String(r.name).slice(0, 16) + (r.id === uid ? ' (you)' : '');
      const info = document.createElement('span'); info.className = 'gd';
      info.textContent = `Lv ${Math.max(1, Math.floor(num(r.lvl, 1)))}, bat Lv ${Math.max(1, Math.floor(num(r.batLvl, 1)))}. ${r.t ? ago(num(r.t)) : ''}`;
      row.append(who, info); box.appendChild(row);
    }
  }
  function openAccount() {
    if (Q) cancelSearch();
    state = 'menu'; cur = null; clearWorld(); refreshUI(); renderAccount(); show('account');
  }
  let resetArm = 0;
  function startOver() {
    if (Date.now() - resetArm > 3000) { resetArm = Date.now(); sfx('deny'); $('#acReset').textContent = 'Tap again to wipe everything'; setTimeout(() => $('#acReset').textContent = 'Start over', 3000); return; }
    resetArm = 0;
    const keep = { sfx:save.sfx, music:save.music, vib:save.vib, nick:save.nick, account:save.account, owner:save.owner, tut:save.tut };
    setSave({ ...clean({}), ...keep, rev:save.rev + 1 });
    persist(); pushSave(true); pushPlayer();
    if (db && uid) queue(() => db.doc(`scores/${uid}`).delete());
    toast('Progress wiped. Fresh start!'); sfx('click');
    toMenu();
  }

  // ---------- UI wiring ----------
  function refreshUI() {
    $$('.coinCount').forEach(e => tweenNum(e, save.coins));
    $$('.medalCount').forEach(e => tweenNum(e, save.medals));
    $$('.tokCount').forEach(e => tweenNum(e, save.tokens));
    applyGemCss();
    $('#plTxt').textContent = `${save.nick || 'Player'}, Lv ${save.player.lvl}`;
    $('#plXp').style.width = Math.min(100, save.player.xp / pNeed(save.player.lvl) * 100) + '%';
    const tg = (id, on, a, b) => { const el = $(id); el.setAttribute('aria-pressed', String(on)); el.textContent = on ? a : b; };
    tg('#vibBtn', save.vib, 'On', 'Off'); tg('#fxBtn', save.fxLow, 'On', 'Off'); tg('#adsBtn', save.adConsent === 'yes', 'On', 'Off');
    $('#sfxVol').value = Math.round(save.sfxVol * 100); $('#musicVol').value = Math.round(save.musicVol * 100);
    for (const f of FEATURES) if (f.btn) $(f.btn).classList.toggle('locked', !featOn(f.id));
    $('#passBtn').classList.toggle('dot', featOn('pass') && passClaimable());
    $('#eventBtn').classList.toggle('dot', featOn('events') && save.tokens >= 25);
    $('#menuBest').textContent = (isWeekend() ? 'Weekend event: +50% crystals in every game! ' : '') + (save.games ? `Best ${save.best}, top level ${save.bestLevel}` : 'Fly through the gaps. Grab crystals.');
    if (document.activeElement !== $('#nickInput')) $('#nickInput').value = save.nick;
    refreshDots();
  }

  $('#playBtn').addEventListener('click', () => { sfx('click'); startRun(); });
  $('#petBtn').addEventListener('click', () => { sfx('click'); enterHome(); });
  $('#minisBtn').addEventListener('click', () => gate('games', () => { sfx('click'); toMinis(); }));
  $('#storeBtn').addEventListener('click', () => { sfx('click'); renderStore(); show('store'); });
  $('#goalsBtn').addEventListener('click', () => gate('goals', () => { sfx('click'); renderGoals(); show('goals'); }));
  $('#boardBtn').addEventListener('click', () => { sfx('click'); renderBoard(); show('board'); });
  $$('.back').forEach(b => b.addEventListener('click', () => { sfx('click'); if (state === 'home' && bathMode) finishBath(); toMenu(); }));
  $$('[data-store]').forEach(b => b.addEventListener('click', () => { if (storeTab === b.dataset.store) return; if (b.dataset.store === 'up' && !featOn('upgrades')) { sfx('deny'); return toast(`Upgrades unlock at player level ${featLvl('upgrades')}`); } storeTab = b.dataset.store; sfx('click'); renderStore(); $('#store .scroll').scrollTop = 0; animIn($('#storeGrid')); }));
  $$('[data-goal]').forEach(b => b.addEventListener('click', () => { if (goalTab === b.dataset.goal) return; goalTab = b.dataset.goal; sfx('click'); renderGoals(); $('#goalList').scrollTop = 0; animIn($('#goalList')); }));
  $('#againBtn').addEventListener('click', () => { sfx('click'); if (lastMode === 'battle') { if (lastBattleMode === 'bot') { const w = B && B.S && B.S.winner === B.me; startStage(w ? save.stage : stagePlaying); } else { openArena(); findMatch(); } } else if (lastMode === 'flap') startRun(); else startMini(lastMode); });
  $('#overMenu').addEventListener('click', () => { sfx('click'); lastMode === 'flap' || lastMode === 'battle' ? toMenu() : toMinis(); });
  $('#reviveBtn').addEventListener('click', () => revive(false));
  $('#adReviveBtn').addEventListener('click', () => { sfx('click'); showAd('rewarded', () => revive(true), showOver); });
  $('#adDoubleBtn').addEventListener('click', () => {
    sfx('click');
    showAd('rewarded', () => {
      if (doubleUsed || lastEarned <= 0) return showOver();
      doubleUsed = true; save.coins += lastEarned; save.stats.earned += lastEarned;
      $('#oV2').textContent = '+' + lastEarned * 2; $('#adDoubleBtn').style.display = 'none';
      sfx('claim'); vib(30); persist(); pushSave(); refreshUI(); showOver();
    }, showOver);
  });
  $('#adClose').addEventListener('click', () => { clearInterval(adTimer); const cb = adCb; adCb = null; adBack = null; if (cb) cb(); });
  $('#adCancel').addEventListener('click', () => { clearInterval(adTimer); const cb = adBack; adCb = null; adBack = null; if (cb) cb(); });
  $('#iapClose').addEventListener('click', () => { sfx('click'); renderStore(); show('store'); });
  $('#barBtn').addEventListener('click', e => {
    e.stopPropagation(); sfx('click');
    if (state === 'battle') { if (B && B.confirmForfeit > 0) forfeitBattle(); else if (B) { B.confirmForfeit = 2.5; updateBar(); toast('Tap again to give up'); } return; }
    state === 'ready' ? toMenu() : pause();
  });
  $('#battleBtn').addEventListener('click', () => gate('battle', () => { sfx('click'); openArena(); }));
  $('#passBtn').addEventListener('click', () => gate('pass', () => { sfx('click'); openPass(); }));
  $('#settingsBtn').addEventListener('click', () => { sfx('click'); openSettings(); });
  $('#evoOk').addEventListener('click', () => { sfx('click'); evoShown = null; if (state === 'home') enterHome(); else menuQueue(); });
  $('#roadBtn').addEventListener('click', () => { sfx('click'); openRoad(); });
  $('#roadBack').addEventListener('click', () => { sfx('click'); openArena(); });
  $('#eventBtn').addEventListener('click', () => gate('events', () => { sfx('click'); openEvents(); }));
  $('#setAcct').addEventListener('click', () => { sfx('click'); openAccount(); });
  $('#sfxVol').addEventListener('input', e => { save.sfxVol = e.target.value / 100; save.sfx = save.sfxVol > 0; });
  $('#sfxVol').addEventListener('change', () => { ac(); sfx('coin'); persist(); pushSave(); });
  $('#musicVol').addEventListener('input', e => { save.musicVol = e.target.value / 100; save.music = save.musicVol > 0; });
  $('#musicVol').addEventListener('change', () => { ac(); persist(); pushSave(); });
  $('#vibBtn').addEventListener('click', () => { save.vib = !save.vib; persist(); pushSave(); refreshUI(); vib(30); sfx('click'); });
  $('#fxBtn').addEventListener('click', () => { save.fxLow = !save.fxLow; lowFx = save.fxLow || autoLow; persist(); pushSave(); refreshUI(); sfx('click'); });
  $('#adsBtn').addEventListener('click', () => { save.adConsent = save.adConsent === 'yes' ? 'no' : 'yes'; persist(); pushSave(); refreshUI(); sfx('click'); logEvent('ad_consent', { value:save.adConsent }); });
  $('#supportBtn').addEventListener('click', () => { window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('Cave Flap support (v' + APP_VERSION + ')')}`; });
  $$('[data-legal]').forEach(b => b.addEventListener('click', () => openLegal(b.dataset.legal)));
  $('#legalBack').addEventListener('click', () => { sfx('click'); show(legalReturn); });
  $('#consentYes').addEventListener('click', () => setConsent('yes'));
  $('#consentNo').addEventListener('click', () => setConsent('no'));
  $('#ageYes').addEventListener('click', () => { save.age18 = true; arenaStake = pendingStake; persist(); pushSave(); sfx('click'); openArena(); });
  $('#ageNo').addEventListener('click', () => { save.age18 = false; arenaStake = 0; persist(); pushSave(); sfx('click'); openArena(); toast('Friendly battles only'); });
  $('#unTry').addEventListener('click', () => { const f = unlockShown; seeUnlock(); sfx('click'); if (f) f.open(); });
  $('#unLater').addEventListener('click', () => { seeUnlock(); sfx('click'); menuQueue(); });
  $('#shareBtn').addEventListener('click', shareResult);
  $('#acctBtn').addEventListener('click', () => { sfx('click'); openAccount(); });
  $('#boardAcct').addEventListener('click', () => { sfx('click'); openAccount(); });
  $('#setupGo').addEventListener('click', createAccount);
  $('#setupName').addEventListener('keydown', e => { if (e.key === 'Enter') createAccount(); });
  $('#acSaveNow').addEventListener('click', () => { sfx('click'); persist(); pushSave(true); pushPlayer(); toast('Saved to your account'); setTimeout(renderAccount, 600); });
  $('#acReset').addEventListener('click', startOver);
  $('#trainBtn').addEventListener('click', startTraining);
  $('#trailBtn').addEventListener('click', () => { sfx('click'); openTrail(); });
  $('#trailBack').addEventListener('click', () => { sfx('click'); openArena(); });
  $('#findBtn').addEventListener('click', findMatch);
  $('#searchCancel').addEventListener('click', () => { sfx('click'); cancelSearch(); openArena(); });
  $$('#bMoves .btn').forEach(b => b.addEventListener('click', () => chooseMove(b.dataset.mv)));
  $('#resumeBtn').addEventListener('click', () => { sfx('click'); resume(); });
  $('#restartBtn').addEventListener('click', () => {
    sfx('click'); paused = false;
    if (lastMode === 'flap') { if (state === 'play' && (score > 0 || runFlaps > 0)) commitRun(); startRun(); } else startMini(lastMode);
  });
  $('#quitBtn').addEventListener('click', () => {
    sfx('click'); paused = false;
    if (lastMode === 'flap') { if (state === 'play' && (score > 0 || runFlaps > 0)) commitRun(); toMenu(); } else toMinis();
  });
  $('#tutGo').addEventListener('click', () => { logEvent('tutorial_done'); save.tut = true; persist(); pushSave(); sfx('click'); startRun(); });
  $('#claimDaily').addEventListener('click', claimDaily);
  $('#feedBtn').addEventListener('click', () => { sfx('click'); if (bathMode) finishBath(); $('#toyTray').classList.remove('on'); $('#foodTray').classList.toggle('on'); renderHome(); });
  $('#bathBtn').addEventListener('click', toggleBath);
  $('#boostBtn').addEventListener('click', () => gate('boosts', () => { sfx('click'); if (bathMode) finishBath(); $('#foodTray').classList.remove('on'); refreshUI(); renderCare(); show('care'); }));
  $('#careBack').addEventListener('click', () => { sfx('click'); enterHome(); });
  $('#sleepBtn').addEventListener('click', toggleSleep);
  $('#toysBtn').addEventListener('click', () => { sfx('click'); if (bathMode) finishBath(); $('#foodTray').classList.remove('on'); renderToys(); $('#toyTray').classList.toggle('on'); });
  $('#nickSave').addEventListener('click', () => {
    const nn = $('#nickInput').value.trim().replace(/\s+/g, ' ').slice(0, 16);
    if (nn.length < 2) { sfx('deny'); return toast('Pick a name with at least 2 characters'); }
    save.nick = nn; persist(); pushSave(); pushScore(); pushPlayer(); sfx('buy'); refreshUI(); renderAccount();
    $('#nickSave').textContent = 'Saved'; setTimeout(() => $('#nickSave').textContent = 'Save', 1200);
  });

  const toWorld = e => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width * W, (e.clientY - r.top) / r.height * H]; };
  cv.addEventListener('pointerdown', e => {
    e.preventDefault();
    if (paused) return;
    if (state === 'ready' || state === 'play') { flap(); return; }
    const [x, y] = toWorld(e);
    ptr.x = x; ptr.y = y; ptr.down = true;
    try { cv.setPointerCapture(e.pointerId); } catch (err) {}
    if (state === 'mini') { ptr.has = true; if (cur.down) cur.down(x, y); }
    if (state === 'home') homeDown(x, y);
  });
  cv.addEventListener('pointermove', e => {
    const [x, y] = toWorld(e); ptr.x = x; ptr.y = y;
    if (state === 'mini' && (e.pointerType === 'mouse' || ptr.down)) ptr.has = true;
    if (state === 'mini' && cur && cur.move) cur.move(x, y, ptr.down);
    if (state === 'home' && ptr.down && bathMode) scrub(x, y);
  });
  const up = () => { ptr.down = false; };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  window.addEventListener('keyup', e => { keys[e.code] = false; });
  window.addEventListener('keydown', e => {
    if (e.target && e.target.tagName === 'INPUT') return;
    const k = e.code;
    if (paused) { if (k === 'Escape' || k === 'KeyP') { e.preventDefault(); resume(); } return; }
    if ((k === 'Escape' || k === 'KeyP') && (state === 'play' || state === 'mini')) { e.preventDefault(); pause(); return; }
    if (state === 'battle') {
      const m = { Digit1:'b', Digit2:'s', Digit3:'x', Digit4:'g', Digit5:'h' }[k];
      if (m) { e.preventDefault(); chooseMove(m); }
      return;
    }
    if (state === 'mini') {
      if (cur && cur.key) { cur.key(k); if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault(); }
      if (['ArrowLeft', 'ArrowRight', 'KeyA', 'KeyD'].includes(k)) { keys[k] = true; ptr.has = false; e.preventDefault(); }
      return;
    }
    if (k === 'Space' || k === 'ArrowUp') {
      if (state === 'ready' || state === 'play') { e.preventDefault(); flap(); }
      else if (state === 'over' && $('#over').classList.contains('on') && t - overAt > .7 && !(document.activeElement && document.activeElement.tagName === 'BUTTON' && document.activeElement !== $('#againBtn'))) { e.preventDefault(); startRun(); }
    }
    if (k === 'Escape' && (state === 'ready' || state === 'home')) toMenu();
  });
  window.addEventListener('pagehide', () => { try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} pushSave(true); });
  if (!('vibrate' in navigator)) $('#vibRow').style.display = 'none';
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { pause(); try { localStorage.setItem(KEY, JSON.stringify(save)); } catch (e) {} pushSave(true); }
    else applyOffline();
  });

  lowFx = !!save.fxLow;
  if (!save.unlockInit) { save.seenUnlocks = FEATURES.filter(f => save.player.lvl >= f.lvl).map(f => f.id); save.unlockInit = true; }
  applyOffline(); ensureDaily(); ensureSeason(); buildTabs(); refreshUI();
  if (!save.adConsent) show('consent'); else toMenu();
  logEvent('app_open', { version:APP_VERSION });

  let last = performance.now(), fpsAcc = 0, fpsN = 0, frameN = 0;
  function loop(now) {
    const raw = (now - last) / 1000, dt = Math.min(.033, raw); last = now;
    if (raw < .25) { fpsAcc += raw; fpsN++; if (fpsN >= 120) { if (!lowFx && fpsAcc / fpsN > 1 / 45) { lowFx = true; autoLow = true; } fpsAcc = 0; fpsN = 0; } }
    update(dt); draw();
    if (scorePop > 0) scorePop = Math.max(0, scorePop - dt * 5);
    if (hudPop > 0) hudPop = Math.max(0, hudPop - dt * 5);
    const g = groupOf(state);
    if (g !== sceneGroup) { if (sceneGroup !== null) sceneFade = Math.max(sceneFade, .35); sceneGroup = g; }
    if (sceneFade > 0) {
      ctx.fillStyle = `rgba(11,10,28,${(sceneFade / .35) * .95})`; ctx.fillRect(0, 0, W, H);
      sceneFade = Math.max(0, sceneFade - dt);
    }
    frameN++;
    if ($('#store').classList.contains('on') && frameN % 2 === 0) drawPreviews();
    if ($('#arena').classList.contains('on')) drawArenaPreview();
    if ($('#evolve').classList.contains('on') && evoShown) {
      const c = $('#evoCv'), dpr = DPR(), cw = c.clientWidth, ch = c.clientHeight;
      if (cw) {
        if (c.width !== Math.round(cw * dpr)) { c.width = Math.round(cw * dpr); c.height = Math.round(ch * dpr); }
        const g = c.getContext('2d'), sc = ch / 90, w = cw / sc, sk = skinOf(evoShown);
        g.setTransform(dpr * sc, 0, 0, dpr * sc, 0, 0); g.clearRect(0, 0, w, 90);
        g.save(); g.translate(w / 2, 48); g.strokeStyle = hexA('#ffcf5c', .35); g.lineWidth = 2;
        for (let k = 0; k < 12; k++) { const a = t * .5 + k * .524; g.beginPath(); g.moveTo(Math.cos(a) * 22, Math.sin(a) * 22); g.lineTo(Math.cos(a) * 44, Math.sin(a) * 44); g.stroke(); }
        g.restore();
        g.save(); g.translate(w / 2, 50 + Math.sin(t * 2.5) * 3); g.scale(1.5, 1.5);
        drawBat(g, 0, 0, 0, sk, t, 14, false, { gear:save.outfits[evoShown] || blankOutfit(), wear:0 }); g.restore();
      }
    }
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

// Exported for audio.js (music intensity) and native/firebase modules.
export { state };
