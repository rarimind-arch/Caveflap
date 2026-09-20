// App entry point. Loading the engine runs the game exactly as the original
// single-file game did (it wires up all DOM listeners and starts its own
// requestAnimationFrame loop on import).
import { applyStaticI18n } from './i18n/index.js';
applyStaticI18n();
import './game/engine.js';
