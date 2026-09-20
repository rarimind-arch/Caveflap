// Tiny pure helpers shared by modules that sit outside the main engine.
// Identical implementations to the ones kept in engine.js's own preamble
// (duplicated on purpose to avoid a risky cross-module rename of these very
// short, easily-shadowed names inside the dense main engine file).
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const arr = v => Array.isArray(v) ? v.slice() : [];
export const num = (v, d = 0) => { const n = Number(v); return isFinite(n) ? n : d; };
