// Static game data tables (skins, caves, gear, missions, IAP catalog, etc).
// Extracted verbatim from the original single-file game; only this header,
// the `save` import and the trailing export list were added.
import { save } from './save.js';

  // ---------- catalog ----------
  const SKINS = [
    { id:'night',   name:'Nightwing', price:0,    body:'#0a0918', wing:'#241f4a', eye:'#ffcf5c', trail:'#ffcf5c' },
    { id:'ember',   name:'Ember',     price:300,  body:'#2b0a0a', wing:'#9a2414', eye:'#ffb347', trail:'#ff7a2e' },
    { id:'frost',   name:'Frostbite', price:500,  body:'#d6ecff', wing:'#6aa9dc', eye:'#1b4d8a', trail:'#bff4ff' },
    { id:'phantom', name:'Phantom',   price:800,  body:'rgba(235,240,255,0.55)', wing:'rgba(200,215,255,0.32)', eye:'#6ff7ff', trail:'#e6f0ff', ghost:true },
    { id:'gold',    name:'Midas',     price:1400, body:'#e8b62c', wing:'#a8741a', eye:'#fffbe6', trail:'#ffe27a', shine:true },
    { id:'neon',    name:'Neon',      price:2000, body:'#12051f', wing:'#12051f', eye:'#ff4fd8', trail:'#39f3ff', neon:true },
    { id:'prism',   name:'Prism',     price:3000, body:'#15122e', wing:'#15122e', eye:'#ffffff', trail:'rainbow', prism:true },
    { id:'storm',   name:'Stormwing', price:5000, body:'#1b2233', wing:'#3a4a6b', eye:'#8fe3ff', trail:'#8fe3ff', bolt:true },
    { id:'coral',   name:'Reefwing', price:7000, body:'#1f4d5a', wing:'#ff7f6e', eye:'#e8fff9', trail:'#ff9e8e', fins:true },
    { id:'vampire', name:'Vampire Lord', price:10000, body:'#1a0610', wing:'#5e0d1c', eye:'#ff2a3d', trail:'#ff2a3d', vamp:true },
    { id:'bone',    name:'Boneclaw', price:15000, body:'#e9e4d6', wing:'#b9b2a0', eye:'#3a2a2a', trail:'#d8d2c0', bones:true },
    { id:'solar',   name:'Sunflare', price:18000, body:'#ff9f1c', wing:'#ffcf3a', eye:'#fff8e0', trail:'#ffcf3a', rays:true },
    { id:'drake',   name:'Obsidian Drake', price:24000, body:'#16120f', wing:'#2e2824', eye:'#ff7a2e', trail:'#ff7a2e', drake:true },
    { id:'void',    name:'Voidling', price:32000, body:'#0a0414', wing:'#241040', eye:'#c46bff', trail:'#c46bff', voidRing:true },
    { id:'nebula',  name:'Nebula', price:44000, body:'#1a1040', wing:'#1a1040', eye:'#ffffff', trail:'#ff9ed8', nebula:true },
    { id:'titan',   name:'Iron Titan', price:60000, body:'#6b7280', wing:'#4b5563', eye:'#ffd24a', trail:'#ffd24a', plates:true },
    { id:'celestial', name:'Celestial Seraph', price:0, medals:500, body:'#fff8e7', wing:'#ffe9a8', eye:'#3d8bff', trail:'#ffe27a', angel:true, exclusive:true },
    { id:'eclipse', name:'Eclipse Dragon', price:0, medals:1200, body:'#0b0b0b', wing:'#1a0f05', eye:'#ff4a1c', trail:'#ff4a1c', eclipse:true, drake:true, exclusive:true },
  ];
  const CAVES = [
    { id:'amethyst', name:'Amethyst Cave',  price:0,   top:'#151331', bot:'#1c1b3a', far:'#221f47', rock:'#3a3470', hi:'#6b5fb5', lo:'#26214f', glow:'#ffcf5c', fx:'motes' },
    { id:'magma',    name:'Magma Vents',    price:200, top:'#120404', bot:'#2a0c08', far:'#34100a', rock:'#4f1f15', hi:'#b8431d', lo:'#2e110b', glow:'#ff7a2e', fx:'embers', lava:true },
    { id:'glacier',  name:'Glacier Grotto', price:300, top:'#0b1d33', bot:'#1b3a5a', far:'#20476b', rock:'#5d93bb', hi:'#d8f0ff', lo:'#3d6d92', glow:'#bff4ff', fx:'snow' },
    { id:'emerald',  name:'Emerald Mine',   price:450, top:'#04120b', bot:'#0c2a1c', far:'#113322', rock:'#1f5a3c', hi:'#4fbf7f', lo:'#123a26', glow:'#7dffb0', fx:'spores' },
    { id:'abyss',    name:'Sunken Abyss',   price:800, top:'#020a1a', bot:'#05304a', far:'#07324c', rock:'#123a5a', hi:'#2ea3b8', lo:'#0a2238', glow:'#6ff7ff', fx:'bubbles' },
  ];
  const SLOTS = { hat:'Hat', face:'Face', back:'Back', trail:'Trail' };
  const GEAR = [
    { id:'party',   slot:'hat',   name:'Party Hat',     price:90,  bonus:{ crys:1 },   btxt:'+1% crystals' },
    { id:'tophat',  slot:'hat',   name:'Top Hat',       price:120, bonus:{ crys:2 },   btxt:'+2% crystals' },
    { id:'witch',   slot:'hat',   name:'Witch Hat',     price:300, bonus:{ slow:.5 },  btxt:'+0.5s slow-mo' },
    { id:'crown',   slot:'hat',   name:'Crown',         price:600, bonus:{ crys:3 },   btxt:'+3% crystals' },
    { id:'nerd',    slot:'face',  name:'Round Specs',   price:100, bonus:{ xp:3 },     btxt:'+3% bat XP' },
    { id:'shades',  slot:'face',  name:'Shades',        price:150, bonus:{ luck:1 },   btxt:'+1% power-up chance' },
    { id:'monocle', slot:'face',  name:'Monocle',       price:250, bonus:{ crit:2 },   btxt:'+2% critical hits in battle' },
    { id:'redcape', slot:'back',  name:'Hero Cape',     price:200, bonus:{ hp:4 },     btxt:'+4 HP in battle' },
    { id:'royal',   slot:'back',  name:'Royal Cape',    price:500, bonus:{ hp:8 },     btxt:'+8 HP in battle' },
    { id:'smoke',   slot:'trail', name:'Smoke Trail',   price:140, bonus:{ magnet:.5 }, btxt:'+0.5s magnet' },
    { id:'sparkle', slot:'trail', name:'Sparkle Trail', price:180, bonus:{ crys:2 },   btxt:'+2% crystals' },
    { id:'hearts',  slot:'trail', name:'Heart Trail',   price:220, bonus:{ fun:4 },    btxt:'Fun drains 4% slower' },
    { id:'fire',    slot:'trail', name:'Fire Trail',    price:350, bonus:{ dmg:2 },    btxt:'+2% battle damage' },
  ];
  // Every bat has its own two exclusive cosmetics that only it can wear.
  const EXCL = {
    night:{ h:['Shadow Hood', 'hood', '#241f4a', '#4a3f8a'], a:['Moonmotes', 'ring', ['#ffcf5c']] },
    ember:{ h:['Flame Crown', 'flamecrown', '#ff7a2e', '#ffd24a'], a:['Cinder Trail', 'dot', ['#ff3b1f', '#ffb347']] },
    frost:{ h:['Ice Spikes', 'icecrown', '#bff4ff', '#ffffff'], a:['Snowfall', 'star', ['#ffffff', '#bff4ff']] },
    phantom:{ h:['Ghost Wisp', 'wisp', '#e6f0ff', '#6ff7ff'], a:['Ectoplasm', 'ring', ['#6ff7ff', '#e6f0ff']] },
    gold:{ h:['Laurel Wreath', 'laurel', '#ffcc33', '#fff1b8'], a:['Coin Shower', 'coin', ['#ffe27a', '#e8b62c']] },
    neon:{ h:['Cyber Visor', 'visor', '#ff4fd8', '#39f3ff', 'face'], a:['Glitch Trail', 'square', ['#ff4fd8', '#39f3ff']] },
    prism:{ h:['Crystal Shard', 'crystal', 'rainbow', '#ffffff'], a:['Spectrum', 'star', ['rainbow']] },
    storm:{ h:['Storm Mohawk', 'mohawk', '#8fe3ff', '#ffffff'], a:['Static', 'bolt', ['#8fe3ff', '#ffffff']] },
    coral:{ h:['Seashell Bow', 'bow', '#ff9ec4', '#fff1f6'], a:['Bubble Stream', 'ring', ['#bff4ff', '#ffffff']] },
    vampire:{ h:['Blood Crown', 'tiara', '#b0102a', '#ff2a3d'], a:['Blood Mist', 'dot', ['#8a0f1f', '#ff2a3d']] },
    bone:{ h:['Skull Cap', 'skull', '#e9e4d6', '#3a2a2a'], a:['Bone Dust', 'square', ['#d8d2c0', '#b9b2a0']] },
    solar:{ h:['Sun Halo', 'rays', '#ffcf3a', '#fff1b8'], a:['Sunbeams', 'star', ['#ffcf3a', '#fff1b8']] },
    drake:{ h:['Dragon Helm', 'helm', '#4a403a', '#ff7a2e'], a:['Magma Sparks', 'diamond', ['#ff7a2e', '#ffcf3a']] },
    void:{ h:['Void Horns', 'horns', '#6b2fb3', '#c46bff'], a:['Rift Shards', 'diamond', ['#c46bff', '#3a0f6b']] },
    nebula:{ h:['Star Tiara', 'startiara', '#ff9ed8', '#9fd8ff'], a:['Stardust', 'star', ['#ff9ed8', '#9fd8ff', '#ffffff']] },
    titan:{ h:['Iron Helm', 'ironhelm', '#9ca3af', '#1f2937'], a:['Gear Sparks', 'bolt', ['#ffd24a', '#ff9a2e']] },
    celestial:{ h:['Seraph Halo', 'halo', '#ffe27a', '#ffffff'], a:['Feathers', 'feather', ['#fff8e7', '#ffe9a8']] },
    eclipse:{ h:['Corona Crown', 'corona', '#ff4a1c', '#ffb347'], a:['Eclipse Embers', 'ring', ['#ff4a1c', '#ffb347']] },
  };
  SKINS.forEach((sk, i) => {
    const e = EXCL[sk.id]; if (!e) return;
    const r50 = v => Math.round(v / 50) * 50;
    const hp = sk.medals ? { medals:Math.round(sk.medals * .2) } : { price:Math.max(150, r50(sk.price * .3)) };
    const ap = sk.medals ? { medals:Math.round(sk.medals * .15) } : { price:Math.max(120, r50(sk.price * .2)) };
    const hc = 2 + Math.floor(i / 4), ad = 1 + Math.floor(i / 5);
    GEAR.push({ id:'x_' + sk.id + '_h', slot:e.h[4] || 'hat', name:e.h[0], kind:e.h[1], c1:e.h[2], c2:e.h[3], only:sk.id, ...hp, bonus:{ crys:hc }, btxt:`+${hc}% crystals` });
    GEAR.push({ id:'x_' + sk.id + '_a', slot:'trail', name:e.a[0], shape:e.a[1], colors:e.a[2], only:sk.id, ...ap, bonus:{ dmg:ad }, btxt:`+${ad}% battle damage` });
  });
  // Weekly missions: longer and harder than dailies; they also pay event tokens.
  const WEEKLY = [
    { id:'w_pil300',  type:'pillars',  target:300,  r:200, tok:20, text:'Fly through 300 gaps' },
    { id:'w_run40',   type:'runScore', max:true, target:40, r:250, tok:25, text:'Score 40 in one run' },
    { id:'w_lvl6',    type:'level',    max:true, target:6,  r:250, tok:25, text:'Reach level 6 in the main game' },
    { id:'w_gem80',   type:'gems',     target:80,   r:200, tok:20, text:'Grab 80 floating crystals' },
    { id:'w_pow20',   type:'powers',   target:20,   r:180, tok:20, text:'Pick up 20 power-ups' },
    { id:'w_mini20',  type:'minis',    target:20,   r:200, tok:20, text:'Play 20 minigames' },
    { id:'w_feed15',  type:'feed',     target:15,   r:150, tok:15, text:'Feed your bat 15 times' },
    { id:'w_train8',  type:'trainWin', target:8,    r:220, tok:25, text:'Beat 8 trail levels' },
    { id:'w_flap2k',  type:'flaps',    target:2000, r:180, tok:20, text:'Flap 2,000 times' },
    { id:'w_bath8',   type:'bath',     target:8,    r:150, tok:15, text:'Give your bat 8 baths' },
    { id:'w_toy12',   type:'toy',      target:12,   r:150, tok:15, text:'Play with your bat’s toys 12 times' },
  ];
  // Weekly events rotate; the theme's activity pays double tokens.
  const EVENTS = [
    { id:'flight', name:'Flight Frenzy', icon:'🦇', src:'run',    desc:'Double tokens from the main game this week.', gear:'ev_jet' },
    { id:'arcade', name:'Arcade Week',   icon:'🎮', src:'mini',   desc:'Double tokens from minigames this week.',   gear:'ev_visor' },
    { id:'arena',  name:'Battle Week',   icon:'⚔️', src:'battle', desc:'Double tokens from battles this week.',     gear:'ev_laurel' },
    { id:'care',   name:'Bat Spa Week',  icon:'🛁', src:'care',   desc:'Double tokens from caring for your bat this week.', gear:'ev_cap' },
  ];
  GEAR.push(
    { id:'ev_jet',    slot:'trail', name:'Jet Stream',      shape:'bolt', colors:['#9fd8ff', '#ffffff'], event:true, bonus:{ crys:2 }, btxt:'+2% crystals' },
    { id:'ev_visor',  slot:'face',  name:'Arcade Visor',    kind:'visor', c1:'#7dffb0', c2:'#ffcf5c', event:true, bonus:{ xp:4 }, btxt:'+4% bat XP' },
    { id:'ev_laurel', slot:'hat',   name:'Champion Laurel', kind:'laurel', c1:'#ff6b7d', c2:'#ffd1d8', event:true, bonus:{ dmg:2 }, btxt:'+2% battle damage' },
    { id:'ev_cap',    slot:'hat',   name:'Sleepy Cap',      kind:'hood', c1:'#ff9ed8', c2:'#fff1f6', event:true, bonus:{ fun:4 }, btxt:'Fun drains 4% slower' },
  );
  const TOKEN_SHOP = [
    { id:'medal1',  name:'Medallion',       icon:'medal', amt:1,   cost:40,  limit:5, give:{ medals:1 } },
    { id:'medal5',  name:'Medallion pouch', icon:'medal', amt:5,   cost:180, limit:1, give:{ medals:5 } },
    { id:'crys300', name:'Crystal bundle',  icon:'gem',   amt:300, cost:25,  limit:10, give:{ coins:300 } },
    { id:'heal',    name:'Full heal',       icon:'🌿',    amt:0,   cost:15,  limit:3, give:{ heal:100 } },
    { id:'batxp',   name:'Bat XP boost',    icon:'⭐',    amt:150, cost:30,  limit:3, give:{ batxp:150 } },
  ];
  // Arenas unlock as trophies grow. Early arenas protect you from dropping below their gate.
  const ARENAS = [
    { at:0,    name:'Training Cave',  icon:'🪨', color:'#8a93c9', reward:null },
    { at:300,  name:'Moss Hollow',    icon:'🌿', color:'#7dffb0', reward:{ coins:300 }, floor:true },
    { at:600,  name:'Crystal Mines',  icon:'💎', color:'#6fc8ff', reward:{ coins:600, medals:2 }, floor:true },
    { at:1000, name:'Lava Depths',    icon:'🌋', color:'#ff7a2e', reward:{ coins:1000, medals:4 }, floor:true },
    { at:1500, name:'Frozen Chasm',   icon:'❄️', color:'#bff4ff', reward:{ coins:1500, medals:6 } },
    { at:2100, name:'Sunken Temple',  icon:'🏛️', color:'#2ea3b8', reward:{ coins:2200, medals:8 } },
    { at:2800, name:'Shadow Realm',   icon:'🌑', color:'#c46bff', reward:{ coins:3000, medals:12 } },
    { at:3600, name:'Celestial Peak', icon:'✨', color:'#ffe27a', reward:{ coins:4000, medals:16 } },
    { at:4500, name:'Legend League',  icon:'👑', color:'#ffcf5c', reward:{ coins:6000, medals:25 } },
  ];
  const ROAD_STEP = 100, ROAD_MAX = 50;  // a reward every 100 trophies up to 5,000
  const roadReward = i => i % 10 === 0 ? { tokens:40 } : i % 5 === 0 ? { medals:2 + Math.floor(i / 10) } : { coins:40 + i * 12 };
  // Bats are no longer bought: your bat evolves along this chain every 10 bat levels.
  const CHAIN = SKINS.filter(s => !s.exclusive).map(s => s.id);
  const batBonus = id => { const i = CHAIN.indexOf(id); return i >= 0 ? i * 2 : id === 'celestial' ? 34 : id === 'eclipse' ? 38 : 0; };
  const EVOLVE_AT = 10, RESET_VERSION = 3;
  const blankOutfit = () => ({ hat:null, face:null, back:null, trail:null });
  // Small bonuses from worn accessories, summed over the equipped slots.
  function gearBonus(key, gear) {
    gear = gear || (typeof save !== 'undefined' ? save.gear : {});
    let v = 0;
    for (const sl in gear) { const it = GEAR.find(g => g.id === gear[sl]); if (it && it.bonus && it.bonus[key]) v += it.bonus[key]; }
    return v;
  }
  const reviveCost = l => Math.round(30 * (1 - .1 * l));
  const UPGRADES = [
    { id:'magnet', icon:'🧲', name:'Crystal Magnet', max:5, cost:[150,350,700,1300,2400], desc:l => `Magnet power-up lasts ${5 + l}s` },
    { id:'slow',   icon:'⏳', name:'Slow-mo',        max:5, cost:[150,350,700,1300,2400], desc:l => `Slow-mo power-up lasts ${+(4 + l * .6).toFixed(1)}s` },
    { id:'luck',   icon:'🍀', name:'Lucky Finds',    max:5, cost:[200,450,900,1700,3000], desc:l => `${12 + l * 2}% power-up chance per gap` },
    { id:'value',  icon:'💎', name:'Crystal Value',  max:5, cost:[300,700,1400,2600,4500], desc:l => `+${l * 5}% crystals from every game` },
    { id:'revive', icon:'💫', name:'Cheap Revives',  max:3, cost:[400,900,1800], desc:l => `Revive costs ${reviveCost(l)} crystals` },
    { id:'head',   icon:'🛡️', name:'Head Start',     max:1, cost:[1500], desc:l => l ? 'Every run starts with a shield' : 'Start every run with a shield' },
  ];
  const FOODS = [
    { id:'moth',   icon:'🦋', name:'Moth',   price:5,  hunger:15, fun:0 },
    { id:'beetle', icon:'🐞', name:'Beetle', price:12, hunger:35, fun:3 },
    { id:'mango',  icon:'🥭', name:'Mango',  price:20, hunger:45, fun:10 },
    { id:'melon',  icon:'🍉', name:'Melon',  price:30, hunger:65, fun:15 },
    { id:'cake',   icon:'🍰', name:'Cake',   price:45, hunger:40, fun:45 },
    { id:'herb',   icon:'🌿', name:'Healing Herb', price:30, hunger:5, fun:0, heal:35 },
  ];
  const MISSIONS = [
    { id:'run15',   type:'runScore', max:true, target:15,  r:40, text:'Score 15 in one run' },
    { id:'run25',   type:'runScore', max:true, target:25,  r:70, text:'Score 25 in one run' },
    { id:'pil50',   type:'pillars',  target:50,  r:40, text:'Fly through 50 gaps' },
    { id:'lvl3',    type:'level',    max:true, target:3,   r:40, text:'Reach level 3' },
    { id:'lvl5',    type:'level',    max:true, target:5,   r:80, text:'Reach level 5' },
    { id:'gem12',   type:'gems',     target:12,  r:35, text:'Grab 12 floating crystals' },
    { id:'pow3',    type:'powers',   target:3,   r:35, text:'Pick up 3 power-ups' },
    { id:'mini3',   type:'minis',    target:3,   r:30, text:'Play 3 minigames' },
    { id:'moth30',  type:'moths',    target:30,  r:40, text:'Catch 30 moths in Moth Catch' },
    { id:'echo6',   type:'echo',     max:true, target:6,   r:45, text:'Clear 6 rounds in Echo Memory' },
    { id:'hop150',  type:'hop',      max:true, target:150, r:45, text:'Reach height 150 in Cave Hop' },
    { id:'whack20', type:'whack',    max:true, target:20,  r:40, text:'Score 20 in Whack-a-Bat' },
    { id:'pairs1',  type:'pairsWin', target:1,   r:40, text:'Match every pair in Pair Match' },
    { id:'train2',  type:'trainWin', target:2,   r:30, text:'Beat 2 trail levels' },
    { id:'feed3',   type:'feed',     target:3,   r:25, text:'Feed your bat 3 times' },
    { id:'bath2',   type:'bath',     target:2,   r:25, text:'Give your bat 2 baths' },
    { id:'flap300', type:'flaps',    target:300, r:30, text:'Flap 300 times' },
  ];
  // Badge families: each has bronze, silver and gold tiers. Old badge ids are reused so earlier claims carry over.
  const TIERS = ['Bronze', 'Silver', 'Gold'];
  const sum = o => Object.values(o).reduce((a, b) => a + b, 0);
  const BADGE_FAMS = [
    { id:'score',   icon:'🎯', name:'High Flyer',     val:s => s.best,                 t:[10, 25, 50],         ids:['s10', 's25', 's50'],               r:[30, 60, 150],   d:n => `Score ${n} in one run` },
    { id:'level',   icon:'⛰️', name:'Deep Diver',     val:s => s.bestLevel,            t:[3, 5, 8],            ids:['l3', 'l5', 'l8'],                  r:[40, 80, 200],   d:n => `Reach level ${n} in the main game` },
    { id:'runs',    icon:'🦇', name:'Frequent Flyer', val:s => s.games,                t:[1, 50, 250],         ids:['first', 'runs50', 'runs250'],      r:[20, 100, 300],  d:n => n === 1 ? 'Finish a run' : `Finish ${n} runs` },
    { id:'flaps',   icon:'💨', name:'Wing Power',     val:s => s.totalFlaps,           t:[1000, 10000, 50000], ids:['f1k', 'f10k', 'f50k'],             r:[50, 250, 600],  d:n => `Flap ${n.toLocaleString()} times` },
    { id:'earn',    icon:'💎', name:'Crystal Hoarder', val:s => s.stats.earned,        t:[1000, 10000, 100000], ids:['earn1k', 'earn10k', 'earn100k'],  r:[50, 200, 800],  d:n => `Earn ${n.toLocaleString()} crystals in total` },
    { id:'skins',   icon:'🧬', name:'Evolution',      val:s => s.evo,                  t:[1, 5, 12],           ids:['skin', 'skins5', 'skins'],         r:[20, 150, 500],  d:n => n === 1 ? 'Evolve your bat once' : `Evolve your bat ${n} times` },
    { id:'gear',    icon:'🎩', name:'Fashionista',    val:s => s.gearOwned.length,     t:[3, 10, 25],          ids:['gear3', 'gear10', 'gear25'],       r:[40, 150, 400],  d:n => `Own ${n} accessories` },
    { id:'caves',   icon:'🗺️', name:'Explorer',       val:s => s.caves.length - 1,     t:[1, 3, 4],            ids:['cave1', 'cave3', 'caves'],         r:[20, 100, 300],  d:n => n === 1 ? 'Buy a new cave' : n === 4 ? 'Own every cave' : `Own ${n} extra caves` },
    { id:'colors',  icon:'🌈', name:'Colorist',       val:s => s.gemColors.length - 1, t:[1, 4, 7],            ids:['color1', 'color4', 'colors'],      r:[20, 80, 250],   d:n => n === 1 ? 'Buy a crystal color' : n === 7 ? 'Own every crystal color' : `Own ${n} crystal colors` },
    { id:'up',      icon:'🔧', name:'Tinkerer',       val:s => sum(s.up),              t:[5, 12, 24],          ids:['up5', 'up12', 'up24'],             r:[60, 200, 500],  d:n => n === 24 ? 'Max out every upgrade' : `Buy ${n} upgrade levels` },
    { id:'pet',     icon:'💛', name:'Best Friends',   val:s => s.batLevels,            t:[10, 50, 120],          ids:['pet5', 'pet10', 'pet15'],          r:[120, 300, 800], d:n => `Gain ${n} bat levels in total` },
    { id:'player',  icon:'⭐', name:'Veteran',        val:s => s.player.lvl,           t:[5, 10, 20],          ids:['pl5', 'pl10', 'pl20'],             r:[60, 200, 600],  d:n => `Reach player level ${n}` },
    { id:'fed',     icon:'🍽️', name:'Chef',           val:s => s.stats.fed,            t:[10, 50, 200],        ids:['fed10', 'fed50', 'fed200'],        r:[30, 100, 300],  d:n => `Feed your bat ${n} times` },
    { id:'boost',   icon:'🏅', name:'Pampered',       val:s => sum(s.care),            t:[1, 8, 20],           ids:['boost', 'boost8', 'boost20'],      r:[40, 150, 500],  d:n => n === 1 ? 'Buy a bat boost' : `Buy ${n} bat boost levels` },
    { id:'medals',  icon:'🥇', name:'Medal Hunter',   val:s => s.stats.medals,         t:[1, 10, 50],          ids:['medal1', 'medal10', 'medal50'],    r:[30, 150, 500],  d:n => n === 1 ? 'Find a medallion' : `Find ${n} medallions` },
    { id:'minis',   icon:'🎮', name:'Arcade Fan',     val:s => s.stats.minis,          t:[10, 50, 200],        ids:['mini10', 'mini50', 'mini200'],     r:[30, 100, 300],  d:n => `Play ${n} minigames` },
    { id:'allmini', icon:'🕹️', name:'All-Rounder',    val:s => MINI_IDS.filter(k => s.mini[k] > 0).length, t:[3, 8, 15], ids:['arcade3', 'arcade', 'arcade10'], r:[40, 80, 300], d:n => n === 15 ? 'Score in every minigame' : `Score in ${n} different minigames` },
    { id:'unlock',  icon:'🔓', name:'Big Spender',    val:s => s.minisOwned.length,    t:[1, 3, 5],            ids:['unlock1', 'unlock3', 'unlockall'], r:[60, 300, 1000], d:n => n === 1 ? 'Unlock a premium minigame' : n === 10 ? 'Unlock every premium minigame' : `Unlock ${n} premium minigames` },
    { id:'wins',    icon:'⚔️', name:'Fighter',        val:s => s.battle.w + s.battle.pw, t:[1, 10, 50],        ids:['win1', 'win10', 'win50'],          r:[30, 120, 400],  d:n => n === 1 ? 'Win a battle' : `Win ${n} battles` },
    { id:'trail',   icon:'🗺️', name:'Trailblazer',    val:s => s.stage - 1,            t:[25, 100, 500],       ids:['trail25', 'trail100', 'trail500'], r:[60, 300, 1200], d:n => `Clear ${n} trail levels` },
    { id:'trophy',  icon:'🏆', name:'Climber',        val:s => s.bestTrophies,         t:[300, 1500, 4500],    ids:['tr300', 'tr1500', 'tr4500'],       r:[80, 400, 1500], d:n => `Reach ${n.toLocaleString()} trophies` },
    { id:'pvp',     icon:'🏟️', name:'Gladiator',      val:s => s.battle.pw,            t:[1, 10, 50],          ids:['pvp1', 'pvp10', 'pvp50'],          r:[80, 300, 900],  d:n => n === 1 ? 'Win an online battle' : `Win ${n} online battles` },
    { id:'streak',  icon:'📅', name:'Regular',        val:s => s.streak.best,          t:[3, 7, 30],           ids:['streak3', 'streak7', 'streak30'],  r:[40, 150, 600],  d:n => `Claim ${n} daily rewards in a row` },
    { id:'revive',  icon:'💫', name:'Second Wind',    val:s => s.stats.revives,        t:[1, 10, 50],          ids:['revive', 'rev10', 'rev50'],        r:[20, 80, 250],   d:n => n === 1 ? 'Revive once' : `Revive ${n} times` },
  ];
  const ACH = BADGE_FAMS.flatMap(f => f.t.map((n, i) => ({ id:f.ids[i], fam:f.id, tier:i, n, name:`${f.name} ${TIERS[i]}`, desc:f.d(n), r:f.r[i], test:s => f.val(s) >= n })));
  const DAILY = [10, 20, 30, 40, 60, 80, 150];
  const GEM_COLORS = [
    { id:'gold',     name:'Gold',        price:0,   c:'#ffcf5c' },
    { id:'ruby',     name:'Ruby',        price:150, c:'#ff4f6d' },
    { id:'emerald',  name:'Emerald',     price:150, c:'#4dff9a' },
    { id:'sapphire', name:'Sapphire',    price:200, c:'#4f9dff' },
    { id:'amethyst', name:'Amethyst',    price:250, c:'#c07cff' },
    { id:'rose',     name:'Rose Quartz', price:300, c:'#ff9ed8' },
    { id:'diamond',  name:'Diamond',     price:500, c:'#e8f6ff' },
    { id:'rainbow',  name:'Rainbow',     price:900, c:'rainbow' },
  ];
  const GEM_CHANCE = .42, MEDAL_CHANCE = GEM_CHANCE / 20;
  const CARE = [
    { id:'food',  icon:'🍽️', name:'Iron Stomach', max:5, cost:[1,3,6,10,16], desc:l => l ? `Food drains ${l * 8}% slower` : 'Food drains at the normal rate' },
    { id:'sleep', icon:'🌙', name:'Deep Sleeper', max:5, cost:[1,3,6,10,16], desc:l => l ? `Sleep refills ${l * 25}% faster, energy drains ${l * 6}% slower` : 'Normal sleep and energy' },
    { id:'fun',   icon:'🎈', name:'Playful',      max:5, cost:[1,3,6,10,16], desc:l => l ? `Fun drains ${l * 8}% slower, cuddles give +${Math.ceil(l / 2)} extra fun` : 'Fun drains at the normal rate' },
    { id:'clean', icon:'🧼', name:'Tidy',         max:5, cost:[1,3,6,10,16], desc:l => l ? `Clean drains ${l * 8}% slower, scrubbing is ${l * 20}% faster` : 'Clean drains at the normal rate' },
    { id:'heart', icon:'💛', name:'Big Heart',    max:4, cost:[3,6,10,16], desc:l => `Happy bat bonus is +${10 + l * 2}% crystals` },
  ];
  // Real-money products. Prices are display values; connect a payment provider and grant from its success callback.
  const IAP = [
    { id:'cf_crystals_500',   group:'Crystals', icon:'💎', name:'Crystal Pouch', gives:'500 crystals',    price:'€0.99' },
    { id:'cf_crystals_1200',  group:'Crystals', icon:'💎', name:'Crystal Sack',  gives:'1,200 crystals',  price:'€1.99', tag:'+20%' },
    { id:'cf_crystals_3500',  group:'Crystals', icon:'💰', name:'Crystal Chest', gives:'3,500 crystals',  price:'€4.99', tag:'Popular' },
    { id:'cf_crystals_8000',  group:'Crystals', icon:'💰', name:'Crystal Vault', gives:'8,000 crystals',  price:'€9.99', tag:'+60%' },
    { id:'cf_crystals_18000', group:'Crystals', icon:'🐉', name:'Dragon Hoard',  gives:'18,000 crystals', price:'€19.99', tag:'Best value' },
    { id:'cf_medals_5',   group:'Medallions', icon:'🏅', name:'Medallion Pouch', gives:'5 medallions',   price:'€0.99' },
    { id:'cf_medals_12',  group:'Medallions', icon:'🏅', name:'Medallion Sack',  gives:'12 medallions',  price:'€1.99', tag:'+20%' },
    { id:'cf_medals_35',  group:'Medallions', icon:'🏆', name:'Medallion Chest', gives:'35 medallions',  price:'€4.99', tag:'Popular' },
    { id:'cf_medals_80',  group:'Medallions', icon:'🏆', name:'Medallion Vault', gives:'80 medallions',  price:'€9.99', tag:'+60%' },
    { id:'cf_medals_180', group:'Medallions', icon:'👑', name:'Royal Treasury',  gives:'180 medallions', price:'€19.99', tag:'Best value' },
    { id:'cf_starter',  group:'Specials', icon:'🎁', name:'Starter Pack', gives:'1,500 crystals, the Neon skin and the Crown. One time only.', price:'€2.99', tag:'Best deal' },
    { id:'cf_noads',    group:'Specials', icon:'🚫', name:'Remove Ads',   gives:'No pop-up or banner ads, forever. Rewarded ads stay optional.', price:'€2.99' },
    { id:'cf_pass_premium', group:'Specials', icon:'🎟️', name:'Premium Season Pass', gives:'A second, bigger reward on every season pass tier this season.', price:'€4.99' },
    { id:'cf_vip_month', group:'Specials', icon:'👑', name:'VIP Pass',    gives:'100 crystals every day, double daily rewards, and no pop-up ads.', price:'€4.99/mo' },
  ];
  const AD_FREE_REWARD = 25, AD_FREE_PER_DAY = 5, INTERSTITIAL_EVERY = 5;
  const CATS = [
    { k:'best', label:'Best score' }, { k:'plLvl', label:'Player level' },
    { k:'evo', label:'Evolution' }, { k:'trophies', label:'Trophies' }, { k:'week', label:'This week' },
  ];
  const BASE_MINIS = ['moths', 'echo', 'hop', 'whack', 'pairs'], PAID_MINIS = ['sonar', 'stack', 'dash', 'slash', 'beats', 'firefly', 'snake', 'bubble', 'spike', 'react'];
  const MINI_IDS = [...BASE_MINIS, ...PAID_MINIS];


export { ACH, AD_FREE_PER_DAY, AD_FREE_REWARD, ARENAS, BADGE_FAMS, BASE_MINIS, CARE, CATS, CAVES, CHAIN, DAILY, EVENTS, EVOLVE_AT, EXCL, FOODS, GEAR, GEM_CHANCE, GEM_COLORS, IAP, INTERSTITIAL_EVERY, MEDAL_CHANCE, MINI_IDS, MISSIONS, PAID_MINIS, RESET_VERSION, ROAD_MAX, ROAD_STEP, SKINS, SLOTS, TIERS, TOKEN_SHOP, UPGRADES, WEEKLY, batBonus, blankOutfit, gearBonus, reviveCost, roadReward, sum };
