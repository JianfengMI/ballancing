// Degrees of tilt (beyond the dead zone) needed for full push, per sensitivity setting.
export const TILT_RANGE = { low: 40, normal: 30, high: 22 };
const DEAD = 3;      // degrees ignored around neutral (hand shake)
const JOY_RADIUS = 60;

// Softer near the centre (power curve) so small tilts give fine control.
function shape(d, range) {
  const a = Math.min(1, Math.max(0, Math.abs(d) - DEAD) / range);
  return Math.sign(d) * Math.pow(a, 1.6);
}

/**
 * Combines keyboard, device tilt and touch-drag into one vector:
 * x = right, y = forward, length <= 1.
 */
export class Input {
  constructor(canvas, joyEl, knobEl) {
    this.keys = new Set();
    this.useTilt = false;
    this.useTouch = false;
    this.enabled = false;
    this.tiltSeen = false;
    this.neutral = null;
    this.tiltTarget = { x: 0, y: 0 };
    this.tilt = { x: 0, y: 0 };
    this.touch = { x: 0, y: 0 };
    this.listening = false;
    this.tiltRange = TILT_RANGE.normal;
    this.joyEl = joyEl;
    this.knobEl = knobEl;

    const KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD'];
    window.addEventListener('keydown', (e) => {
      if (KEYS.includes(e.code)) { this.keys.add(e.code); e.preventDefault(); }
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());

    this._onOrient = this._onOrient.bind(this);

    let pid = null, ox = 0, oy = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (!this.useTouch || !this.enabled || pid !== null) return;
      pid = e.pointerId; ox = e.clientX; oy = e.clientY;
      this.joyEl.style.left = `${ox}px`;
      this.joyEl.style.top = `${oy}px`;
      this.joyEl.classList.remove('hidden');
      this.knobEl.style.transform = 'translate(-50%, -50%)';
    });
    canvas.addEventListener('pointermove', (e) => {
      if (e.pointerId !== pid) return;
      let dx = (e.clientX - ox) / JOY_RADIUS, dy = (e.clientY - oy) / JOY_RADIUS;
      const len = Math.hypot(dx, dy);
      if (len > 1) { dx /= len; dy /= len; }
      this.touch.x = dx; this.touch.y = -dy;
      this.knobEl.style.transform = `translate(calc(-50% + ${dx * JOY_RADIUS}px), calc(-50% + ${dy * JOY_RADIUS}px))`;
    });
    const end = (e) => {
      if (e.pointerId !== pid) return;
      pid = null; this.touch.x = 0; this.touch.y = 0;
      this.joyEl.classList.add('hidden');
    };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }

  /** Must be called synchronously from a user gesture (iOS permission prompt). */
  requestTilt() {
    const DOE = window.DeviceOrientationEvent;
    if (!DOE) return Promise.resolve(false);
    const ask = typeof DOE.requestPermission === 'function'
      ? DOE.requestPermission().then((r) => r === 'granted')
      : Promise.resolve(true);
    return ask.then((ok) => {
      if (ok && !this.listening) {
        window.addEventListener('deviceorientation', this._onOrient);
        this.listening = true;
      }
      return ok;
    }).catch(() => false);
  }

  /** Resolves true if a real tilt reading arrives within `ms`. */
  waitForTilt(ms = 1500) {
    return new Promise((resolve) => {
      const t0 = performance.now();
      const check = () => {
        if (this.tiltSeen) return resolve(true);
        if (performance.now() - t0 > ms) return resolve(false);
        setTimeout(check, 100);
      };
      check();
    });
  }

  /** The next tilt reading becomes "level". */
  calibrate() {
    this.neutral = null;
    this.tiltTarget.x = this.tiltTarget.y = 0;
    this.tilt.x = this.tilt.y = 0;
  }

  _onOrient(e) {
    if (e.beta == null || e.gamma == null) return;
    this.tiltSeen = true;
    if (!this.neutral) this.neutral = { b: e.beta, g: e.gamma };
    // gamma > 0: right edge down -> roll right. beta decreasing: top tipped away -> roll forward.
    this.tiltTarget.x = shape(e.gamma - this.neutral.g, this.tiltRange);
    this.tiltTarget.y = shape(-(e.beta - this.neutral.b), this.tiltRange);
  }

  reset() {
    this.keys.clear();
    this.touch.x = this.touch.y = 0;
    this.joyEl.classList.add('hidden');
  }

  get(dt) {
    let x = 0, y = 0;
    const k = this.keys;
    if (k.has('ArrowLeft') || k.has('KeyA')) x -= 1;
    if (k.has('ArrowRight') || k.has('KeyD')) x += 1;
    if (k.has('ArrowUp') || k.has('KeyW')) y += 1;
    if (k.has('ArrowDown') || k.has('KeyS')) y -= 1;

    if (this.useTilt) {
      const a = 1 - Math.exp(-dt * 10); // smoothing of sensor noise / hand jitter
      this.tilt.x += (this.tiltTarget.x - this.tilt.x) * a;
      this.tilt.y += (this.tiltTarget.y - this.tilt.y) * a;
      x += this.tilt.x; y += this.tilt.y;
    }
    if (this.useTouch) { x += this.touch.x; y += this.touch.y; }

    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    return { x, y };
  }
}
