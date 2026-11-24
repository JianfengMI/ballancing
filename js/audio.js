// All sounds are synthesised with WebAudio — no audio files to load.
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24];

export class Sfx {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.mat = { rollBase: 220, rollRange: 520, rollGain: 0.5, rollType: 'lowpass', landFreq: 180, landType: 'triangle', ring: 0 };
  }

  /** Ball material sound settings (see materials.js). */
  setMaterial(snd) {
    this.mat = snd;
    if (this.rollFilter) this.rollFilter.type = snd.rollType;
  }

  /** Call from a user gesture (tap/click/key) so mobile browsers allow audio. */
  unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.7;
      this.master.connect(this.ctx.destination);
      this._noiseBuf = this._makeNoise();
      this._initRoll();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.7, this.ctx.currentTime, 0.02);
  }

  _makeNoise() {
    const len = this.ctx.sampleRate * 2;
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      // brown-ish noise: smoother, more "rolling" than white noise
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      d[i] = last * 3.5;
    }
    return buf;
  }

  _initRoll() {
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    src.loop = true;
    this.rollFilter = this.ctx.createBiquadFilter();
    this.rollFilter.type = this.mat.rollType;
    this.rollFilter.Q.value = 0.7;
    this.rollFilter.frequency.value = 300;
    this.rollGain = this.ctx.createGain();
    this.rollGain.gain.value = 0;
    src.connect(this.rollFilter).connect(this.rollGain).connect(this.master);
    src.start();
  }

  /** Continuous rolling rumble; call every frame. */
  roll(speed, grounded) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const s = Math.min(speed / 8, 1.5);
    const m = this.mat;
    this.rollGain.gain.setTargetAtTime(grounded ? m.rollGain * s : 0, t, 0.05);
    this.rollFilter.frequency.setTargetAtTime(m.rollBase + s * m.rollRange, t, 0.05);
  }

  _tone(freq, { at = 0, dur = 0.15, type = 'sine', gain = 0.25, slide = null, attack = 0.005 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + at;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t0);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t0 + dur);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.connect(g).connect(this.master);
    o.start(t0);
    o.stop(t0 + dur + 0.02);
  }

  _noise({ at = 0, dur = 0.2, gain = 0.3, type = 'bandpass', freq = 1000, freqEnd = null, q = 1 } = {}) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + at;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuf;
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(freq, t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t0, Math.random());
    src.stop(t0 + dur + 0.02);
  }

  /** Gem pickup; pitch climbs with the combo count. */
  gem(combo) {
    const step = PENTA[Math.min(combo, PENTA.length - 1)];
    const f = 880 * Math.pow(2, step / 12);
    this._tone(f, { dur: 0.12, type: 'triangle', gain: 0.22 });
    this._tone(f * 1.5, { at: 0.06, dur: 0.18, type: 'sine', gain: 0.16 });
  }

  checkpoint() {
    [523, 659, 784].forEach((f, i) => this._tone(f, { at: i * 0.07, dur: 0.3, type: 'triangle', gain: 0.2 }));
  }

  fall() {
    this._tone(520, { dur: 0.7, type: 'sine', gain: 0.22, slide: 90 });
    this._noise({ dur: 0.7, gain: 0.25, freq: 1800, freqEnd: 200, q: 0.8 });
  }

  land(strength) {
    const g = Math.min(0.5, 0.06 * strength);
    const m = this.mat;
    this._tone(m.landFreq, { dur: 0.12, type: m.landType, gain: g, slide: m.landFreq / 2 });
    this._noise({ dur: 0.08, gain: g * 0.6, type: 'lowpass', freq: m.landFreq * 5 });
    if (m.ring) {
      // metallic clang: inharmonic partials that ring out
      [523, 1397, 2311].forEach((f, i) => this._tone(f, { dur: 0.5 - i * 0.1, type: 'sine', gain: g * (0.35 - i * 0.08) }));
    }
  }

  boost() {
    this._noise({ dur: 0.45, gain: 0.3, freq: 400, freqEnd: 4000, q: 2 });
    this._tone(300, { dur: 0.35, type: 'sawtooth', gain: 0.06, slide: 900 });
  }

  jump() {
    this._tone(220, { dur: 0.3, type: 'square', gain: 0.08, slide: 880 });
    this._tone(330, { dur: 0.3, type: 'sine', gain: 0.18, slide: 1320 });
  }

  hit() {
    this._tone(180, { dur: 0.18, type: 'square', gain: 0.15, slide: 90 });
    this._noise({ dur: 0.12, gain: 0.35, freq: 2500, q: 3 });
  }

  crack() {
    this._noise({ dur: 0.09, gain: 0.25, freq: 3000, q: 4 });
    this._noise({ at: 0.05, dur: 0.07, gain: 0.18, freq: 2200, q: 4 });
  }

  crumble() {
    this._noise({ dur: 0.4, gain: 0.25, type: 'lowpass', freq: 900, freqEnd: 150 });
  }

  beep(high) {
    this._tone(high ? 1046 : 523, { dur: high ? 0.35 : 0.15, type: 'square', gain: 0.09 });
  }

  win() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, { at: i * 0.11, dur: 0.35, type: 'triangle', gain: 0.22 }));
    this._tone(1318, { at: 0.48, dur: 0.7, type: 'triangle', gain: 0.18 });
    this._tone(784, { at: 0.48, dur: 0.7, type: 'sine', gain: 0.12 });
  }

  star(i) {
    this._tone(784 * Math.pow(2, (i * 4) / 12), { dur: 0.25, type: 'triangle', gain: 0.2 });
  }
}

export function vibrate(ms) {
  try { if (navigator.vibrate) navigator.vibrate(ms); } catch { /* unsupported */ }
}
