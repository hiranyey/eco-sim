// Tiny synthesized sound effects (Web Audio). No asset files needed.
let ctx = null;
let muted = false;
try { muted = localStorage.getItem('hexmarch-muted') === '1'; } catch { /* storage unavailable */ }

function ac() {
  if (!ctx) {
    const C = window.AudioContext || window.webkitAudioContext;
    if (!C) return null;
    ctx = new C();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

function tone(freq, dur, { type = 'sine', vol = 0.15, slide = 0, delay = 0 } = {}) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const o = a.createOscillator();
  const g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur, { vol = 0.2, delay = 0, freq = 1200 } = {}) {
  if (muted) return;
  const a = ac();
  if (!a) return;
  const t = a.currentTime + delay;
  const buf = a.createBuffer(1, Math.floor(a.sampleRate * dur), a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = a.createBufferSource();
  src.buffer = buf;
  const f = a.createBiquadFilter();
  f.type = 'bandpass';
  f.frequency.value = freq;
  const g = a.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(a.destination);
  src.start(t);
}

export const sfx = {
  select: () => tone(660, 0.06, { type: 'triangle', vol: 0.08 }),
  move: () => tone(220, 0.07, { type: 'triangle', vol: 0.06, slide: 60 }),
  hit: () => { noise(0.12, { vol: 0.35, freq: 900 }); tone(140, 0.12, { type: 'square', vol: 0.05, slide: -60 }); },
  arrow: () => { noise(0.08, { vol: 0.15, freq: 3000 }); tone(900, 0.08, { type: 'sine', vol: 0.04, slide: -500 }); },
  kill: () => { noise(0.25, { vol: 0.35, freq: 500 }); tone(110, 0.3, { type: 'sawtooth', vol: 0.06, slide: -70 }); },
  capture: () => [523, 659, 784].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.1, delay: i * 0.09 })),
  coin: () => { tone(1320, 0.07, { type: 'square', vol: 0.04 }); tone(1760, 0.1, { type: 'square', vol: 0.04, delay: 0.06 }); },
  build: () => [392, 523].forEach((f, i) => tone(f, 0.12, { type: 'triangle', vol: 0.09, delay: i * 0.08 })),
  bad: () => [330, 262].forEach((f, i) => tone(f, 0.2, { type: 'sawtooth', vol: 0.05, delay: i * 0.12 })),
  turn: () => [392, 494].forEach((f, i) => tone(f, 0.14, { type: 'sine', vol: 0.08, delay: i * 0.1 })),
  event: () => [523, 392, 523].forEach((f, i) => tone(f, 0.16, { type: 'triangle', vol: 0.07, delay: i * 0.1 })),
  win: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.35, { type: 'triangle', vol: 0.1, delay: i * 0.14 })),
  lose: () => [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, { type: 'sine', vol: 0.09, delay: i * 0.18 })),
};

export function isMuted() { return muted; }
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('hexmarch-muted', m ? '1' : '0'); } catch { /* ignore */ }
}
