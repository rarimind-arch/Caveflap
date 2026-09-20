// All sound and music: synthesized in code via Web Audio, no audio files.
// Extracted verbatim from the original single-file game.
import { save } from './save.js';
import { state } from './engine.js';
import { clamp } from './util.js';

  // ---------- audio + haptics ----------
  // Everything is synthesized in code: no audio files, no copyright issues.
  let AC = null, BUS = null;
  function ac() {
    if (!AC) {
      try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { return null; }
      // Two buses sharing a soft cave echo.
      const echo = AC.createDelay(1), fb = AC.createGain(), wet = AC.createGain(), lp = AC.createBiquadFilter();
      echo.delayTime.value = .19; fb.gain.value = .28; wet.gain.value = .22; lp.type = 'lowpass'; lp.frequency.value = 2600;
      echo.connect(lp).connect(fb).connect(echo); lp.connect(wet).connect(AC.destination);
      const mk = () => { const g = AC.createGain(); g.connect(AC.destination); g.connect(echo); return g; };
      BUS = { sfx:mk(), music:mk() };
    }
    if (AC.state === 'suspended') AC.resume();
    return AC;
  }
  function tone(f, dur, type = 'sine', vol = .12, f2 = 0, delay = 0, bus = 'sfx') {
    vol *= bus === 'music' ? save.musicVol : save.sfxVol;
    if (vol < .0005) return;
    const a = ac(); if (!a) return;
    const t0 = a.currentTime + Math.max(0, delay), o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t0);
    if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + Math.min(.02, dur * .2)); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(BUS[bus]); o.start(t0); o.stop(t0 + dur + 0.03);
  }
  const bell = (f, dur, vol, delay = 0, bus = 'sfx') => { tone(f, dur, 'sine', vol, 0, delay, bus); tone(f * 2.01, dur * .55, 'sine', vol * .35, 0, delay, bus); tone(f * 3.03, dur * .3, 'sine', vol * .15, 0, delay, bus); };
  function noise(dur, vol, opt = {}) {
    const bus = opt.bus || 'sfx';
    vol *= bus === 'music' ? save.musicVol : save.sfxVol; if (vol < .0005) return;
    const a = ac(); if (!a) return;
    const buf = a.createBuffer(1, Math.max(1, Math.floor(a.sampleRate * dur)), a.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
    f.type = opt.type || 'lowpass'; f.frequency.value = opt.freq || 900; g.gain.value = vol;
    s.buffer = buf; s.connect(f).connect(g).connect(BUS[bus]); s.start(a.currentTime + Math.max(0, opt.delay || 0));
  }
  const SFX = {
    flap:   () => { noise(.09, .12, { type:'bandpass', freq:1400 }); tone(420, .1, 'triangle', .07, 700); },
    score:  () => { bell(880, .18, .07); bell(1320, .22, .06, .06); },
    coin:   () => { bell(1320, .25, .09); bell(1976, .3, .06, .05); },
    hit:    () => { noise(.3, .4, { freq:600 }); tone(140, .45, 'sawtooth', .12, 38); tone(70, .5, 'sine', .18, 35); },
    level:  () => [523, 659, 784, 1047].forEach((f, i) => { bell(f, .35, .08, i * .08); tone(f / 2, .3, 'triangle', .04, 0, i * .08); }),
    buy:    () => { bell(660, .25, .09); bell(990, .35, .09, .08); noise(.15, .06, { type:'highpass', freq:5000, delay:.08 }); },
    deny:   () => { tone(220, .14, 'square', .05, 160); tone(180, .2, 'square', .05, 120, .1); },
    click:  () => { tone(620, .045, 'triangle', .06, 520); noise(.02, .04, { type:'highpass', freq:3000 }); },
    eat:    () => [0, .12, .24].forEach(d => { noise(.06, .12, { type:'bandpass', freq:900, delay:d }); tone(260, .06, 'square', .04, 180, d); }),
    bubble: () => tone(700 + Math.random() * 600, .09, 'sine', .07, 1600),
    power:  () => { [440, 660, 880, 1175].forEach((f, i) => bell(f, .2, .06, i * .05)); noise(.35, .08, { type:'highpass', freq:4000 }); },
    shield: () => { noise(.2, .25, { type:'bandpass', freq:2200 }); tone(900, .35, 'sine', .1, 260); },
    claim:  () => { [659, 784, 988, 1319].forEach((f, i) => bell(f, .3, .08, i * .07)); noise(.4, .06, { type:'highpass', freq:6000, delay:.2 }); },
    medal:  () => { [523, 784, 1047, 1568, 2093].forEach((f, i) => bell(f, .5, .08, i * .06)); tone(131, .6, 'triangle', .08); },
    giggle: () => { tone(760, .07, 'sine', .07, 1000); tone(880, .08, 'sine', .07, 1180, .08); tone(990, .08, 'sine', .06, 1300, .16); },
  };
  const sfx = n => { if (save.sfxVol > 0) try { SFX[n](); } catch (e) {} };
  const vib = ms => { if (save.vib && navigator.vibrate) try { navigator.vibrate(ms); } catch (e) {} };

  // ---------- music: one generated loop per cave ----------
  const MUSIC = {
    amethyst:{ bpm:88,  root:220,   scale:[0, 3, 5, 7, 10],        prog:[0, 3, 4, 2], lead:'triangle', bass:'sine',     drums:1, density:.45 },
    magma:   { bpm:112, root:196,   scale:[0, 1, 4, 5, 7, 8, 10],  prog:[0, 1, 0, 5], lead:'square',   bass:'sawtooth', drums:2, density:.55 },
    glacier: { bpm:76,  root:261.6, scale:[0, 2, 4, 6, 7, 9, 11],  prog:[0, 4, 5, 3], lead:'sine',     bass:'sine',     drums:0, density:.35, bells:true },
    emerald: { bpm:100, root:246.9, scale:[0, 2, 3, 5, 7, 9, 10],  prog:[0, 3, 4, 3], lead:'triangle', bass:'triangle', drums:1, density:.5 },
    abyss:   { bpm:66,  root:164.8, scale:[0, 2, 3, 7, 8],         prog:[0, 3, 1, 4], lead:'sine',     bass:'sine',     drums:0, density:.3, bells:true },
  };
  const semi = (root, n) => root * Math.pow(2, n / 12);
  let mNext = 0, mStep = 0, mLeadIdx = 2, mTheme = null;
  function noteOf(th, deg, oct = 0) { const sc = th.scale, i = ((deg % sc.length) + sc.length) % sc.length, o = Math.floor(deg / sc.length); return semi(th.root, sc[i] + 12 * (o + oct)); }
  setInterval(() => {
    if (save.musicVol <= 0 || !AC || document.hidden || AC.state !== 'running') { mNext = 0; return; }
    const th = MUSIC[save.cave] || MUSIC.amethyst;
    if (th !== mTheme) { mTheme = th; mStep = 0; mNext = 0; }
    const intense = state === 'play' || state === 'mini' || state === 'battle', sp = 60 / (th.bpm * (intense ? 1.08 : 1)) / 4;
    const now = AC.currentTime;
    if (!mNext || mNext < now) mNext = now + .05;
    while (mNext < now + .15) {
      const step = mStep % 16, bar = Math.floor(mStep / 16) % th.prog.length, chord = th.prog[bar], d = mNext - now;
      if (step === 0) {
        [0, 2, 4].forEach(k => tone(noteOf(th, chord + k, -1), sp * 16 * .95, 'sine', .018, 0, d, 'music'));
        tone(noteOf(th, chord, -2), sp * 7, th.bass, th.bass === 'sine' ? .09 : .035, 0, d, 'music');
      }
      if (step === 8) tone(noteOf(th, chord, -2), sp * 6, th.bass, th.bass === 'sine' ? .07 : .03, 0, d, 'music');
      if (th.drums >= 2 && (step === 6 || step === 14)) tone(noteOf(th, chord + 4, -2), sp * 2, th.bass, .025, 0, d, 'music');
      if ((th.drums || intense) && (step === 0 || step === 8 || (th.drums >= 2 && step === 10))) { tone(120, .18, 'sine', .14, 45, d, 'music'); }
      if ((th.drums || intense) && step % 4 === 2) noise(.05, .05, { type:'highpass', freq:7000, bus:'music', delay:d });
      if (th.drums >= 2 && step === 4 || th.drums >= 2 && step === 12) noise(.12, .07, { type:'bandpass', freq:1800, bus:'music', delay:d });
      if (step % 2 === 0 && Math.random() < th.density * (intense ? 1.1 : .8)) {
        mLeadIdx = clamp(mLeadIdx + [-2, -1, -1, 1, 1, 2, 0][Math.floor(Math.random() * 7)], 0, th.scale.length * 2);
        const f = noteOf(th, chord + mLeadIdx, 1);
        if (th.bells) bell(f, sp * 6, .035, d, 'music'); else tone(f, sp * (Math.random() < .3 ? 4 : 2), th.lead, th.lead === 'square' ? .015 : .035, 0, d, 'music');
      }
      mNext += sp; mStep++;
    }
  }, 30);
  window.addEventListener('pointerdown', () => ac(), { once:true });
  window.addEventListener('keydown', () => ac(), { once:true });
  window.addEventListener('touchend', () => ac(), { once:true });


export { AC, BUS, MUSIC, SFX, ac, bell, mNext, mStep, mLeadIdx, mTheme, noise, noteOf, semi, sfx, tone, vib };
