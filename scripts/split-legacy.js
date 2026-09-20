// One-time build script: splits src/game-legacy.js (verbatim copy of the original
// cave-flap.html game script) into ES modules without altering any game logic.
// Every extracted chunk is a byte-identical slice of the original file; only
// import/export boilerplate is added around it.
'use strict';
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(root, 'src/game-legacy.js'), 'utf8');
const lines = src.split('\n');
const slice = (a, b) => lines.slice(a - 1, b).join('\n');

const CATALOG_EXPORTS = ['ACH','AD_FREE_PER_DAY','AD_FREE_REWARD','ARENAS','BADGE_FAMS','BASE_MINIS','CARE','CATS','CAVES','CHAIN','DAILY','EVENTS','EVOLVE_AT','EXCL','FOODS','GEAR','GEM_CHANCE','GEM_COLORS','IAP','INTERSTITIAL_EVERY','MEDAL_CHANCE','MINI_IDS','MISSIONS','PAID_MINIS','RESET_VERSION','ROAD_MAX','ROAD_STEP','SKINS','SLOTS','TIERS','TOKEN_SHOP','UPGRADES','WEEKLY','batBonus','blankOutfit','gearBonus','reviveCost','roadReward','sum'];
const SAVE_EXPORTS = ['DEF','KEY','clean','persist','upLvl','wipeTestSave','save','setSave'];
const AUDIO_EXPORTS = ['AC','BUS','MUSIC','SFX','ac','bell','mNext','mStep','mLeadIdx','mTheme','noise','noteOf','semi','sfx','tone','vib'];
const LEGAL_EXPORTS = ['APP_VERSION','COMPANY','LEGAL','SUPPORT_EMAIL'];

fs.mkdirSync(path.join(root, 'src/game'), { recursive: true });

// ---- catalog.js ----
{
  const body = slice(25, 268);
  const out = [
    "// Static game data tables (skins, caves, gear, missions, IAP catalog, etc).",
    "// Extracted verbatim from the original single-file game; only this header,",
    "// the `save` import and the trailing export list were added.",
    "import { save } from './save.js';",
    '',
    body,
    '',
    `export { ${CATALOG_EXPORTS.join(', ')} };`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, 'src/game/catalog.js'), out);
}

// ---- save.js ----
{
  const body = slice(269, 368);
  const out = [
    "// Local save file: schema, defaults, validation/migration (clean()) and persistence.",
    "// Extracted verbatim from the original single-file game.",
    "import {",
    '  ' + CATALOG_EXPORTS.filter(n => n !== 'save').join(', '),
    "} from './catalog.js';",
    "import { clamp, arr, num } from './util.js';",
    '',
    body,
    '',
    '// Added for cross-module use: other modules cannot reassign an imported `save`',
    '// binding directly (ES module live bindings are read-only to importers), so',
    '// they call setSave() instead. Behaviour is identical to the original code,',
    '// which reassigned the module-local `save` variable directly.',
    'export function setSave(v) { save = v; }',
    '',
    `export { ${SAVE_EXPORTS.filter(n => n !== 'setSave').join(', ')} };`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, 'src/game/save.js'), out);
}

// ---- audio.js ----
{
  const body = slice(444, 541);
  const out = [
    '// All sound and music: synthesized in code via Web Audio, no audio files.',
    '// Extracted verbatim from the original single-file game.',
    "import { save } from './save.js';",
    "import { state } from './engine.js';",
    "import { clamp } from './util.js';",
    '',
    body,
    '',
    `export { ${AUDIO_EXPORTS.join(', ')} };`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, 'src/game/audio.js'), out);
}

// ---- legal.js ----
{
  const body = slice(3418, 3446);
  const out = [
    '// Legal text templates + support/version constants.',
    '// Extracted verbatim from the original single-file game; filled in for real',
    '// in src/game/legal.js by the store-listing pass (see docs/BUILD_INSTRUCTIONS.md).',
    '',
    body,
    '',
    `export { ${LEGAL_EXPORTS.join(', ')} };`,
    '',
  ].join('\n');
  fs.writeFileSync(path.join(root, 'src/game/legal.js'), out);
}

// ---- engine.js (everything else) ----
{
  // Remove the four extracted ranges (in one pass, indices are against the ORIGINAL file).
  const removeRanges = [[25, 268], [269, 368], [444, 541], [3418, 3446]];
  const keep = lines.map((line, i) => {
    const n = i + 1;
    return removeRanges.some(([a, b]) => n >= a && n <= b) ? null : line;
  }).filter(l => l !== null);

  // Strip the outer IIFE wrapper: first line "(() => {" and last non-empty "})();"
  // so every remaining top-level declaration becomes a real ES module binding.
  if (keep[0].trim() !== '(() => {') throw new Error('unexpected first line: ' + keep[0]);
  let lastIdx = keep.length - 1;
  while (keep[lastIdx].trim() === '') lastIdx--;
  if (keep[lastIdx].trim() !== '})();') throw new Error('unexpected last line: ' + keep[lastIdx]);
  const body = keep.slice(1, lastIdx).join('\n');

  const header = [
    '// Main game engine: core flap gameplay, minigames, battles, pet care, store,',
    '// progression systems and UI wiring. This is the original single-file game\'s',
    '// logic, kept together deliberately: the code shares a dense web of mutable',
    '// top-level state (t, dist, shake, state, cur, bat, trail, ...) that many',
    '// short-named locals also shadow, which makes further splitting unsafe to do',
    '// mechanically without a real scope-aware refactor tool. catalog data, saves,',
    '// audio and legal text were safely extracted into their own modules below.',
    "import { save, setSave, persist, upLvl, clean, wipeTestSave, KEY } from './save.js';",
    `import { ${CATALOG_EXPORTS.join(', ')} } from './catalog.js';`,
    `import { ${AUDIO_EXPORTS.join(', ')} } from './audio.js';`,
    `import { ${LEGAL_EXPORTS.join(', ')} } from './legal.js';`,
    '',
  ].join('\n');

  let full = header + body + '\n\n// Exported for audio.js (music intensity) and native/firebase modules.\nexport { state };\n';

  // Reassignments of `save` must go through setSave() now that `save` is an
  // imported live binding owned by save.js (see save.js for details).
  const patches = [
    ["if (save.owner && save.owner !== uid) { const keep = { sfx:save.sfx, music:save.music, vib:save.vib }; save = { ...clean({}), ...keep }; refreshUI(); }",
     "if (save.owner && save.owner !== uid) { const keep = { sfx:save.sfx, music:save.music, vib:save.vib }; setSave({ ...clean({}), ...keep }); refreshUI(); }"],
    ["save = { ...c, ...keep }; applyOffline();",
     "setSave({ ...c, ...keep }); applyOffline();"],
    ["save = { ...clean({}), ...keep, rev:save.rev + 1 };",
     "setSave({ ...clean({}), ...keep, rev:save.rev + 1 });"],
  ];
  for (const [from, to] of patches) {
    if (!full.includes(from)) throw new Error('patch site not found: ' + from);
    full = full.split(from).join(to);
  }

  fs.writeFileSync(path.join(root, 'src/game/engine.js'), full);
}

console.log('split complete');
