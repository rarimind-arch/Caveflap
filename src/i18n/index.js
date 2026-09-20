// Minimal, dependency-free i18n: language files are flat key -> string maps,
// with {placeholders} for interpolation. English is the fallback for any
// missing key so a partial translation never breaks the UI.
import en from './en.json';
import lt from './lt.json';

const LANGS = { en, lt };
export const LANG_NAMES = { en: 'English', lt: 'Lietuvių' };
const STORAGE_KEY = 'caveflap-lang';

function detect() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && LANGS[saved]) return saved;
  } catch (e) {}
  const nav = (navigator.language || 'en').slice(0, 2).toLowerCase();
  return LANGS[nav] ? nav : 'en';
}

let lang = detect();
const listeners = new Set();

export function getLang() { return lang; }

export function setLang(next) {
  if (!LANGS[next] || next === lang) return;
  lang = next;
  try { localStorage.setItem(STORAGE_KEY, lang); } catch (e) {}
  for (const fn of listeners) fn(lang);
}

export function onLangChange(fn) { listeners.add(fn); return () => listeners.delete(fn); }

export function t(key, vars) {
  let str = LANGS[lang][key] ?? LANGS.en[key] ?? key;
  if (vars) for (const k in vars) str = str.split('{' + k + '}').join(String(vars[k]));
  return str;
}

// Applies data-i18n / data-i18n-attr markup found in static HTML.
export function applyStaticI18n(root = document) {
  root.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.getAttribute('data-i18n')); });
  root.querySelectorAll('[data-i18n-placeholder]').forEach(el => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-placeholder'))); });
  root.querySelectorAll('[data-i18n-aria-label]').forEach(el => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria-label'))); });
  root.querySelectorAll('[data-i18n-title]').forEach(el => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
}

onLangChange(() => applyStaticI18n());
